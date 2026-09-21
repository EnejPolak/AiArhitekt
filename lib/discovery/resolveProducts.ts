import type { PlaceResult } from "@/lib/places/placesService";
import type {
  CanonicalSerpSearchInput,
  CanonicalSerpSearchOutcome,
} from "@/lib/serp/search";
import {
  DISCOVERY_SERP_MIN_REMAINING_MS,
  PER_DISCOVERY_SERP_BUDGET,
} from "./constants";
import { resolveProductConcept } from "./locales/concepts";
import { DiscoveryError, discoveryErrorMessage, logDiscoveryError } from "./errors";
import {
  unmatchedRequirementSchema,
  type FurnitureNeed,
  type MaterialNeed,
  type SearchableRequirement,
  type UnmatchedRequirement,
} from "./itemSpecs";
import type { CanonicalSelectionFields } from "./mapProduct";
import { rankRequirementCandidates } from "./style/rankCandidates";
import { normalizeSelectedStyles, styleRankingEnabled } from "./style/normalizeStyles";
import { resolveStyleQueryStopAction } from "./style/stopPolicy";
import type { RankedProductCandidate, StyleFitResult } from "./style/types";
import { isProductionDeployment } from "@/lib/env/deployment";
import { mergeRankedCandidatePool, type RequirementCandidatePool } from "./candidatePool";

export const MAX_DISCOVERY_QUERY_LEVELS = 3;

type PendingWinner = {
  requirement: SearchableRequirement;
  winner: RankedProductCandidate;
  query: string;
  level: number;
};

type DiscoveryQueryTrace = {
  requirementKey: string;
  concept: string;
  countryCode: string | null;
  searchLocale: string;
  queryLevel: number;
  query: string;
  retailerDomain?: string | null;
  candidateTitle?: string;
  semanticMatch: boolean;
  styleScore?: number | null;
  picked: boolean;
  reason: string;
};

export type SerpUsageSnapshot = {
  budgetStart: number;
  /** Dispatched provider attempts (success + failure; excludes cache hits). */
  providerAttempts: number;
  providerSuccesses: number;
  providerFailures: number;
  /** @deprecated alias — same as providerAttempts */
  providerRequestsUsed: number;
  cacheHits: number;
  logicalQueries: number;
  budgetRemaining: number;
  pass: number;
};

export type ResolveProductsOptions = {
  serpBudget?: number;
  deadlineAt?: number;
  onSerpUsage?: (usage: SerpUsageSnapshot) => void;
};

export type ResolveProductsResult = {
  selections: ResolvedDiscoverySelection[];
  unmatched: UnmatchedRequirement[];
  candidatePools: RequirementCandidatePool[];
  serpUsage: SerpUsageSnapshot;
  interrupted: boolean;
  stopReason: "none" | "budget" | "deadline" | "provider_error";
};

function logDiscoveryQueryTrace(trace: DiscoveryQueryTrace): void {
  if (isProductionDeployment()) return;
  console.info("[discovery-query]", trace);
}

function logDiscoveryBudget(usage: SerpUsageSnapshot): void {
  if (isProductionDeployment()) return;
  console.info("[discovery-budget]", {
    pass: usage.pass,
    budgetStart: usage.budgetStart,
    providerAttempts: usage.providerAttempts,
    providerSuccesses: usage.providerSuccesses,
    providerFailures: usage.providerFailures,
    cacheHits: usage.cacheHits,
    logicalQueries: usage.logicalQueries,
    budgetRemaining: usage.budgetRemaining,
  });
}

function remainingMs(deadlineAt?: number): number | null {
  if (!deadlineAt) return null;
  return deadlineAt - Date.now();
}

function assertDeadline(deadlineAt: number | undefined, stage: string, usage: SerpUsageSnapshot): void {
  const left = remainingMs(deadlineAt);
  if (left == null || left >= DISCOVERY_SERP_MIN_REMAINING_MS) return;
  const error = new DiscoveryError("discovery_timeout", discoveryErrorMessage("discovery_timeout"), undefined, {
    stage,
    serpRequests: usage.providerAttempts,
    providerAttempts: usage.providerAttempts,
    elapsedMs: undefined,
  });
  logDiscoveryError(error, { stage, serpRequests: usage.providerAttempts, providerAttempts: usage.providerAttempts });
  throw error;
}

