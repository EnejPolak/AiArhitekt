import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ParsedResponse } from "openai/resources/responses/responses";
import { isProductionDeployment } from "@/lib/env/deployment";
import { runCanonicalSerpSearch, type CanonicalSerpTopCandidate } from "@/lib/serp/search";
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import {
  OPENAI_PRODUCT_SEARCH_MODEL,
  SERP_FALLBACK_MAX_CANDIDATES,
  SERP_FALLBACK_MAX_REQUESTS,
} from "./constants";
import { finalizeAcceptedProduct } from "./acceptancePolicy";
import { domainAllowed } from "./domains";
import { enrichRescueCandidates } from "./enrichCandidates";
import {
  buildRequirementPolicyHints,
  normalizeMatchScore,
  normalizeRequirementLists,
} from "./matchPolicy";
import {
  buildProductEvidence,
  resolveGroundedPrice,
} from "./productEvidence";
import { buildRescueUserMessage, RESCUE_SYSTEM_PROMPT } from "./rescuePrompt";
import {
  isConfidentNonProductUrl,
  merchantEvidenceText,
  rescueCandidateMap,
  scoreCandidateRelevance,
  type RescueCandidate,
} from "./rescueCandidates";
import { rescueSelectionSchema, type RescueSelectionOutput } from "./rescueSchema";
import {
  openAiFinalFailureReason,
  shouldUseSerpFallback,
} from "./serpFallbackEligibility";
import type {
  ProductDiscoveryProduct,
  ProductDiscoveryResult,
  ProductDiscoverySource,
} from "./types";

export type SerpFallbackDiagnostics = {
  serpFallbackEligible: boolean;
  serpFallbackReason: string | null;
  serpFallbackAttempted: boolean;
  serpFallbackQueryCount: number;
  serpFallbackCandidateCount: number;
  serpFallbackSelectedCandidateId: string | null;
  serpFallbackAccepted: boolean;
  serpFallbackDurationMs: number | null;
  openAiFinalFailureReason: string | null;
};

function clampMatchScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

function serpCandidateEvidence(candidate: CanonicalSerpTopCandidate): string {
  const parts: string[] = [];
  if (candidate.title?.trim()) parts.push(candidate.title.trim());
  if (candidate.snippet?.trim()) parts.push(candidate.snippet.trim());
  if (candidate.price?.value != null) {
    parts.push(`Serp snippet price: ${candidate.price.value} ${candidate.price.currency}`);
  }
  return parts.join("\n");
}

export function buildSerpFallbackCandidates(input: {
  topCandidates: CanonicalSerpTopCandidate[];
  allowlistDomains: string[];
  requestedItem: string;
  maxCandidates?: number;
}): RescueCandidate[] {
  const maxCandidates = input.maxCandidates ?? SERP_FALLBACK_MAX_CANDIDATES;
  const seen = new Set<string>();
  const scored: RescueCandidate[] = [];

  for (const candidate of input.topCandidates) {
    if (!candidate.url?.startsWith("http")) continue;
    if (!domainAllowed(candidate.url, input.allowlistDomains)) continue;
    if (isConfidentNonProductUrl(candidate.url)) continue;
    if (candidate.flags?.isCategoryLikeUrl) continue;

    const key = candidate.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const domain = normalizeDomainToRoot(candidate.url);
    if (!domain) continue;

    const preRankScore =
      candidate.score + scoreCandidateRelevance(candidate.url, candidate.title, input.requestedItem);
    scored.push({
      id: "",
      url: candidate.url,
      domain,
      sourceTitle: candidate.title ?? null,
      sourceEvidence: serpCandidateEvidence(candidate),
      preRankScore,
      enrichment: null,
      serpSnippetPrice: candidate.price?.value ?? null,
      serpSnippetCurrency: candidate.price?.currency ?? null,
    });
  }

  scored.sort((a, b) => b.preRankScore - a.preRankScore);
  return scored.slice(0, maxCandidates).map((candidate, index) => ({
    ...candidate,
    id: `candidate_${index + 1}`,
  }));
}

