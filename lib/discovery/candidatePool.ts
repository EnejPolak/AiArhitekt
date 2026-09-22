import type { RankedProductCandidate } from "./style/types";
import type { SearchableRequirement } from "./itemSpecs";

/** Bounded ranked candidates retained from one requirement search. */
export const MAX_CANDIDATES_PER_REQUIREMENT = 5;

/** Cap one merchant before taking candidates from other available domains. */
export const MAX_CANDIDATES_PER_MERCHANT_DOMAIN = 2;

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

function candidateMerchantKey(candidate: RankedProductCandidate): string {
  return (candidate.product.retailerDomain ?? "").trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Prefer merchant-diverse pools when multiple allowed domains are present.
 * Does not invent candidates. A single-domain result is kept as-is.
 */
export function diversifyMerchantCandidatePool(
  candidates: RankedProductCandidate[],
  max = MAX_CANDIDATES_PER_REQUIREMENT,
  maxPerDomain = MAX_CANDIDATES_PER_MERCHANT_DOMAIN
): RankedProductCandidate[] {
  if (candidates.length <= 1) return candidates.slice(0, max);
  const domains = new Set(
    candidates.map(candidateMerchantKey).filter((domain) => domain.length > 0)
  );
  if (domains.size <= 1) return candidates.slice(0, max);

  const selected: RankedProductCandidate[] = [];
  const overflow: RankedProductCandidate[] = [];
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const domain = candidateMerchantKey(candidate) || "_";
    const count = counts.get(domain) ?? 0;
    if (count < maxPerDomain) {
      selected.push(candidate);
      counts.set(domain, count + 1);
    } else {
      overflow.push(candidate);
    }
    if (selected.length >= max) return selected.slice(0, max);
  }
  for (const candidate of overflow) {
    if (selected.length >= max) break;
    selected.push(candidate);
  }
  return selected;
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
  const ranked = [...byUrl.values()].sort((a, b) => b.finalScore - a.finalScore);
  return diversifyMerchantCandidatePool(ranked, max);
}
