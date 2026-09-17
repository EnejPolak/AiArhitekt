import {
  RESCUE_ENRICH_CONCURRENCY,
  RESCUE_ENRICH_MAX_CANDIDATES,
  RESCUE_ENRICH_MIN_CANDIDATES,
} from "./constants";
import {
  enrichCandidatePage,
  getCachedCandidateEnrichment,
  type CandidateEnrichment,
  type EnrichCandidateOptions,
} from "./enrichCandidate";
import type { RescueCandidate } from "./rescueCandidates";

export type EnrichmentCoverage = {
  price: boolean;
  material: boolean;
  labeledDimensions: number;
};

export type SelectedCandidateEnrichmentDebug = {
  candidateId: string;
  wasInitiallyEnriched: boolean;
  cacheHit: boolean;
  enrichmentAttempted: boolean;
  enrichmentStatus: CandidateEnrichment["status"] | null;
  evidenceFactsAdded: number;
  additionalFetchAttempts: number;
  coverageBefore: EnrichmentCoverage;
  coverageAfter: EnrichmentCoverage;
};

export type EnrichmentStats = {
  enrichmentAttemptedCount: number;
  enrichmentSuccessCount: number;
  enrichment403Count: number;
  enrichmentTimeoutCount: number;
  selectedAdditionalEnrichmentAttempts?: number;
  selectedCandidateEnrichment?: SelectedCandidateEnrichmentDebug;
  candidateDebug?: Array<{
    candidateId: string;
    url?: string;
    domain: string;
    preRankScore: number;
    fetchStatus: CandidateEnrichment["status"];
    jsonLdProductFound: boolean;
    priceFound: boolean;
    productNameFound: boolean;
    materialFound?: boolean;
    labeledDimensionsFound?: number;
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
        url: candidate.url,
        domain: candidate.domain,
        preRankScore: candidate.preRankScore,
        fetchStatus: enrichment.status,
        jsonLdProductFound: enrichment.jsonLdProductFound,
        priceFound: enrichment.price != null,
        productNameFound: enrichment.productName != null,
        materialFound: (enrichment.labeledSpecs ?? []).some((s) => s.field === "material"),
        labeledDimensionsFound: (enrichment.labeledSpecs ?? []).filter((s) => s.field === "dimension")
          .length,
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

export function enrichmentCoverage(enrichment: CandidateEnrichment | null | undefined): EnrichmentCoverage {
  const labeled = enrichment?.labeledSpecs ?? [];
  return {
    price: enrichment?.price != null,
    material: labeled.some((spec) => spec.field === "material"),
    labeledDimensions: labeled.filter((spec) => spec.field === "dimension").length,
  };
}

function enrichmentFactCount(enrichment: CandidateEnrichment | null | undefined): number {
  if (!enrichment || enrichment.status !== "success") return 0;
  return (enrichment.price != null ? 1 : 0) + (enrichment.labeledSpecs?.length ?? 0);
}

/**
 * After rescue ranking: if the selected candidate was outside the initial top-N
 * enrichment set, attempt merchant enrichment exactly once (cache first).
 */
export async function enrichSelectedRescueCandidate(input: {
  candidate: RescueCandidate;
  allowlistDomains: string[];
  enrichOptions?: Pick<EnrichCandidateOptions, "fetchFn" | "lookup" | "timeoutMs">;
}): Promise<{ candidate: RescueCandidate; debug: SelectedCandidateEnrichmentDebug }> {
  const coverageBefore = enrichmentCoverage(input.candidate.enrichment);
  const factsBefore = enrichmentFactCount(input.candidate.enrichment);
  const wasInitiallyEnriched = input.candidate.enrichment != null;

  if (wasInitiallyEnriched) {
    return {
      candidate: input.candidate,
      debug: {
        candidateId: input.candidate.id,
        wasInitiallyEnriched: true,
        cacheHit: false,
        enrichmentAttempted: false,
        enrichmentStatus: input.candidate.enrichment?.status ?? null,
        evidenceFactsAdded: 0,
        additionalFetchAttempts: 0,
        coverageBefore,
        coverageAfter: coverageBefore,
      },
    };
  }

  const cached = getCachedCandidateEnrichment(input.candidate.url);
  if (cached) {
    const candidate = { ...input.candidate, enrichment: cached };
    return {
      candidate,
      debug: {
        candidateId: input.candidate.id,
        wasInitiallyEnriched: false,
        cacheHit: true,
        enrichmentAttempted: true,
        enrichmentStatus: cached.status,
        evidenceFactsAdded: Math.max(0, enrichmentFactCount(cached) - factsBefore),
        additionalFetchAttempts: 0,
        coverageBefore,
        coverageAfter: enrichmentCoverage(cached),
      },
    };
  }

  const enrichment = await enrichCandidatePage(input.candidate.url, {
    allowlistDomains: input.allowlistDomains,
    ...input.enrichOptions,
  });
  const cacheHit = enrichment.enrichmentTiming?.cacheHit === true;
  const candidate = { ...input.candidate, enrichment };
  return {
    candidate,
    debug: {
      candidateId: input.candidate.id,
      wasInitiallyEnriched: false,
      cacheHit,
      enrichmentAttempted: true,
      enrichmentStatus: enrichment.status,
      evidenceFactsAdded: Math.max(0, enrichmentFactCount(enrichment) - factsBefore),
      additionalFetchAttempts: cacheHit ? 0 : 1,
      coverageBefore,
      coverageAfter: enrichmentCoverage(enrichment),
    },
  };
}
