/**
 * Dev-only source-backed selection stability helpers.
 * Not wired into production searchProductItem.
 */
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ParsedResponse } from "openai/resources/responses/responses";
import { finalizeAcceptedProduct } from "./acceptancePolicy";
import { ACCEPTANCE_RESCUE_MIN_SCORE, OPENAI_PRODUCT_SEARCH_MODEL, OPENAI_PRODUCT_SEARCH_TIMEOUT_MS } from "./constants";
import { normalizeProductDiscoveryAllowlist } from "./domains";
import { enrichRescueCandidates } from "./enrichCandidates";
import {
  buildRequirementPolicyHints,
  buildSuggestedSearchQueriesForRequest,
  normalizeMatchScore,
  normalizeRequirementLists,
} from "./matchPolicy";
import {
  buildProductEvidence,
  resolveGroundedPrice,
} from "./productEvidence";
import {
  buildProductDiscoveryUserMessage,
  PRODUCT_DISCOVERY_SYSTEM_PROMPT_CONTROL,
} from "./prompt";
import {
  assessAcceptanceAlignedQualification,
  type GroundTruthAssessment,
} from "./selectionBenchmarkGroundTruth";
import {
  buildRescueCandidates,
  merchantEvidenceText,
  rescueCandidateMap,
  type RescueCandidate,
} from "./rescueCandidates";
import { rescueSelectionSchema, type RescueSelectionOutput } from "./rescueSchema";
import { productDiscoveryModelSchema, type ProductDiscoveryModelOutput } from "./schema";
import {
  buildIsolatedSelectionUserMessage,
  ISOLATED_SELECTION_SYSTEM_PROMPT,
} from "./selectionStabilityPrompt";
import { extractPrimarySearchDiagnostics, extractWebSearchSources } from "./sources";
import type { ProductDiscoveryProduct, ProductDiscoverySource } from "./types";

export type QualifyingAssessment = GroundTruthAssessment;

/** @deprecated Use assessAcceptanceAlignedQualification — kept as alias for older imports. */
export const assessCandidateQualification = assessAcceptanceAlignedQualification;

export type IsolatedSelectionResult = {
  status: "selected" | "none";
  candidateId: string | null;
  product: ProductDiscoveryProduct | null;
  evidenceText: string | null;
  elapsedMs: number;
};

export type ControlPrimaryPassResult = {
  primaryDecision: "found" | "not_found" | "error";
  product: ProductDiscoveryProduct | null;
  sources: ProductDiscoverySource[];
  primarySearchQueries: string[];
  primarySourceCount: number;
  primaryDistinctSourceDomains: string[];
  elapsedMs: number;
  errorCode?: string;
};

function clampMatchScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

function productFromCandidate(
  requestedItem: string,
  candidate: RescueCandidate,
  selection?: RescueSelectionOutput | null
): ProductDiscoveryProduct | null {
  const modelReportedPrice =
    selection && typeof selection.price === "number" && Number.isFinite(selection.price) && selection.price > 0
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

  const name =
    candidate.enrichment?.productName?.trim() ||
    candidate.enrichment?.pageTitle?.trim() ||
    candidate.sourceTitle?.trim() ||
    selection?.productName?.trim();
  if (!name) return null;

  const lists = normalizeRequirementLists(
    requestedItem,
    {
      matchedRequirements: selection?.matchedRequirements ?? [],
      unmetRequirements: selection?.unmetRequirements ?? [],
      unknownRequirements: selection?.unknownRequirements ?? [],
    },
    price
  );

  return {
    name,
    retailer: selection?.retailer?.trim() || candidate.domain,
    retailerDomain: candidate.domain,
    productUrl: candidate.url,
    price,
    currency: currency === "EUR" ? "EUR" : price != null ? currency : null,
    priceUnit: selection?.priceUnit ?? null,
    imageUrl: candidate.enrichment?.imageUrl ?? null,
    specifications: {},
    matchScore: clampMatchScore(selection?.matchScore ?? ACCEPTANCE_RESCUE_MIN_SCORE),
    matchedRequirements: lists.matchedRequirements,
    unmetRequirements: lists.unmetRequirements,
    unknownRequirements: lists.unknownRequirements,
    whyItMatches: selection?.whyItMatches?.trim() || "Isolated selector candidate.",
    priceEvidence,
  };
}