function resolveSerpSelection(
  selection: RescueSelectionOutput,
  candidateMap: Map<string, RescueCandidate>,
  requestedItem: string
): ProductDiscoveryProduct | null {
  if (selection.status !== "selected" || !selection.candidateId) return null;
  const candidate = candidateMap.get(selection.candidateId);
  if (!candidate) return null;

  const modelReportedPrice =
    typeof selection.price === "number" && Number.isFinite(selection.price) && selection.price > 0
      ? selection.price
      : null;

  const evidence = buildProductEvidence({
    productUrl: candidate.url,
    sources: [
      {
        url: candidate.url,
        title: candidate.sourceTitle,
        snippet: candidate.sourceEvidence,
      },
    ],
    enrichment: candidate.enrichment,
    trustedDisplayName:
      candidate.enrichment?.productName?.trim() ||
      candidate.enrichment?.pageTitle?.trim() ||
      candidate.sourceTitle?.trim() ||
      null,
  });
  const grounded = resolveGroundedPrice({
    evidence,
    modelClaimedPrice: modelReportedPrice,
    serpSnippetPrice: candidate.serpSnippetPrice ?? null,
  });

  let price = grounded.price;
  let currency = grounded.currency;
  const priceEvidence = grounded.priceEvidence;
  if (priceEvidence === "none") {
    price = null;
    currency = null;
  }

  const requirementLists = normalizeRequirementLists(
    requestedItem,
    {
      matchedRequirements: selection.matchedRequirements ?? [],
      unmetRequirements: selection.unmetRequirements ?? [],
      unknownRequirements: selection.unknownRequirements ?? [],
    },
    price
  );

  const matchScore = normalizeMatchScore({
    matchScore: clampMatchScore(selection.matchScore),
    unmetRequirements: requirementLists.unmetRequirements,
    unknownRequirements: requirementLists.unknownRequirements,
  });

  const name =
    candidate.enrichment?.productName?.trim() ||
    candidate.enrichment?.pageTitle?.trim() ||
    candidate.sourceTitle?.trim() ||
    selection.productName?.trim();
  if (!name) return null;

  const imageUrl =
    candidate.enrichment?.status === "success" && candidate.enrichment.imageUrl
      ? candidate.enrichment.imageUrl
      : null;

  return {
    name,
    retailer: selection.retailer?.trim() || candidate.domain,
    retailerDomain: candidate.domain,
    productUrl: candidate.url,
    price,
    currency: currency === "EUR" ? "EUR" : price != null ? currency : null,
    priceUnit: selection.priceUnit,
    imageUrl,
    specifications: {},
    matchScore,
    matchedRequirements: requirementLists.matchedRequirements,
    unmetRequirements: requirementLists.unmetRequirements,
    unknownRequirements: requirementLists.unknownRequirements,
    whyItMatches:
      selection.whyItMatches.trim() ||
      "Selected from verified SerpAPI fallback candidate evidence.",
    priceEvidence,
  };
}

function buildSkippedDiagnostics(
  result: ProductDiscoveryResult,
  eligibility: { eligible: boolean; reason: string | null }
): SerpFallbackDiagnostics {
  return {
    serpFallbackEligible: eligibility.eligible,
    serpFallbackReason: eligibility.reason,
    serpFallbackAttempted: false,
    serpFallbackQueryCount: 0,
    serpFallbackCandidateCount: 0,
    serpFallbackSelectedCandidateId: null,
    serpFallbackAccepted: false,
    serpFallbackDurationMs: null,
    openAiFinalFailureReason: openAiFinalFailureReason(result.diagnostics),
  };
}

