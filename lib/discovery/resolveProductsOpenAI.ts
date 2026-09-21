import type { PlaceResult } from "@/lib/places/placesService";
import type {
  CanonicalSerpSearchInput,
  CanonicalSerpSearchOutcome,
} from "@/lib/serp/search";
import { unmatchedRequirementSchema, type SearchableRequirement, type UnmatchedRequirement } from "./itemSpecs";
import { mapCanonicalPickedToSelection, type CanonicalSelectionFields } from "./mapProduct";
import {
  type ResolvedDiscoverySelection,
  type ResolveProductsResult,
  type SerpUsageSnapshot,
} from "./resolveProducts";
import { DiscoveryError, discoveryErrorMessage } from "./errors";
import { DISCOVERY_OPENAI_MIN_REMAINING_MS } from "./constants";
import { rankRequirementCandidates } from "./style/rankCandidates";
import { mergeRankedCandidatePool } from "./candidatePool";
import type { RankedProductCandidate } from "./style/types";

export type OpenAIProductSearch = (
  input: CanonicalSerpSearchInput
) => Promise<CanonicalSerpSearchOutcome>;

function emptyUsage(pass: number): SerpUsageSnapshot {
  return {
    budgetStart: 0,
    providerAttempts: 0,
    providerSuccesses: 0,
    providerFailures: 0,
    providerRequestsUsed: 0,
    cacheHits: 0,
    logicalQueries: 0,
    budgetRemaining: 0,
    pass,
  };
}

function asSingletonRanked(
  product: CanonicalSelectionFields,
  score: number
): RankedProductCandidate {
  return {
    product,
    hardValid: true,
    hardGateReasons: [],
    fidelity: null,
    serpScore: score,
    serpConfidence: 1,
    styleFit: null,
    finalScore: score,
  };
}

function queryForRequirement(requirement: SearchableRequirement): string {
  return requirement.queryPlan[0] || requirement.itemSpec;
}

function isDeadlineSkip(outcome: CanonicalSerpSearchOutcome, item: string): boolean {
  if (!outcome.ok) return false;
  const row = outcome.response.productDiscoveryResults?.find((result) => result.requestedItem === item);
  return row?.diagnostics?.errorCode === "deadline";
}

/**
 * One-shot OpenAI Step C resolution for the room-renovation customer path.
 * Does not use SerpAPI budgets, fastMode, or multi-level query fallback.
 */
export async function resolveProductsWithOpenAI(
  searched: SearchableRequirement[],
  searchOpenAI: OpenAIProductSearch,
  input: {
    allowlistDomains: string[];
    deadlineAt?: number;
    minRemainingBeforeRequestMs?: number;
    marketContext?: {
      countryCode?: string | null;
      formattedLocation?: string | null;
      merchantDomains?: string[];
    };
  },
  stores: PlaceResult[]
): Promise<ResolveProductsResult> {
  if (searched.length === 0) {
    return {
      selections: [],
      unmatched: [],
      candidatePools: [],
      serpUsage: emptyUsage(1),
      interrupted: false,
      stopReason: "none",
    };
  }

  const items = searched.map(queryForRequirement);
  const outcome = await searchOpenAI({
    items,
    allowlistDomains: input.allowlistDomains,
    deadlineAt: input.deadlineAt,
    minRemainingBeforeRequestMs:
      input.minRemainingBeforeRequestMs ?? DISCOVERY_OPENAI_MIN_REMAINING_MS,
    marketContext: input.marketContext,
  });

  if (!outcome.ok) {
    if (outcome.error === "OPENAI_API_KEY not configured") {
      throw new DiscoveryError("openai_unconfigured", discoveryErrorMessage("openai_unconfigured"));
    }
    throw new DiscoveryError("search_interrupted", discoveryErrorMessage("search_interrupted"), undefined, {
      stage: "openai_product_discovery",
      canonicalError: outcome.error,
      providerStatus: outcome.httpStatus,
    });
  }

  const byItem = new Map(outcome.response.results.map((row) => [row.item, row]));
  const selections: ResolvedDiscoverySelection[] = [];
  const unmatched: UnmatchedRequirement[] = [];
  const candidatePools: ResolveProductsResult["candidatePools"] = [];
  let interrupted = false;
  let stopReason: ResolveProductsResult["stopReason"] = "none";

  for (const requirement of searched) {
    const query = queryForRequirement(requirement);
    const row = byItem.get(query);
    const ranking = rankRequirementCandidates({
      requirement,
      serpResult: row ?? { item: query, topCandidates: [], picked: null },
      query,
      queryLevel: 0,
      maxLevel: 1,
      stores,
    });
    const picked = mapCanonicalPickedToSelection(row?.picked, stores);
    let candidates = ranking.ranked;
    if (picked) {
      candidates = mergeRankedCandidatePool(candidates, [
        asSingletonRanked(picked, row?.picked?.score ?? 80),
      ]);
    }
    candidatePools.push({ requirement, candidates });

    const winner = ranking.winner ?? (picked ? asSingletonRanked(picked, row?.picked?.score ?? 80) : candidates[0]);
    if (winner) {
      selections.push({
        requirementType: requirement.requirementType,
        requirementKey: requirement.requirementKey,
        requirementSnapshot: {
          ...requirement.snapshot,
          displayLabel: requirement.displayLabel,
          provenance: requirement.provenance,
          styleFit: winner.styleFit,
          discoveryQuery: query,
          discoveryQueryLevel: 1,
          searchLocale: requirement.searchLocale,
          searchCountryCode: requirement.searchCountryCode ?? null,
        },
        itemSpec: requirement.itemSpec,
        product: winner.product as CanonicalSelectionFields,
      });
      continue;
    }

    const deadlineSkip = isDeadlineSkip(outcome, query);
    if (deadlineSkip) {
      interrupted = true;
      stopReason = "deadline";
    }
    unmatched.push(
      unmatchedRequirementSchema.parse({
        requirementKey: requirement.requirementKey,
        requirementType: requirement.requirementType,
        itemSpec: requirement.itemSpec,
        displayLabel: requirement.displayLabel,
        reason: deadlineSkip ? ("search_interrupted" as const) : ("no_valid_product" as const),
      })
    );
  }

  const usage: SerpUsageSnapshot = {
    budgetStart: 0,
    providerAttempts: outcome.response.providerAttempts ?? outcome.response.executedCount,
    providerSuccesses: outcome.response.providerSuccesses ?? 0,
    providerFailures: outcome.response.providerFailures ?? 0,
    providerRequestsUsed: outcome.response.providerAttempts ?? outcome.response.executedCount,
    cacheHits: outcome.response.cacheHits ?? 0,
    logicalQueries: outcome.response.logicalQueries ?? items.length,
    budgetRemaining: 0,
    pass: 1,
  };

  return {
    selections,
    unmatched,
    candidatePools,
    serpUsage: usage,
    interrupted,
    stopReason,
  };
}
