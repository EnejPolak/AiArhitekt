import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ParsedResponse } from "openai/resources/responses/responses";
import { isProductionDeployment } from "@/lib/env/deployment";
import { OPENAI_PRODUCT_SEARCH_MODEL } from "./constants";
import {
  enrichRescueCandidates,
  enrichSelectedRescueCandidate,
  type EnrichmentStats,
} from "./enrichCandidates";
import {
  buildRequirementPolicyHints,
  normalizeMatchScore,
  normalizeRequirementLists,
  type RequirementLists,
} from "./matchPolicy";
import {
  buildRescueUserMessage,
  RESCUE_SYSTEM_PROMPT,
} from "./rescuePrompt";
import {
  buildProductEvidence,
  classifyClaimAgainstEvidence,
  classifyExactDimensionAgainstEvidence,
  resolveGroundedPrice,
} from "./productEvidence";
import {
  parseRequestedRequirements,
  requirementStatus,
} from "./requirementAnalysis";
import {
  buildRescueCandidates,
  merchantEvidenceText,
  rescueCandidateMap,
  verifiedMerchantImage,
  verifiedMerchantPrice,
  type RescueCandidate,
} from "./rescueCandidates";
import { rescueSelectionSchema, type RescueSelectionOutput } from "./rescueSchema";
import type { ProductDiscoveryProduct, ProductDiscoverySource } from "./types";

export type InitialFailureReason = "model_not_found" | "url_not_in_sources" | "domain_not_allowed";

export type RescueAttemptResult = {
  product: ProductDiscoveryProduct | null;
  evidenceText: string | null;
  /** Decision-time ProductEvidence for the selected rescue candidate (when any). */
  productEvidence: import("./productEvidence").ProductEvidence | null;
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

function applyEvidenceBackedHardRequirements(input: {
  requestedItem: string;
  lists: RequirementLists;
  haystack: string;
}): RequirementLists {
  const matchedRequirements = [...input.lists.matchedRequirements];
  const unmetRequirements = [...input.lists.unmetRequirements];
  let unknownRequirements = [...input.lists.unknownRequirements];

  for (const requirement of parseRequestedRequirements(input.requestedItem)) {
    if (!requirement.hard) continue;
    if (requirementStatus(requirement, input.lists) !== "unknown") continue;
    if (requirement.id.startsWith("budget:")) continue;

    let status: "supported" | "unsupported" | "contradicted" = "unsupported";
    if (requirement.id.startsWith("dimension:")) {
      const valueCm = requirement.id.replace(/^dimension:/, "").replace(/cm$/i, "");
      if (valueCm) {
        status = classifyExactDimensionAgainstEvidence({
          valueCm,
          haystack: input.haystack,
        });
      }
    } else {
      status = classifyClaimAgainstEvidence({
        claim: requirement.label,
        haystack: input.haystack,
        requestedItem: input.requestedItem,
      });
    }

    if (status === "supported") {
      if (!matchedRequirements.some((entry) => entry.toLowerCase() === requirement.label.toLowerCase())) {
        matchedRequirements.push(requirement.label);
      }
      unknownRequirements = unknownRequirements.filter(
        (entry) => !requirement.tokens.some((token) => token.length >= 3 && entry.toLowerCase().includes(token))
      );
    } else if (status === "contradicted") {
      unmetRequirements.push(`${requirement.label} (contradicted by merchant evidence)`);
      unknownRequirements = unknownRequirements.filter(
        (entry) => !requirement.tokens.some((token) => token.length >= 3 && entry.toLowerCase().includes(token))
      );
    }
  }

  return { matchedRequirements, unmetRequirements, unknownRequirements };
}

function resolveRescueSelection(
  selection: RescueSelectionOutput,
  candidateMap: Map<string, RescueCandidate>,
  requestedItem: string
): {
  product: ProductDiscoveryProduct;
  productEvidence: import("./productEvidence").ProductEvidence;
} | null {
  if (selection.status !== "selected" || !selection.candidateId) return null;
  const candidate = candidateMap.get(selection.candidateId);
  if (!candidate) return null;

  const merchantPrice = verifiedMerchantPrice(candidate);
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
    modelClaimedPrice: modelReportedPrice ?? merchantPrice.price,
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
    applyEvidenceBackedHardRequirements({
      requestedItem,
      lists: {
        matchedRequirements: selection.matchedRequirements ?? [],
        unmetRequirements: selection.unmetRequirements ?? [],
        unknownRequirements: selection.unknownRequirements ?? [],
      },
      haystack: merchantEvidenceText(candidate),
    }),
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

  const imageUrl = verifiedMerchantImage(candidate);

  return {
    productEvidence: evidence,
    product: {
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
    },
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
      productEvidence: null,
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
        productEvidence: null,
        rescueAttempted: true,
        rescueCandidateCount: candidates.length,
        rescueSelected: false,
        rescueSelectedCandidateId: null,
        rescueElapsedMs: Date.now() - started,
        enrichmentStats,
      };
    }

    const selectedId = parsed.candidateId;
    let workingMap = candidateMap;
    let stats = enrichmentStats;
    if (selectedId && workingMap.get(selectedId)) {
      const selected = await enrichSelectedRescueCandidate({
        candidate: workingMap.get(selectedId)!,
        allowlistDomains: input.allowlistDomains,
        enrichOptions: input.enrichOptions,
      });
      workingMap = new Map(workingMap);
      workingMap.set(selectedId, selected.candidate);
      stats = {
        ...stats,
        selectedAdditionalEnrichmentAttempts: selected.debug.additionalFetchAttempts,
        selectedCandidateEnrichment: selected.debug,
      };
    }

    const resolved = resolveRescueSelection(parsed, workingMap, input.requestedItem);
    const candidate = selectedId ? workingMap.get(selectedId) ?? null : null;
    return {
      product: resolved?.product ?? null,
      productEvidence: resolved?.productEvidence ?? null,
      evidenceText: candidate ? merchantEvidenceText(candidate) : null,
      rescueAttempted: true,
      rescueCandidateCount: candidates.length,
      rescueSelected: resolved?.product != null,
      rescueElapsedMs: Date.now() - started,
      enrichmentStats: stats,
      rescueSelectedCandidateId: selectedId,
    };
  } catch {
    return {
      product: null,
      evidenceText: null,
      productEvidence: null,
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
