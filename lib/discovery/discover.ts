import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { geocodeAddress } from "@/lib/geocode/service";
import { GEOCODING_ERROR_CODES } from "@/lib/geocode/types";
import {
  clampSearchRadiusKm,
  isValidSearchCoordinate,
  type ProjectLocation,
} from "@/lib/project-location/parse";
import { searchPlaces, type SearchResult } from "@/lib/places/placesService";
import { PlacesError, PLACES_ERROR_CODES } from "@/lib/places/errors";
import { buildStoreDiscoveryPlan } from "@/lib/places/retailTaxonomy";
import { validateAndNormalizeAllowlist } from "@/lib/serp/domains";
import {
  runCanonicalSerpSearch,
  type CanonicalSerpSearchInput,
  type CanonicalSerpSearchOutcome,
} from "@/lib/serp/search";
import { runOpenAIProductDiscovery } from "@/lib/productDiscovery/search";
import { loadReusableRoomAnalysis } from "@/lib/analysis/analyze";
import { projectIdSchema } from "@/lib/projects/schema";
import { claimProductDiscoverySlot } from "./claim";
import {
  DISCOVERY_DEADLINE_MS,
  DISCOVERY_OPENAI_MIN_REMAINING_MS,
  DISCOVERY_SERP_MIN_REMAINING_MS,
  DISCOVERY_SERP_TIMEOUT_MS,
  MAX_LOCATION_INPUT_LENGTH,
  MIN_LOCATION_INPUT_LENGTH,
  PER_DISCOVERY_SERP_BUDGET,
} from "./constants";
import { DiscoveryError, discoveryErrorMessage, logDiscoveryAttempt, logDiscoveryError, logDiscoveryTiming } from "./errors";
import {
  unmatchedRequirementSchema,
  type UnmatchedRequirement,
} from "./itemSpecs";
import { resolveShoppingRequirements } from "./resolveRequirements";
import { localizeSearchableRequirements } from "./locales";
import { resolveProductsForRequirements } from "./resolveProducts";
import { resolveProductsWithOpenAI } from "./resolveProductsOpenAI";
import { enrichDiscoveryWinners } from "./enrichWinners";
import { ensureProductReferenceAssets } from "@/lib/references/ensure";
import type { FetchLike } from "@/lib/references/fetchImage";
import type { AddressLookup } from "@/lib/references/ssrf";
import {
  deprioritizeBlockedMerchantCandidates,
  evaluateCandidateRenderReadyWithFetch,
  isRejectedCandidateUrl,
  isRequiredUnresolvedReason,
  markSlotUserRemoved,
  recoveryExcludeProductUrls,
  referenceFetchBlockedDomains,
  requirementRetrySearchHints,
  resolveCompleteRoomSelections,
  resolveRequirementSlot,
  selectionFromRenderReadyCandidate,
} from "./completeRoom";
import { rankRequirementCandidates } from "./style/rankCandidates";
import {
  deleteProjectProductDiscovery,
  getProjectProductDiscovery,
  getProjectProductSelections,
  insertReadyProductSelection,
  persistProductDiscoveryResult,
  updateDiscoveryUnmatchedRequirements,
} from "./queries";
import type { ShoppingPreferenceInput } from "./preferences";
import { shoppingPreferenceFingerprint } from "./preferenceHash";
import { isCurrentProductDiscovery, isDiscoveryAnalysisCurrent } from "./stale";
import type { ProductDiscoveryView, ProductSelectionView } from "./types";

type Client = SupabaseClient<Database>;

export type DiscoverProjectProductsOptions = {
  force?: boolean;
  radiusKm?: number;
  ownerUserId: string;
  persistClient: Client;
  preferences?: ShoppingPreferenceInput | null;
  attemptId?: string;
  projectLocation?: ProjectLocation | null;
  persistResolvedLocation?: (location: ProjectLocation) => Promise<void>;
  geocodeAddress?: typeof geocodeAddress;
  searchPlaces?: typeof searchPlaces;
  /** Customer path default is OpenAI Step C. */
  searchProducts?: typeof runOpenAIProductDiscovery;
  /** Legacy test/injection hook for SerpAPI resolver. Not used by the room-renovation wizard. */
  searchSerp?: (input: CanonicalSerpSearchInput) => Promise<CanonicalSerpSearchOutcome>;
  /** Optional HTTP hooks for post-persist reference acquisition. Tests inject a blocked fetch. */
  fetch?: FetchLike;
  lookup?: AddressLookup;
};