export type ResolvedDiscoverySelection = {
  requirementType: "furniture" | "material";
  requirementKey: string;
  requirementSnapshot: (FurnitureNeed | MaterialNeed) & {
    displayLabel?: string;
    provenance?: SearchableRequirement["provenance"];
    styleFit?: StyleFitResult | null;
    discoveryQuery: string;
    discoveryQueryLevel: number;
    searchLocale?: string;
    searchCountryCode?: string | null;
  };
  itemSpec: string;
  product: CanonicalSelectionFields;
};

function throwIfSerpFailed(
  serp: CanonicalSerpSearchOutcome,
  context: { requirementKey?: string; queryLevel?: number; providerAttempts: number }
): asserts serp is Extract<CanonicalSerpSearchOutcome, { ok: true }> {
  if (serp.ok) return;
  const canonicalError = serp.error;
  const canonicalDetails = serp.details;
  if (serp.httpStatus === 429 || serp.error === "Daily SERP cap reached") {
    const error = new DiscoveryError("serp_quota", discoveryErrorMessage("serp_quota"), undefined, {
      stage: "serp",
      serpRequests: context.providerAttempts,
      providerAttempts: context.providerAttempts,
      requirementKey: context.requirementKey,
      queryLevel: context.queryLevel,
      providerStatus: serp.httpStatus,
      canonicalError,
      canonicalDetails,
    });
    logDiscoveryError(error, error.details ?? {});
    throw error;
  }
  if (serp.error === "SERPAPI_KEY not configured") {
    throw new DiscoveryError("serp_unconfigured", discoveryErrorMessage("serp_unconfigured"));
  }
  if (serp.httpStatus === 408 || /timeout|abort/i.test(serp.error ?? "")) {
    const error = new DiscoveryError("provider_timeout", discoveryErrorMessage("provider_timeout"), undefined, {
      stage: "serp",
      serpRequests: context.providerAttempts,
      providerAttempts: context.providerAttempts,
      requirementKey: context.requirementKey,
      queryLevel: context.queryLevel,
      canonicalError,
      canonicalDetails,
    });
    logDiscoveryError(error, error.details ?? {});
    throw error;
  }
  const error = new DiscoveryError("search_interrupted", discoveryErrorMessage("search_interrupted"), undefined, {
    stage: "serp",
    serpRequests: context.providerAttempts,
    providerAttempts: context.providerAttempts,
    requirementKey: context.requirementKey,
    queryLevel: context.queryLevel,
    providerStatus: serp.httpStatus,
    canonicalError,
    canonicalDetails,
  });
  logDiscoveryError(error, error.details ?? {});
  throw error;
}

function serpHasRetrievableData(
  serpResult: { topCandidates?: unknown[]; picked?: unknown | null } | undefined
): boolean {
  return (serpResult?.topCandidates?.length ?? 0) > 0 || Boolean(serpResult?.picked);
}

function pushSelection(
  selections: ResolvedDiscoverySelection[],
  pending: PendingWinner
): void {
  selections.push({
    requirementType: pending.requirement.requirementType,
    requirementKey: pending.requirement.requirementKey,
    requirementSnapshot: {
      ...pending.requirement.snapshot,
      displayLabel: pending.requirement.displayLabel,
      provenance: pending.requirement.provenance,
      styleFit: pending.winner.styleFit,
      discoveryQuery: pending.query,
      discoveryQueryLevel: pending.level + 1,
      searchLocale: pending.requirement.searchLocale,
      searchCountryCode: pending.requirement.searchCountryCode ?? null,
    },
    itemSpec: pending.requirement.itemSpec,
    product: pending.winner.product,
  });
}

function trackCrossLevelBest(
  pendingBest: Map<string, PendingWinner>,
  requirement: SearchableRequirement,
  winner: RankedProductCandidate,
  query: string,
  level: number
): PendingWinner {
  const existing = pendingBest.get(requirement.requirementKey);
  if (!existing || winner.finalScore > existing.winner.finalScore) {
    const next: PendingWinner = { requirement, winner, query, level };
    pendingBest.set(requirement.requirementKey, next);
    return next;
  }
  return existing;
}