/**
 * Build enriched candidates and acceptance-aligned ground-truth labels.
 */
export async function prepareEnrichedCandidates(input: {
  sources: ProductDiscoverySource[];
  allowlistDomains: string[];
  requestedItem: string;
}): Promise<{ candidates: RescueCandidate[]; qualifying: QualifyingAssessment[] }> {
  const allowlist = normalizeProductDiscoveryAllowlist(input.allowlistDomains);
  const base = buildRescueCandidates({
    sources: input.sources,
    allowlistDomains: allowlist,
    requestedItem: input.requestedItem,
  });
  const { candidates } = await enrichRescueCandidates({
    candidates: base,
    allowlistDomains: allowlist,
    includeDebug: true,
  });
  const qualifying = candidates.map((c) =>
    assessAcceptanceAlignedQualification(input.requestedItem, c)
  );
  return { candidates, qualifying };
}

export async function runIsolatedSelector(input: {
  client?: OpenAI;
  requestedItem: string;
  candidates: RescueCandidate[];
}): Promise<IsolatedSelectionResult> {
  const started = Date.now();
  const client =
    input.client ??
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_PRODUCT_SEARCH_TIMEOUT_MS,
      maxRetries: 0,
    });

  if (input.candidates.length === 0) {
    return {
      status: "none",
      candidateId: null,
      product: null,
      evidenceText: null,
      elapsedMs: Date.now() - started,
    };
  }

  const candidateMap = rescueCandidateMap(input.candidates);
  const response: ParsedResponse<RescueSelectionOutput> = await client.responses.parse({
    model: OPENAI_PRODUCT_SEARCH_MODEL,
    instructions: ISOLATED_SELECTION_SYSTEM_PROMPT,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildIsolatedSelectionUserMessage({
              requestedItem: input.requestedItem,
              requirementPolicy: buildRequirementPolicyHints(input.requestedItem),
              candidates: input.candidates.map((candidate) => ({
                id: candidate.id,
                domain: candidate.domain,
                preRankScore: candidate.preRankScore,
                sourceTitle: candidate.sourceTitle,
                sourceEvidence: candidate.sourceEvidence,
                merchantEvidence: merchantEvidenceText(candidate),
                enrichmentStatus: candidate.enrichment?.status ?? "not_attempted",
              })),
            }),
          },
        ],
      },
    ],
    reasoning: { effort: "low" },
    text: { format: zodTextFormat(rescueSelectionSchema, "isolated_selection") },
  });

  const parsed = response.output_parsed;
  if (!parsed || parsed.status !== "selected" || !parsed.candidateId) {
    return {
      status: "none",
      candidateId: null,
      product: null,
      evidenceText: null,
      elapsedMs: Date.now() - started,
    };
  }

  const candidate = candidateMap.get(parsed.candidateId);
  if (!candidate) {
    return {
      status: "none",
      candidateId: parsed.candidateId,
      product: null,
      evidenceText: null,
      elapsedMs: Date.now() - started,
    };
  }

  const product = productFromCandidate(input.requestedItem, candidate, parsed);
  if (!product) {
    return {
      status: "none",
      candidateId: parsed.candidateId,
      product: null,
      evidenceText: null,
      elapsedMs: Date.now() - started,
    };
  }

  product.matchScore = normalizeMatchScore({
    matchScore: product.matchScore,
    unmetRequirements: product.unmetRequirements,
    unknownRequirements: product.unknownRequirements,
  });

  return {
    status: "selected",
    candidateId: parsed.candidateId,
    product,
    evidenceText: merchantEvidenceText(candidate),
    elapsedMs: Date.now() - started,
  };
}

/**
 * Control primary pass only (same model/tool settings as production primary).
 * Does not run rescue/targeted/serp.
 */
