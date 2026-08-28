import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ParsedResponse } from "openai/resources/responses/responses";
import { isProductionDeployment } from "@/lib/env/deployment";
import { OPENAI_PRODUCT_SEARCH_MODEL } from "./constants";
import { enrichRescueCandidates, type EnrichmentStats } from "./enrichCandidates";
import {
  buildRequirementPolicyHints,
  normalizeMatchScore,
  normalizeRequirementLists,
} from "./matchPolicy";
import {
  buildRescueUserMessage,
  RESCUE_SYSTEM_PROMPT,
} from "./rescuePrompt";
import {
  buildRescueCandidates,
  merchantEvidenceText,
  rescueCandidateMap,
  verifiedMerchantImage,
  verifiedMerchantPrice,
  type RescueCandidate,
} from "./rescueCandidates";
import { rescueSelectionSchema, type RescueSelectionOutput } from "./rescueSchema";
import type { PriceEvidence, ProductDiscoveryProduct, ProductDiscoverySource } from "./types";

export type InitialFailureReason = "model_not_found" | "url_not_in_sources" | "domain_not_allowed";

export type RescueAttemptResult = {
  product: ProductDiscoveryProduct | null;
  evidenceText: string | null;
  rescueAttempted: boolean;
  rescueCandidateCount: number;
  rescueSelected: boolean;
  rescueSelectedCandidateId: string | null;
  rescueElapsedMs: number;
  enrichmentStats?: EnrichmentStats;
};

function clampMatchScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

function resolvePriceEvidence(candidate: RescueCandidate, price: number | null): PriceEvidence {
  if (candidate.enrichment?.status === "success" && candidate.enrichment.price != null) {
    return "merchant_page";
  }
  if (price != null) {
    return "web_search";
  }
  return "none";
}

function resolveRescueSelection(
  selection: RescueSelectionOutput,
  candidateMap: Map<string, RescueCandidate>,
  requestedItem: string
): ProductDiscoveryProduct | null {
  if (selection.status !== "selected" || !selection.candidateId) return null;
  const candidate = candidateMap.get(selection.candidateId);
  if (!candidate) return null;

  const merchantPrice = verifiedMerchantPrice(candidate);
  let price = merchantPrice.price;
  let currency = merchantPrice.currency;

  if (price == null) {
    price =
      typeof selection.price === "number" && Number.isFinite(selection.price) && selection.price > 0
        ? selection.price
        : null;
    currency =
      price != null && selection.currency?.trim().toUpperCase() === "EUR" ? "EUR" : null;
  }

  const priceEvidence = resolvePriceEvidence(candidate, price);

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
    selection.productName?.trim() ||
    candidate.sourceTitle?.trim();
  if (!name) return null;

  const imageUrl = verifiedMerchantImage(candidate);

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
    whyItMatches: selection.whyItMatches.trim() || "Selected from verified web-search source evidence.",
    priceEvidence,
  };
}

export async function attemptSourceBackedRescue(input: {
  client: OpenAI;
  requestedItem: string;
  sources: ProductDiscoverySource[];
  allowlistDomains: string[];
  enrichOptions?: Pick<import("./enrichCandidate").EnrichCandidateOptions, "fetchFn" | "lookup" | "timeoutMs">;
}): Promise<RescueAttemptResult> {
  const started = Date.now();
  const baseCandidates = buildRescueCandidates({
    sources: input.sources,
    allowlistDomains: input.allowlistDomains,
    requestedItem: input.requestedItem,
  });

  if (baseCandidates.length === 0) {
    return {
      product: null,
      evidenceText: null,
      rescueAttempted: true,
      rescueCandidateCount: 0,
      rescueSelected: false,
      rescueSelectedCandidateId: null,
      rescueElapsedMs: Date.now() - started,
    };
  }

  const { candidates, stats: enrichmentStats } = await enrichRescueCandidates({
    candidates: baseCandidates,
    allowlistDomains: input.allowlistDomains,
    includeDebug: !isProductionDeployment(),
    enrichOptions: input.enrichOptions,
  });

  const candidateMap = rescueCandidateMap(candidates);

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
                candidates,
                requirementPolicy: buildRequirementPolicyHints(input.requestedItem),
              }),
            },
          ],
        },
      ],
      reasoning: { effort: "low" },
      text: { format: zodTextFormat(rescueSelectionSchema, "rescue_selection") },
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      return {
        product: null,
        evidenceText: null,
        rescueAttempted: true,
        rescueCandidateCount: candidates.length,
        rescueSelected: false,
        rescueSelectedCandidateId: null,
        rescueElapsedMs: Date.now() - started,
        enrichmentStats,
      };
    }

    const product = resolveRescueSelection(parsed, candidateMap, input.requestedItem);
    const candidate = parsed.candidateId ? candidateMap.get(parsed.candidateId) : null;
    return {
      product,
      evidenceText: candidate ? merchantEvidenceText(candidate) : null,
      rescueAttempted: true,
      rescueCandidateCount: candidates.length,
      rescueSelected: product != null,
      rescueElapsedMs: Date.now() - started,
      enrichmentStats,
      rescueSelectedCandidateId: parsed.candidateId,
    };
  } catch {
    return {
      product: null,
      evidenceText: null,
      rescueAttempted: true,
      rescueCandidateCount: candidates.length,
      rescueSelected: false,
      rescueElapsedMs: Date.now() - started,
      enrichmentStats,
      rescueSelectedCandidateId: null,
    };
  }
}

export function shouldAttemptRescue(input: {
  primaryStatus: "found" | "not_found";
  initialFailureReason: InitialFailureReason | null;
  searchUsed: boolean;
  sourceCount: number;
  acceptanceRejected?: boolean;
}): boolean {
  if (!input.searchUsed || input.sourceCount === 0) return false;
  if (input.primaryStatus === "found" && !input.acceptanceRejected) return false;
  return (
    input.initialFailureReason === "model_not_found" ||
    input.initialFailureReason === "url_not_in_sources" ||
    input.initialFailureReason === "domain_not_allowed" ||
    input.acceptanceRejected === true
  );
}