export async function attemptSerpFallback(input: {
  client: OpenAI;
  requestedItem: string;
  allowlistDomains: string[];
  primarySources: ProductDiscoverySource[];
  result: ProductDiscoveryResult;
}): Promise<ProductDiscoveryResult> {
  const eligibility = shouldUseSerpFallback({
    requestedItem: input.requestedItem,
    status: input.result.status,
    diagnostics: input.result.diagnostics,
  });

  const baseSkipped = buildSkippedDiagnostics(input.result, eligibility);
  if (input.result.status !== "not_found" || !eligibility.eligible) {
    return {
      ...input.result,
      diagnostics: {
        searchUsed: input.result.diagnostics?.searchUsed ?? false,
        allowedDomainsCount: input.result.diagnostics?.allowedDomainsCount ?? 0,
        ...input.result.diagnostics,
        ...baseSkipped,
      },
    };
  }

  if (!process.env.SERPAPI_KEY?.trim()) {
    return {
      ...input.result,
      diagnostics: {
        searchUsed: input.result.diagnostics?.searchUsed ?? false,
        allowedDomainsCount: input.result.diagnostics?.allowedDomainsCount ?? 0,
        ...input.result.diagnostics,
        ...baseSkipped,
        serpFallbackReason: "serpapi_key_missing",
      },
    };
  }

  const started = Date.now();
  const serpOutcome = await runCanonicalSerpSearch({
    items: [input.requestedItem],
    allowlistDomains: input.allowlistDomains,
    fastMode: true,
    maxRequests: SERP_FALLBACK_MAX_REQUESTS,
  });

  const queryCount = serpOutcome.ok ? serpOutcome.response.executedCount : 0;

  if (!serpOutcome.ok) {
    return {
      ...input.result,
      diagnostics: {
        searchUsed: input.result.diagnostics?.searchUsed ?? false,
        allowedDomainsCount: input.result.diagnostics?.allowedDomainsCount ?? 0,
        ...input.result.diagnostics,
        ...baseSkipped,
        serpFallbackAttempted: true,
        serpFallbackQueryCount: queryCount,
        serpFallbackDurationMs: Date.now() - started,
        serpFallbackReason: serpOutcome.error,
      },
    };
  }

  const topCandidates = serpOutcome.response.results[0]?.topCandidates ?? [];
  const candidates = buildSerpFallbackCandidates({
    topCandidates,
    allowlistDomains: input.allowlistDomains,
    requestedItem: input.requestedItem,
  });

  if (candidates.length === 0) {
    return {
      ...input.result,
      diagnostics: {
        searchUsed: input.result.diagnostics?.searchUsed ?? false,
        allowedDomainsCount: input.result.diagnostics?.allowedDomainsCount ?? 0,
        ...input.result.diagnostics,
        ...baseSkipped,
        serpFallbackAttempted: true,
        serpFallbackQueryCount: queryCount,
        serpFallbackCandidateCount: 0,
        serpFallbackDurationMs: Date.now() - started,
        serpFallbackReason: "no_allowlisted_candidates",
      },
    };
  }

  const { candidates: enrichedCandidates, stats: enrichmentStats } = await enrichRescueCandidates({
    candidates,
    allowlistDomains: input.allowlistDomains,
    includeDebug: !isProductionDeployment(),
  });

  const candidateMap = rescueCandidateMap(enrichedCandidates);
  let selectedCandidateId: string | null = null;
  let product: ProductDiscoveryProduct | null = null;
  let evidenceText: string | null = null;

  try {
    const response: ParsedResponse<RescueSelectionOutput> = await input.client.responses.parse({
      model: OPENAI_PRODUCT_SEARCH_MODEL,
      instructions: RESCUE_SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildRescueUserMessage({
                requestedItem: input.requestedItem,
                candidates: enrichedCandidates,
                requirementPolicy: buildRequirementPolicyHints(input.requestedItem),
              }),
            },
          ],
        },
      ],
      reasoning: { effort: "low" },
      text: { format: zodTextFormat(rescueSelectionSchema, "serp_fallback_selection") },
    });

    const parsed = response.output_parsed;
    selectedCandidateId = parsed?.candidateId ?? null;
    if (parsed) {
      product = resolveSerpSelection(parsed, candidateMap, input.requestedItem);
      const candidate = parsed.candidateId ? candidateMap.get(parsed.candidateId) : null;
      evidenceText = candidate ? merchantEvidenceText(candidate) : null;
    }
  } catch {
    product = null;
  }

  const durationMs = Date.now() - started;
  const fallbackDiagnostics: SerpFallbackDiagnostics = {
    serpFallbackEligible: true,
    serpFallbackReason: eligibility.reason,
    serpFallbackAttempted: true,
    serpFallbackQueryCount: queryCount,
    serpFallbackCandidateCount: enrichedCandidates.length,
    serpFallbackSelectedCandidateId: selectedCandidateId,
    serpFallbackAccepted: false,
    serpFallbackDurationMs: durationMs,
    openAiFinalFailureReason: openAiFinalFailureReason(input.result.diagnostics),
  };

  if (!product) {
    return {
      ...input.result,
      diagnostics: {
        searchUsed: input.result.diagnostics?.searchUsed ?? false,
        allowedDomainsCount: input.result.diagnostics?.allowedDomainsCount ?? 0,
        ...input.result.diagnostics,
        ...fallbackDiagnostics,
        enrichmentAttemptedCount: enrichmentStats.enrichmentAttemptedCount,
        enrichmentSuccessCount: enrichmentStats.enrichmentSuccessCount,
        enrichment403Count: enrichmentStats.enrichment403Count,
        enrichmentTimeoutCount: enrichmentStats.enrichmentTimeoutCount,
        elapsedMs: (input.result.diagnostics?.elapsedMs ?? 0) + durationMs,
      },
    };
  }

  const finalized = finalizeAcceptedProduct({
    requestedItem: input.requestedItem,
    source: "serp_fallback",
    product,
    evidenceText: evidenceText ?? undefined,
  });

  if (finalized.accepted) {
    return {
      requestedItem: input.requestedItem,
      status: "found",
      product: finalized.product,
      sources: input.primarySources,
      diagnostics: {
        searchUsed: input.result.diagnostics?.searchUsed ?? false,
        allowedDomainsCount: input.result.diagnostics?.allowedDomainsCount ?? 0,
        ...input.result.diagnostics,
        ...fallbackDiagnostics,
        serpFallbackAccepted: true,
        acceptanceChecked: true,
        acceptanceSource: "serp_fallback",
        acceptanceScore: finalized.matchScore,
        requirementCoverage: finalized.requirementCoverage,
        acceptanceReason: finalized.reason,
        enrichmentAttemptedCount: enrichmentStats.enrichmentAttemptedCount,
        enrichmentSuccessCount: enrichmentStats.enrichmentSuccessCount,
        enrichment403Count: enrichmentStats.enrichment403Count,
        enrichmentTimeoutCount: enrichmentStats.enrichmentTimeoutCount,
        elapsedMs: (input.result.diagnostics?.elapsedMs ?? 0) + durationMs,
      },
    };
  }

  return {
    requestedItem: input.requestedItem,
    status: "not_found",
    product: null,
    sources: input.primarySources,
    diagnostics: {
      searchUsed: input.result.diagnostics?.searchUsed ?? false,
      allowedDomainsCount: input.result.diagnostics?.allowedDomainsCount ?? 0,
      ...input.result.diagnostics,
      ...fallbackDiagnostics,
      rejectedProduct: finalized.product,
      acceptanceChecked: true,
      acceptanceSource: "serp_fallback",
      acceptanceScore: finalized.matchScore,
      requirementCoverage: finalized.requirementCoverage,
      acceptanceReason: finalized.reason,
      enrichmentAttemptedCount: enrichmentStats.enrichmentAttemptedCount,
      enrichmentSuccessCount: enrichmentStats.enrichmentSuccessCount,
      enrichment403Count: enrichmentStats.enrichment403Count,
      enrichmentTimeoutCount: enrichmentStats.enrichmentTimeoutCount,
      elapsedMs: (input.result.diagnostics?.elapsedMs ?? 0) + durationMs,
    },
  };
}