function snapshotUsage(
  budgetStart: number,
  providerAttempts: number,
  providerSuccesses: number,
  providerFailures: number,
  cacheHits: number,
  logicalQueries: number,
  pass: number
): SerpUsageSnapshot {
  return {
    budgetStart,
    providerAttempts,
    providerSuccesses,
    providerFailures,
    providerRequestsUsed: providerAttempts,
    cacheHits,
    logicalQueries,
    budgetRemaining: Math.max(0, budgetStart - providerAttempts),
    pass,
  };
}

function absorbSerpUsage(
  serp: Extract<CanonicalSerpSearchOutcome, { ok: true }>
): {
  providerAttempts: number;
  providerSuccesses: number;
  providerFailures: number;
  cacheHits: number;
  logicalQueries: number;
} {
  return {
    providerAttempts: serp.response.providerAttempts ?? serp.response.providerRequests ?? 0,
    providerSuccesses: serp.response.providerSuccesses ?? 0,
    providerFailures: serp.response.providerFailures ?? 0,
    cacheHits: serp.response.cacheHits ?? 0,
    logicalQueries: serp.response.logicalQueries ?? 0,
  };
}

export async function resolveProductsForRequirements(
  searched: SearchableRequirement[],
  searchSerp: (input: CanonicalSerpSearchInput) => Promise<CanonicalSerpSearchOutcome>,
  serpInputBase: Omit<CanonicalSerpSearchInput, "items">,
  stores: PlaceResult[],
  options: ResolveProductsOptions = {}
): Promise<ResolveProductsResult> {
  const serpBudget = options.serpBudget ?? PER_DISCOVERY_SERP_BUDGET;
  let providerAttempts = 0;
  let providerSuccesses = 0;
  let providerFailures = 0;
  let cacheHits = 0;
  let logicalQueries = 0;

  const remaining = [...searched];
  const levelByKey = new Map(searched.map((item) => [item.requirementKey, 0]));
  const pendingBest = new Map<string, PendingWinner>();
  const candidatePoolByKey = new Map<string, RankedProductCandidate[]>();
  const selections: ResolvedDiscoverySelection[] = [];
  const selectedKeys = new Set<string>();
  const interruptedKeys = new Set<string>();
  const providerFailureKeys = new Set<string>();
  const everHadSerpDataKeys = new Set<string>();
  let stopReason: ResolveProductsResult["stopReason"] = "none";

  for (let pass = 0; pass < MAX_DISCOVERY_QUERY_LEVELS && remaining.length > 0; pass++) {
    const usageBeforePass = snapshotUsage(
      serpBudget,
      providerAttempts,
      providerSuccesses,
      providerFailures,
      cacheHits,
      logicalQueries,
      pass + 1
    );
    options.onSerpUsage?.(usageBeforePass);
    logDiscoveryBudget(usageBeforePass);

    if (providerAttempts >= serpBudget) {
      stopReason = "budget";
      for (const requirement of remaining) interruptedKeys.add(requirement.requirementKey);
      break;
    }

    try {
      assertDeadline(options.deadlineAt, "resolve_products_pass", usageBeforePass);
    } catch (error) {
      stopReason = "deadline";
      for (const requirement of remaining) interruptedKeys.add(requirement.requirementKey);
      throw error;
    }

    const queries: string[] = [];
    const seen = new Set<string>();
    for (const requirement of remaining) {
      const level = levelByKey.get(requirement.requirementKey) ?? 0;
      const query = requirement.queryPlan[level] ?? requirement.itemSpec;
      if (!query || seen.has(query)) continue;
      seen.add(query);
      queries.push(query);
    }
    if (queries.length === 0) break;

    const remainingBudget = Math.max(0, serpBudget - providerAttempts);
    if (remainingBudget === 0) {
      stopReason = "budget";
      for (const requirement of remaining) interruptedKeys.add(requirement.requirementKey);
      break;
    }

    const serp = await searchSerp({
      ...serpInputBase,
      items: queries,
      maxRequests: remainingBudget,
      fastMode: true,
      deadlineAt: options.deadlineAt,
      minRemainingBeforeRequestMs: DISCOVERY_SERP_MIN_REMAINING_MS,
    });

    if (serp.ok) {
      const usageDelta = absorbSerpUsage(serp);
      providerAttempts += usageDelta.providerAttempts;
      providerSuccesses += usageDelta.providerSuccesses;
      providerFailures += usageDelta.providerFailures;
      cacheHits += usageDelta.cacheHits;
      logicalQueries += usageDelta.logicalQueries;
      if (serp.response.stoppedReason === "deadline") {
        stopReason = "deadline";
      } else if (serp.response.stoppedReason === "budget") {
        stopReason = "budget";
      }
    }

    throwIfSerpFailed(serp, { providerAttempts });

    const usageAfterPass = snapshotUsage(
      serpBudget,
      providerAttempts,
      providerSuccesses,
      providerFailures,
      cacheHits,
      logicalQueries,
      pass + 1
    );
    options.onSerpUsage?.(usageAfterPass);
    logDiscoveryBudget(usageAfterPass);

    if (stopReason === "deadline") {
      for (const requirement of remaining) {
        if (!selectedKeys.has(requirement.requirementKey)) {
          interruptedKeys.add(requirement.requirementKey);
        }
      }
      break;
    }

    const byItem = new Map(serp.response.results.map((row) => [row.item, row]));
    const failuresByItem = new Map<string, number>();
    for (const failure of serp.response.queryFailures ?? []) {
      failuresByItem.set(failure.item, (failuresByItem.get(failure.item) ?? 0) + 1);
    }
    const nextRemaining: SearchableRequirement[] = [];

    for (const requirement of remaining) {
      if (selectedKeys.has(requirement.requirementKey)) continue;

      const level = levelByKey.get(requirement.requirementKey) ?? 0;
      const query = requirement.queryPlan[level] ?? requirement.itemSpec;
      const serpResult = byItem.get(query);
      const failuresForQuery = failuresByItem.get(query) ?? 0;
      const hasRetrievableData = serpHasRetrievableData(serpResult);
      if (hasRetrievableData) {
        everHadSerpDataKeys.add(requirement.requirementKey);
      }
      if (failuresForQuery > 0 && !hasRetrievableData) {
        providerFailureKeys.add(requirement.requirementKey);
      }
      const maxLevel = Math.min(requirement.queryPlan.length, MAX_DISCOVERY_QUERY_LEVELS);
      const styleEnabled = styleRankingEnabled(
        normalizeSelectedStyles(requirement.selectedStyles),
        requirement.requirementType
      );
      const ranking = rankRequirementCandidates({
        requirement,
        serpResult: serpResult ?? { item: query, topCandidates: [], picked: null },
        query,
        queryLevel: level,
        maxLevel,
        stores,
      });
      if (ranking.ranked.length > 0) {
        candidatePoolByKey.set(
          requirement.requirementKey,
          mergeRankedCandidatePool(candidatePoolByKey.get(requirement.requirementKey) ?? [], ranking.ranked)
        );
      }

      if (ranking.winner) {
        trackCrossLevelBest(pendingBest, requirement, ranking.winner, query, level);

        const stopAction = resolveStyleQueryStopAction({
          styleEnabled,
          currentStyleScore: ranking.winner.styleFit?.score ?? null,
          queryLevel: level,
          maxLevel,
        });

        if (stopAction === "accept_and_stop") {
          const selected: PendingWinner = { requirement, winner: ranking.winner, query, level };
          logDiscoveryQueryTrace({
            requirementKey: requirement.requirementKey,
            concept: resolveProductConcept(requirement),
            countryCode: requirement.searchCountryCode ?? null,
            searchLocale: requirement.searchLocale ?? "en",
            queryLevel: level + 1,
            query,
            retailerDomain: selected.winner.product.retailerDomain,
            candidateTitle: selected.winner.product.productTitle,
            semanticMatch: true,
            styleScore: selected.winner.styleFit?.score ?? null,
            picked: true,
            reason: styleEnabled ? "style_acceptance_stop" : "best_fidelity_stop",
          });
          pushSelection(selections, selected);
          selectedKeys.add(requirement.requirementKey);
          continue;
        }

        if (stopAction === "finalize_cross_level") {
          const selected = pendingBest.get(requirement.requirementKey)!;
          logDiscoveryQueryTrace({
            requirementKey: requirement.requirementKey,
            concept: resolveProductConcept(requirement),
            countryCode: requirement.searchCountryCode ?? null,
            searchLocale: requirement.searchLocale ?? "en",
            queryLevel: selected.level + 1,
            query: selected.query,
            retailerDomain: selected.winner.product.retailerDomain,
            candidateTitle: selected.winner.product.productTitle,
            semanticMatch: true,
            styleScore: selected.winner.styleFit?.score ?? null,
            picked: true,
            reason: "cross_level_best",
          });
          pushSelection(selections, selected);
          selectedKeys.add(requirement.requirementKey);
          continue;
        }

        const nextLevel = level + 1;
        if (nextLevel < requirement.queryPlan.length && nextLevel < MAX_DISCOVERY_QUERY_LEVELS) {
          levelByKey.set(requirement.requirementKey, nextLevel);
          nextRemaining.push(requirement);
        } else {
          const selected = pendingBest.get(requirement.requirementKey)!;
          pushSelection(selections, selected);
          selectedKeys.add(requirement.requirementKey);
        }
        continue;
      }

      logDiscoveryQueryTrace({
        requirementKey: requirement.requirementKey,
        concept: resolveProductConcept(requirement),
        countryCode: requirement.searchCountryCode ?? null,
        searchLocale: requirement.searchLocale ?? "en",
        queryLevel: level + 1,
        query,
        semanticMatch: false,
        picked: false,
        reason: "no_valid_product",
      });

      const nextLevel = level + 1;
      if (nextLevel < requirement.queryPlan.length && nextLevel < MAX_DISCOVERY_QUERY_LEVELS) {
        levelByKey.set(requirement.requirementKey, nextLevel);
        nextRemaining.push(requirement);
      } else if (pendingBest.has(requirement.requirementKey)) {
        const selected = pendingBest.get(requirement.requirementKey)!;
        pushSelection(selections, selected);
        selectedKeys.add(requirement.requirementKey);
      }
    }

    remaining.splice(0, remaining.length, ...nextRemaining.filter((item) => !selectedKeys.has(item.requirementKey)));

    if (stopReason === "budget" && remaining.length > 0) {
      for (const requirement of remaining) interruptedKeys.add(requirement.requirementKey);
      break;
    }
  }

  for (const [key, pending] of pendingBest.entries()) {
    if (selectedKeys.has(key)) continue;
    pushSelection(selections, pending);
    selectedKeys.add(key);
  }

  const unmatched = searched
    .filter((item) => !selectedKeys.has(item.requirementKey))
    .map((item) => {
      const providerIncomplete =
        providerFailureKeys.has(item.requirementKey) && !everHadSerpDataKeys.has(item.requirementKey);
      const interrupted = interruptedKeys.has(item.requirementKey) || providerIncomplete;
      return unmatchedRequirementSchema.parse({
        requirementKey: item.requirementKey,
        requirementType: item.requirementType,
        itemSpec: item.itemSpec,
        displayLabel: item.displayLabel,
        reason: interrupted ? ("search_interrupted" as const) : ("no_valid_product" as const),
      });
    });

  return {
    selections,
    unmatched,
    candidatePools: searched.map((requirement) => ({
      requirement,
      candidates: candidatePoolByKey.get(requirement.requirementKey) ?? [],
    })),
    serpUsage: snapshotUsage(
      serpBudget,
      providerAttempts,
      providerSuccesses,
      providerFailures,
      cacheHits,
      logicalQueries,
      MAX_DISCOVERY_QUERY_LEVELS
    ),
    interrupted: unmatched.some((item) => item.reason === "search_interrupted"),
    stopReason,
  };
}