function clampRadiusKm(value: number | undefined): number {
  return clampSearchRadiusKm(value);
}

function normalizeLocationInput(value: string): string {
  const trimmed = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (
    trimmed.length < MIN_LOCATION_INPUT_LENGTH ||
    trimmed.length > MAX_LOCATION_INPUT_LENGTH
  ) {
    throw new DiscoveryError("invalid_input", discoveryErrorMessage("invalid_input"));
  }
  return trimmed;
}

function mapGeocodeFailure(code: string): DiscoveryError {
  switch (code) {
    case GEOCODING_ERROR_CODES.DISABLED:
      return new DiscoveryError("geocoding_disabled", discoveryErrorMessage("geocoding_disabled"));
    case GEOCODING_ERROR_CODES.QUOTA_REACHED:
      return new DiscoveryError("geocoding_quota", discoveryErrorMessage("geocoding_quota"));
    case GEOCODING_ERROR_CODES.REQUEST_DENIED:
      return new DiscoveryError("geocoding_denied", discoveryErrorMessage("geocoding_denied"));
    case GEOCODING_ERROR_CODES.NOT_CONFIGURED:
      return new DiscoveryError("geocoding_disabled", discoveryErrorMessage("geocoding_disabled"));
    default:
      return new DiscoveryError("geocoding_failed", discoveryErrorMessage("geocoding_failed"));
  }
}

function mapEmptyPlacesOutcome(places: SearchResult): DiscoveryError {
  switch (places.outcome) {
    case PLACES_ERROR_CODES.NO_PLACES_CANDIDATES:
      return new DiscoveryError("no_place_candidates", discoveryErrorMessage("no_place_candidates"));
    case PLACES_ERROR_CODES.STORES_FOUND_BUT_FILTERED:
      return new DiscoveryError(
        "stores_found_but_filtered",
        discoveryErrorMessage("stores_found_but_filtered")
      );
    case PLACES_ERROR_CODES.NO_VALID_STORE_DOMAINS:
      return new DiscoveryError("no_valid_store_domains", discoveryErrorMessage("no_valid_store_domains"));
    default:
      return new DiscoveryError("no_local_retailers", discoveryErrorMessage("no_local_retailers"));
  }
}

function storeAllowlist(places: SearchResult): string[] {
  const raw = places.allowlistDomainsStores?.length
    ? places.allowlistDomainsStores
    : places.domains.stores;
  return validateAndNormalizeAllowlist(raw);
}

export async function loadCurrentProductDiscovery(
  client: Client,
  projectId: string
): Promise<{ discovery: ProductDiscoveryView; selections: ProductSelectionView[] } | null> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return null;

  const analysis = await loadReusableRoomAnalysis(client, parsed.data);
  const discovery = await getProjectProductDiscovery(client, parsed.data);
  if (!discovery) return null;

  if (!analysis || !isDiscoveryAnalysisCurrent(discovery, analysis)) {
    await deleteProjectProductDiscovery(client, parsed.data);
    return null;
  }

  const selections = await getProjectProductSelections(client, discovery.id);
  return { discovery, selections };
}