export async function runControlPrimaryPass(input: {
  client?: OpenAI;
  requestedItem: string;
  allowlistDomains: string[];
}): Promise<ControlPrimaryPassResult> {
  const started = Date.now();
  const allowlist = normalizeProductDiscoveryAllowlist(input.allowlistDomains);
  const client =
    input.client ??
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_PRODUCT_SEARCH_TIMEOUT_MS,
      maxRetries: 0,
    });

  try {
    const response: ParsedResponse<ProductDiscoveryModelOutput> = await client.responses.parse({
      model: OPENAI_PRODUCT_SEARCH_MODEL,
      instructions: PRODUCT_DISCOVERY_SYSTEM_PROMPT_CONTROL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildProductDiscoveryUserMessage({
                requestedItem: input.requestedItem,
                allowedDomains: allowlist,
                requirementPolicy: buildRequirementPolicyHints(input.requestedItem),
                suggestedSearchQueries: buildSuggestedSearchQueriesForRequest(
                  input.requestedItem,
                  allowlist
                ),
              }),
            },
          ],
        },
      ],
      tools: [
        {
          type: "web_search",
          search_context_size: "medium",
          filters: { allowed_domains: allowlist },
        },
      ],
      tool_choice: "required",
      reasoning: { effort: "low" },
      include: ["web_search_call.action.sources"],
      text: { format: zodTextFormat(productDiscoveryModelSchema, "product_discovery_result") },
    });

    const sources = extractWebSearchSources(response);
    const diag = extractPrimarySearchDiagnostics(response, sources);
    const parsed = response.output_parsed;
    const elapsedMs = Date.now() - started;

    if (!parsed || parsed.status !== "found" || !parsed.product) {
      return {
        primaryDecision: "not_found",
        product: null,
        sources,
        primarySearchQueries: diag.searchQueries,
        primarySourceCount: diag.sourceCount,
        primaryDistinctSourceDomains: diag.distinctSourceDomains,
        elapsedMs,
      };
    }

    const p = parsed.product;
    const specs: Record<string, string | number | boolean | null> = {};
    for (const entry of p.specifications ?? []) {
      if (entry?.key) specs[entry.key] = entry.value ?? null;
    }
    const modelReportedPrice = typeof p.price === "number" ? p.price : null;
    const evidence = buildProductEvidence({
      productUrl: p.productUrl,
      sources,
    });
    const grounded = resolveGroundedPrice({
      evidence,
      modelClaimedPrice: modelReportedPrice,
    });
    const product: ProductDiscoveryProduct = {
      name: p.name?.trim() || "Unknown",
      retailer: p.retailer?.trim() || "Unknown",
      retailerDomain: p.retailerDomain?.trim() || "",
      productUrl: p.productUrl,
      price: grounded.price,
      currency: grounded.currency,
      priceUnit: p.priceUnit ?? null,
      imageUrl: p.imageUrl ?? null,
      specifications: specs,
      matchScore: typeof p.matchScore === "number" ? p.matchScore : 0.8,
      matchedRequirements: p.matchedRequirements ?? [],
      unmetRequirements: p.unmetRequirements ?? [],
      unknownRequirements: p.unknownRequirements ?? [],
      whyItMatches: p.whyItMatches ?? "",
      priceEvidence: grounded.priceEvidence,
    };

    return {
      primaryDecision: "found",
      product,
      sources,
      primarySearchQueries: diag.searchQueries,
      primarySourceCount: diag.sourceCount,
      primaryDistinctSourceDomains: diag.distinctSourceDomains,
      elapsedMs,
    };
  } catch (err) {
    return {
      primaryDecision: "error",
      product: null,
      sources: [],
      primarySearchQueries: [],
      primarySourceCount: 0,
      primaryDistinctSourceDomains: [],
      elapsedMs: Date.now() - started,
      errorCode: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

export function evaluateIsolatedSelectionAcceptance(input: {
  requestedItem: string;
  product: ProductDiscoveryProduct;
  evidenceText: string | null;
}): ReturnType<typeof finalizeAcceptedProduct> {
  return finalizeAcceptedProduct({
    source: "rescue",
    requestedItem: input.requestedItem,
    product: input.product,
    evidenceText: input.evidenceText ?? input.product.name,
  });
}
