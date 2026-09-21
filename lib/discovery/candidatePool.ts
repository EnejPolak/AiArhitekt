import type { RankedProductCandidate } from "./style/types";
import type { SearchableRequirement } from "./itemSpecs";

/** Bounded ranked candidates retained from one requirement search. */
export const MAX_CANDIDATES_PER_REQUIREMENT = 5;

/** At most one extra requirement-specific search after the original pool is exhausted. */
export const MAX_RECOVERY_SEARCHES_PER_REQUIREMENT = 1;

export type RequirementCandidatePool = {
  requirement: SearchableRequirement;
  candidates: RankedProductCandidate[];
};

export function candidateUrlKey(productUrl: string): string {
  try {
    const parsed = new URL(productUrl.trim());
    parsed.hash = "";
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${host}${path}${parsed.search}`.toLowerCase();
  } catch {
    return productUrl.trim().toLowerCase();
  }
}

export function mergeRankedCandidatePool(
  existing: RankedProductCandidate[],
  incoming: RankedProductCandidate[],
  max = MAX_CANDIDATES_PER_REQUIREMENT
): RankedProductCandidate[] {
  const byUrl = new Map<string, RankedProductCandidate>();
  for (const candidate of [...existing, ...incoming]) {
    const url = candidate.product.productUrl;
    if (!url) continue;
    const key = candidateUrlKey(url);
    const previous = byUrl.get(key);
    if (!previous || candidate.finalScore > previous.finalScore) {
      byUrl.set(key, candidate);
    }
  }
  return [...byUrl.values()].sort((a, b) => b.finalScore - a.finalScore).slice(0, max);
}