export async function discoverProjectProducts(
  client: Client,
  projectId: string,
  locationInputRaw: string,
  options: DiscoverProjectProductsOptions
): Promise<{ discovery: ProductDiscoveryView; selections: ProductSelectionView[]; reused: boolean }> {
  const parsedId = projectIdSchema.safeParse(projectId);
  if (!parsedId.success) {
    throw new DiscoveryError("invalid_input", discoveryErrorMessage("invalid_input"));
  }
  const storedLocation =
    options.projectLocation &&
    isValidSearchCoordinate(options.projectLocation.latitude, options.projectLocation.longitude)
      ? options.projectLocation
      : null;
  const rawOrStoredInput =
    locationInputRaw.trim() || options.projectLocation?.locationInput || "";
  const locationInput = storedLocation
    ? storedLocation.locationInput
    : rawOrStoredInput
      ? normalizeLocationInput(rawOrStoredInput)
      : "";
  if (!locationInput) {
    throw new DiscoveryError("location_required", discoveryErrorMessage("location_required"));
  }
  const radiusKm = clampRadiusKm(storedLocation?.radiusKm ?? options.radiusKm);
  const force = Boolean(options.force);

  const analysis = await loadReusableRoomAnalysis(client, parsedId.data);
  if (!analysis) {
    throw new DiscoveryError("missing_analysis", discoveryErrorMessage("missing_analysis"));
  }

  const preferenceFingerprint = shoppingPreferenceFingerprint(options.preferences);

  if (!force) {
    const existing = await getProjectProductDiscovery(client, parsedId.data);
    if (
      existing &&
      isCurrentProductDiscovery(existing, analysis, {
        locationInput,
        latitude: storedLocation?.latitude,
        longitude: storedLocation?.longitude,
        radiusKm,
        preferences: options.preferences,
      })
    ) {
      const selections = await getProjectProductSelections(client, existing.id);
      return { discovery: existing, selections, reused: true };
    }
  }

  await claimProductDiscoverySlot(client, parsedId.data);

  const attemptId = options.attemptId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const discoveryStarted = Date.now();
  const deadlineAt = discoveryStarted + DISCOVERY_DEADLINE_MS;
  logDiscoveryAttempt({ attemptId, projectId: parsedId.data, phase: "started", startedAt });

  let geocodeMs = 0;
  let placesMs = 0;
  let serpMs = 0;
  let persistMs = 0;
  let providerRequests = 0;
  let cacheHits = 0;
  let logicalQueries = 0;

  const geocode = options.geocodeAddress ?? geocodeAddress;
  const placesSearch = options.searchPlaces ?? searchPlaces;
  const useLegacySerp = Boolean(options.searchSerp) && !options.searchProducts;
  const productSearch = options.searchProducts ?? runOpenAIProductDiscovery;
  const serpSearch = options.searchSerp ?? runCanonicalSerpSearch;

  let geo: { lat: number; lng: number; countryCode: string | null; formattedAddress?: string };
  const geoStarted = Date.now();
  if (storedLocation) {
    geo = {
      lat: storedLocation.latitude,
      lng: storedLocation.longitude,
      countryCode: storedLocation.countryCode,
      formattedAddress: storedLocation.formattedAddress ?? storedLocation.locationInput,
    };
    geocodeMs = 0;
  } else {
    if (!locationInput) {
      throw new DiscoveryError("location_required", discoveryErrorMessage("location_required"));
    }
    const geoResult = await geocode(locationInput);
    geocodeMs = Date.now() - geoStarted;
    if (!geoResult.ok) {
      throw mapGeocodeFailure(geoResult.code);
    }
    if (!isValidSearchCoordinate(geoResult.lat, geoResult.lng)) {
      throw new DiscoveryError("location_invalid", discoveryErrorMessage("location_invalid"));
    }
    geo = {
      lat: geoResult.lat,
      lng: geoResult.lng,
      countryCode: geoResult.countryCode,
      formattedAddress: geoResult.formattedAddress,
    };
    if (options.persistResolvedLocation) {
      await options.persistResolvedLocation({
        locationInput,
        formattedAddress: geoResult.formattedAddress ?? locationInput,
        latitude: geoResult.lat,
        longitude: geoResult.lng,
        radiusKm,
        countryCode: geoResult.countryCode,
      });
    }
  }
  if (!isValidSearchCoordinate(geo.lat, geo.lng)) {
    throw new DiscoveryError("location_invalid", discoveryErrorMessage("location_invalid"));
  }

  const { searched, notSearched } = resolveShoppingRequirements({
    analysisRequirements: analysis.design_requirements,
    preferences: options.preferences,
  });
  const unmatched: UnmatchedRequirement[] = notSearched.map((item) =>
    unmatchedRequirementSchema.parse({
      requirementKey: item.requirementKey,
      requirementType: item.requirementType,
      itemSpec: item.itemSpec,
      displayLabel: item.displayLabel,
      reason: "not_searched" as const,
    })
  );

  if (searched.length === 0) {
    const persisted = await persistProductDiscoveryResult(
      options.persistClient,
      options.ownerUserId,
      {
        projectId: parsedId.data,
        sourceAnalysisId: analysis.id,
        sourceAnalysisUpdatedAt: analysis.updated_at,
        locationInput,
        latitude: geo.lat,
        longitude: geo.lng,
        radiusKm,
        searchedItemCount: 0,
        notSearchedCount: unmatched.length,
        allowlistDomains: [],
        unmatchedRequirements: unmatched,
        sourcePreferences: preferenceFingerprint.snapshot,
        sourcePreferencesHash: preferenceFingerprint.hash,
        selections: [],
      },
      client
    );
    return { ...persisted, reused: false };
  }

  const storePlan = buildStoreDiscoveryPlan(searched);
  let places: SearchResult;
  const placesStarted = Date.now();
  try {
    places = await placesSearch({
      lat: geo.lat,
      lng: geo.lng,
      radiusKm,
      includeContractors: false,
      storePlan,
    });
  } catch (error) {
    if (error instanceof PlacesError && error.code === PLACES_ERROR_CODES.PLACES_QUOTA_EXCEEDED) {
      throw new DiscoveryError("places_quota", discoveryErrorMessage("places_quota"));
    }
    if (error instanceof PlacesError && error.code === PLACES_ERROR_CODES.PLACES_RATE_LIMITED) {
      throw new DiscoveryError("places_rate_limited", discoveryErrorMessage("places_rate_limited"));
    }
    throw new DiscoveryError("places_failed", discoveryErrorMessage("places_failed"));
  }
  placesMs = Date.now() - placesStarted;

  const allowlistDomains = storeAllowlist(places);
  if (allowlistDomains.length === 0) {
    throw mapEmptyPlacesOutcome(places);
  }

  const searchedForSerp = localizeSearchableRequirements(
    searched,
    geo.countryCode,
    options.preferences?.selectedStyles
  );

  const serpStarted = Date.now();
  let resolved;
  try {
    if (useLegacySerp) {
      resolved = await resolveProductsForRequirements(
        searchedForSerp,
        serpSearch,
        {
          allowlistDomains,
          domainCategoryMap: places.domainCategoryMapStores,
          retryOnTimeout: false,
          providerTimeoutMs: DISCOVERY_SERP_TIMEOUT_MS,
        },
        places.stores,
        {
          serpBudget: PER_DISCOVERY_SERP_BUDGET,
          deadlineAt,
          onSerpUsage: (usage) => {
            providerRequests = usage.providerAttempts;
            cacheHits = usage.cacheHits;
            logicalQueries = usage.logicalQueries;
          },
        }
      );
    } else {
      resolved = await resolveProductsWithOpenAI(
        searchedForSerp,
        productSearch,
        {
          allowlistDomains,
          deadlineAt,
          minRemainingBeforeRequestMs: DISCOVERY_OPENAI_MIN_REMAINING_MS,
          marketContext: {
            countryCode: geo.countryCode,
            formattedLocation: geo.formattedAddress ?? locationInput,
            merchantDomains: allowlistDomains,
          },
        },
        places.stores
      );
      providerRequests = resolved.serpUsage.providerAttempts;
      cacheHits = resolved.serpUsage.cacheHits;
      logicalQueries = resolved.serpUsage.logicalQueries;
    }
  } catch (error) {
    serpMs = Date.now() - serpStarted;
    const totalMs = Date.now() - discoveryStarted;
    logDiscoveryTiming({
      geocodeMs,
      placesMs,
      serpMs,
      persistMs: 0,
      totalMs,
      serpRequests: providerRequests,
      cacheHits,
      logicalQueries,
      attemptId,
      resultType: "failed",
    });
    logDiscoveryAttempt({
      attemptId,
      projectId: parsedId.data,
      phase: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      totalMs,
      errorCode: error instanceof DiscoveryError ? error.code : "failed",
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof DiscoveryError) {
      logDiscoveryError(error, {
        stage: "resolve_products",
        attemptId,
        elapsedMs: totalMs,
        serpRequests: providerRequests,
        cacheHits,
        logicalQueries,
        ...error.details,
      });
    }
    throw error;
  }
  serpMs = Date.now() - serpStarted;

  if (
    useLegacySerp &&
    resolved.unmatched.some((item) => item.reason === "search_interrupted")
  ) {
    const code: DiscoveryError["code"] =
      resolved.stopReason === "deadline"
        ? "discovery_timeout"
        : resolved.stopReason === "budget"
          ? "discovery_budget_exhausted"
          : "search_interrupted";
    const typedError = new DiscoveryError(code, discoveryErrorMessage(code), undefined, {
      stage: "serp",
      serpRequests: resolved.serpUsage.providerAttempts,
      providerAttempts: resolved.serpUsage.providerAttempts,
      elapsedMs: Date.now() - discoveryStarted,
      attemptId,
      cacheHits: resolved.serpUsage.cacheHits,
      logicalQueries: resolved.serpUsage.logicalQueries,
    });
    logDiscoveryError(typedError, typedError.details ?? {});
    logDiscoveryAttempt({
      attemptId,
      projectId: parsedId.data,
      phase: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      totalMs: Date.now() - discoveryStarted,
      errorCode: code,
      message: typedError.message,
    });
    throw typedError;
  }

  const resolvedSlots = await resolveCompleteRoomSelections({
    searched: searchedForSerp,
    pools: resolved.candidatePools,
    searchUnmatched: resolved.unmatched,
    evaluate: (candidate) =>
      evaluateCandidateRenderReadyWithFetch(candidate, {
        fetch: options.fetch,
        lookup: options.lookup,
      }),
    recover: async ({ requirement, rejected }) => {
      const query = requirement.queryPlan[0] || requirement.itemSpec;
      const outcome = useLegacySerp
        ? await serpSearch({
            items: [query],
            allowlistDomains,
            domainCategoryMap: places.domainCategoryMapStores,
            retryOnTimeout: false,
            providerTimeoutMs: DISCOVERY_SERP_TIMEOUT_MS,
            deadlineAt,
            minRemainingBeforeRequestMs: DISCOVERY_SERP_MIN_REMAINING_MS,
          })
        : await productSearch({
            items: [query],
            allowlistDomains,
            deadlineAt,
            minRemainingBeforeRequestMs: DISCOVERY_OPENAI_MIN_REMAINING_MS,
            excludeProductUrls: recoveryExcludeProductUrls(rejected),
            referenceFetchBlockedDomains: referenceFetchBlockedDomains(rejected),
            marketContext: {
              countryCode: geo.countryCode,
              formattedLocation: geo.formattedAddress ?? locationInput,
              merchantDomains: allowlistDomains,
            },
          });
      if (!outcome.ok) return [];
      const row = outcome.response.results.find((item) => item.item === query) ?? outcome.response.results[0];
      if (!row) return [];
      const ranking = rankRequirementCandidates({
        requirement,
        serpResult: row,
        query,
        queryLevel: 0,
        maxLevel: 1,
        stores: places.stores,
      });
      const blockedDomains = referenceFetchBlockedDomains(rejected);
      const ranked = ranking.ranked
        .filter((candidate) => !isRejectedCandidateUrl(rejected, candidate.product.productUrl))
        .sort((left, right) => {
          const imageDelta =
            Number(right.product.hasReferenceImage) - Number(left.product.hasReferenceImage);
          if (imageDelta !== 0) return imageDelta;
          return right.finalScore - left.finalScore;
        });
      return deprioritizeBlockedMerchantCandidates(ranked, blockedDomains);
    },
  });

  unmatched.push(...resolvedSlots.unmatched);
  let selections = resolvedSlots.selections;

  const enrichmentStarted = Date.now();
  const enrichedWinners = await enrichDiscoveryWinners(selections, {
    allowlistDomains,
    deadlineAt,
  });
  selections = enrichedWinners.selections;
  const enrichmentMs = Date.now() - enrichmentStarted;

  const persistStarted = Date.now();
  const persisted = await persistProductDiscoveryResult(
    options.persistClient,
    options.ownerUserId,
    {
      projectId: parsedId.data,
      sourceAnalysisId: analysis.id,
      sourceAnalysisUpdatedAt: analysis.updated_at,
      locationInput,
      latitude: geo.lat,
      longitude: geo.lng,
      radiusKm,
      searchedItemCount: searched.length,
      notSearchedCount: unmatched.length,
      allowlistDomains,
      unmatchedRequirements: unmatched,
      sourcePreferences: preferenceFingerprint.snapshot,
      sourcePreferencesHash: preferenceFingerprint.hash,
      selections,
    },
    client
  );
  persistMs = Date.now() - persistStarted;

  const selectionsWithEvidence = persisted.selections.map((row) => {
    const source = selections.find((item) => item.requirementKey === row.requirementKey);
    return {
      ...row,
      imageEvidence: source?.product.imageEvidence?.length
        ? source.product.imageEvidence
        : row.imageEvidence,
    };
  });
  try {
    await ensureProductReferenceAssets({
      persistClient: options.persistClient,
      ownerUserId: options.ownerUserId,
      projectId: parsedId.data,
      selections: selectionsWithEvidence,
      fetch: options.fetch,
      lookup: options.lookup,
    });
  } catch {
    // Image acquisition must not un-FOUND a persisted product.
  }
  const refreshed = await getProjectProductSelections(client, persisted.discovery.id);
  const selectionsOut =
    refreshed.length === persisted.selections.length ? refreshed : persisted.selections;

  const totalMs = Date.now() - discoveryStarted;
  logDiscoveryTiming({
    geocodeMs,
    placesMs,
    serpMs,
    persistMs,
    totalMs,
    serpRequests: resolved.serpUsage.providerAttempts,
    cacheHits: resolved.serpUsage.cacheHits,
    logicalQueries: resolved.serpUsage.logicalQueries,
    attemptId,
    resultType: "success",
  });
  logDiscoveryAttempt({
    attemptId,
    projectId: parsedId.data,
    phase: "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    totalMs,
    resultType: "success",
  });

  return { discovery: persisted.discovery, selections: selectionsOut, reused: false };
}

function searchableFromUnmatched(
  item: UnmatchedRequirement
): import("./itemSpecs").SearchableRequirement {
  if (item.requirementType === "material") {
    return {
      requirementType: "material",
      requirementKey: item.requirementKey,
      itemSpec: item.itemSpec,
      queryPlan: [item.itemSpec],
      displayLabel: item.displayLabel,
      snapshot: {
        surface: "unknown",
        category: item.itemSpec,
        finishDirection: null,
        constraints: [],
      },
    };
  }
  return {
    requirementType: "furniture",
    requirementKey: item.requirementKey,
    itemSpec: item.itemSpec,
    queryPlan: [item.itemSpec],
    displayLabel: item.displayLabel,
    snapshot: {
      category: item.itemSpec,
      quantity: 1,
      placementNotes: null,
      constraints: [],
    },
  };
}

export async function removeRequirementFromDesign(
  client: Client,
  projectId: string,
  requirementKey: string,
  options: { persistClient: Client }
): Promise<{ discovery: ProductDiscoveryView; selections: ProductSelectionView[] }> {
  const loaded = await loadCurrentProductDiscovery(client, projectId);
  if (!loaded) {
    throw new DiscoveryError("missing_analysis", discoveryErrorMessage("missing_analysis"));
  }
  const unmatched = loaded.discovery.unmatchedRequirements.map((item) =>
    item.requirementKey === requirementKey && isRequiredUnresolvedReason(item.reason)
      ? markSlotUserRemoved(item)
      : item
  );
  await updateDiscoveryUnmatchedRequirements(
    options.persistClient,
    loaded.discovery.id,
    unmatched
  );
  const discovery = await getProjectProductDiscovery(client, projectId);
  if (!discovery) {
    throw new DiscoveryError("failed", discoveryErrorMessage("failed"));
  }
  return { discovery, selections: loaded.selections };
}

export async function retryUnresolvedRequirement(
  client: Client,
  projectId: string,
  requirementKey: string,
  options: {
    ownerUserId: string;
    persistClient: Client;
    searchProducts?: typeof runOpenAIProductDiscovery;
    fetch?: FetchLike;
    lookup?: AddressLookup;
  }
): Promise<{ discovery: ProductDiscoveryView; selections: ProductSelectionView[] }> {
  const loaded = await loadCurrentProductDiscovery(client, projectId);
  if (!loaded) {
    throw new DiscoveryError("missing_analysis", discoveryErrorMessage("missing_analysis"));
  }
  const unmatchedItem = loaded.discovery.unmatchedRequirements.find(
    (item) => item.requirementKey === requirementKey && isRequiredUnresolvedReason(item.reason)
  );
  if (!unmatchedItem) {
    return loaded;
  }

  const requirement = searchableFromUnmatched(unmatchedItem);
  const productSearch = options.searchProducts ?? runOpenAIProductDiscovery;
  const allowlistDomains = loaded.discovery.allowlistDomains;
  const rejected = unmatchedItem.rejectedCandidates ?? [];
  const marketContext = {
    formattedLocation: loaded.discovery.locationInput,
    merchantDomains: allowlistDomains,
  };

  const searchRanked = async (nextRejected: typeof rejected) => {
    const nextHints = requirementRetrySearchHints(nextRejected);
    const query = requirement.itemSpec;
    const outcome = await productSearch({
      items: [query],
      allowlistDomains,
      excludeProductUrls: nextHints.excludeProductUrls,
      referenceFetchBlockedDomains: nextHints.referenceFetchBlockedDomains,
      marketContext,
    });
    const row = outcome.ok
      ? outcome.response.results.find((item) => item.item === query) ??
        outcome.response.results[0]
      : undefined;
    if (!row) return [];
    const ranking = rankRequirementCandidates({
      requirement,
      serpResult: row,
      query,
      queryLevel: 0,
      maxLevel: 1,
      stores: [],
    });
    return deprioritizeBlockedMerchantCandidates(
      ranking.ranked.filter(
        (candidate) => !isRejectedCandidateUrl(nextRejected, candidate.product.productUrl)
      ),
      nextHints.referenceFetchBlockedDomains
    );
  };

  const rankingCandidates = await searchRanked(rejected);
  const slot = await resolveRequirementSlot({
    requirement,
    candidates: rankingCandidates,
    rejected,
    recoverySearchesUsed: 0,
    evaluate: (candidate) =>
      evaluateCandidateRenderReadyWithFetch(candidate, {
        fetch: options.fetch,
        lookup: options.lookup,
      }),
    recover: async ({ rejected: nextRejected }) => searchRanked(nextRejected),
  });

  if (slot.status === "ready" && slot.selected) {
    const ready = selectionFromRenderReadyCandidate(requirement, slot.selected);
    await insertReadyProductSelection(options.persistClient, {
      projectId,
      discoveryId: loaded.discovery.id,
      selection: ready,
    });
    const remaining = loaded.discovery.unmatchedRequirements.filter(
      (item) => item.requirementKey !== requirementKey
    );
    await updateDiscoveryUnmatchedRequirements(options.persistClient, loaded.discovery.id, remaining);
    const selections = await getProjectProductSelections(client, loaded.discovery.id);
    const created = selections.find((item) => item.requirementKey === requirementKey);
    if (created) {
      await ensureProductReferenceAssets({
        persistClient: options.persistClient,
        ownerUserId: options.ownerUserId,
        projectId,
        selections: [created],
        fetch: options.fetch,
        lookup: options.lookup,
      });
    }
    const refreshed = await getProjectProductSelections(client, loaded.discovery.id);
    const discovery = await getProjectProductDiscovery(client, projectId);
    if (!discovery) {
      throw new DiscoveryError("failed", discoveryErrorMessage("failed"));
    }
    return { discovery, selections: refreshed };
  }

  const nextUnmatched = loaded.discovery.unmatchedRequirements.map((item) =>
    item.requirementKey === requirementKey
      ? {
          ...item,
          rejectedCandidates: slot.rejected,
          recoverySearchesUsed: slot.recoverySearchesUsed,
        }
      : item
  );
  await updateDiscoveryUnmatchedRequirements(
    options.persistClient,
    loaded.discovery.id,
    nextUnmatched
  );
  const discovery = await getProjectProductDiscovery(client, projectId);
  if (!discovery) {
    throw new DiscoveryError("failed", discoveryErrorMessage("failed"));
  }
  return { discovery, selections: loaded.selections };
}
