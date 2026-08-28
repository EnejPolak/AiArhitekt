import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { geocodeAddress } from "@/lib/geocode/service";
import { GEOCODING_ERROR_CODES } from "@/lib/geocode/types";
import { searchPlaces, type SearchResult } from "@/lib/places/placesService";
import { PlacesError, PLACES_ERROR_CODES } from "@/lib/places/errors";
import { buildStoreDiscoveryPlan } from "@/lib/places/retailTaxonomy";
import { validateAndNormalizeAllowlist } from "@/lib/serp/domains";
import {
  runCanonicalSerpSearch,
  type CanonicalSerpSearchInput,
  type CanonicalSerpSearchOutcome,
} from "@/lib/serp/search";
import { loadReusableRoomAnalysis } from "@/lib/analysis/analyze";
import { projectIdSchema } from "@/lib/projects/schema";
import { claimProductDiscoverySlot } from "./claim";
import {
  DEFAULT_DISCOVERY_RADIUS_KM,
  DISCOVERY_DEADLINE_MS,
  DISCOVERY_SERP_TIMEOUT_MS,
  MAX_DISCOVERY_RADIUS_KM,
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
import { enrichDiscoveryWinners } from "./enrichWinners";
import {
  deleteProjectProductDiscovery,
  getProjectProductDiscovery,
  getProjectProductSelections,
  persistProductDiscoveryResult,
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
  geocodeAddress?: typeof geocodeAddress;
  searchPlaces?: typeof searchPlaces;
  searchSerp?: (input: CanonicalSerpSearchInput) => Promise<CanonicalSerpSearchOutcome>;
};

function clampRadiusKm(value: number | undefined): number {
  const n = Number.isFinite(value) ? Math.round(Number(value)) : DEFAULT_DISCOVERY_RADIUS_KM;
  return Math.min(MAX_DISCOVERY_RADIUS_KM, Math.max(1, n));
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
  const locationInput = normalizeLocationInput(locationInputRaw);
  const radiusKm = clampRadiusKm(options.radiusKm);
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
      existing.sourcePreferencesHash === preferenceFingerprint.hash &&
      isCurrentProductDiscovery(existing, analysis, {
        locationInput,
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
  logDiscoveryAttempt({ attemptId, phase: "started", startedAt });

  let geocodeMs = 0;
  let placesMs = 0;
  let serpMs = 0;
  let persistMs = 0;
  let providerRequests = 0;
  let cacheHits = 0;
  let logicalQueries = 0;

  const geocode = options.geocodeAddress ?? geocodeAddress;
  const placesSearch = options.searchPlaces ?? searchPlaces;
  const serpSearch = options.searchSerp ?? runCanonicalSerpSearch;

  const geoStarted = Date.now();
  const geo = await geocode(locationInput);
  geocodeMs = Date.now() - geoStarted;
  if (!geo.ok) {
    throw mapGeocodeFailure(geo.code);
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
        elapsedMs: totalMs,
        serpRequests: providerRequests,
        attemptId,
        cacheHits,
        logicalQueries,
        ...error.details,
      });
    }
    throw error;
  }
  serpMs = Date.now() - serpStarted;

  if (resolved.unmatched.some((item) => item.reason === "search_interrupted")) {
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
      phase: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      totalMs: Date.now() - discoveryStarted,
      errorCode: code,
      message: typedError.message,
    });
    throw typedError;
  }

  unmatched.push(...resolved.unmatched);
  let selections = resolved.selections;

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
    phase: "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    totalMs,
    resultType: "success",
  });

  return { ...persisted, reused: false };
}
