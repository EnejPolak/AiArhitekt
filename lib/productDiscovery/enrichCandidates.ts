import {
  RESCUE_ENRICH_CONCURRENCY,
  RESCUE_ENRICH_MAX_CANDIDATES,
  RESCUE_ENRICH_MIN_CANDIDATES,
} from "./constants";
import {
  enrichCandidatePage,
  type CandidateEnrichment,
  type EnrichCandidateOptions,
} from "./enrichCandidate";
import type { RescueCandidate } from "./rescueCandidates";

export type EnrichmentStats = {
  enrichmentAttemptedCount: number;
  enrichmentSuccessCount: number;
  enrichment403Count: number;
  enrichmentTimeoutCount: number;
  candidateDebug?: Array<{
    candidateId: string;
    domain: string;
    preRankScore: number;
    fetchStatus: CandidateEnrichment["status"];
    jsonLdProductFound: boolean;
    priceFound: boolean;
    productNameFound: boolean;
  }>;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]!);
    }
  });
  await Promise.all(runners);
  return results;
}

function selectCandidatesForEnrichment(candidates: RescueCandidate[]): RescueCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.preRankScore - a.preRankScore);
  if (sorted.length === 0) return [];

  const top = sorted[0]!.preRankScore;
  const second = sorted[1]?.preRankScore ?? 0;
  const strongLeader = sorted.length >= 2 && top - second >= 15;

  const limit = strongLeader
    ? Math.min(RESCUE_ENRICH_MIN_CANDIDATES, sorted.length)
    : Math.min(RESCUE_ENRICH_MAX_CANDIDATES, sorted.length);

  return sorted.slice(0, limit);
}

export async function enrichRescueCandidates(input: {
  candidates: RescueCandidate[];
  allowlistDomains: string[];
  includeDebug?: boolean;
  enrichOptions?: Pick<EnrichCandidateOptions, "fetchFn" | "lookup" | "timeoutMs">;
}): Promise<{ candidates: RescueCandidate[]; stats: EnrichmentStats }> {
  const toEnrich = selectCandidatesForEnrichment(input.candidates);
  const enrichIds = new Set(toEnrich.map((candidate) => candidate.id));

  const stats: EnrichmentStats = {
    enrichmentAttemptedCount: toEnrich.length,
    enrichmentSuccessCount: 0,
    enrichment403Count: 0,
    enrichmentTimeoutCount: 0,
    candidateDebug: input.includeDebug ? [] : undefined,
  };

  const enrichedById = new Map<string, CandidateEnrichment>();

  await mapWithConcurrency(toEnrich, RESCUE_ENRICH_CONCURRENCY, async (candidate) => {
    const enrichment = await enrichCandidatePage(candidate.url, {
      allowlistDomains: input.allowlistDomains,
      ...input.enrichOptions,
    });
    enrichedById.set(candidate.id, enrichment);

    if (enrichment.status === "success") stats.enrichmentSuccessCount += 1;
    if (enrichment.status === "forbidden") stats.enrichment403Count += 1;
    if (enrichment.status === "timeout") stats.enrichmentTimeoutCount += 1;

    if (stats.candidateDebug) {
      stats.candidateDebug.push({
        candidateId: candidate.id,
        domain: candidate.domain,
        preRankScore: candidate.preRankScore,
        fetchStatus: enrichment.status,
        jsonLdProductFound: enrichment.jsonLdProductFound,
        priceFound: enrichment.price != null,
        productNameFound: enrichment.productName != null,
      });
    }
  });

  const candidates = input.candidates.map((candidate) => {
    if (!enrichIds.has(candidate.id)) return candidate;
    return {
      ...candidate,
      enrichment: enrichedById.get(candidate.id) ?? null,
    };
  });

  return { candidates, stats };
}
