import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ParsedResponse } from "openai/resources/responses/responses";
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import { finalizeAcceptedProduct, type AcceptanceResult } from "./acceptancePolicy";
import { domainAllowed } from "./domains";
import {
  buildRequirementPolicyHints,
  normalizeMatchScore,
  normalizeRequirementLists,
} from "./matchPolicy";
import { mergeProductDiscoverySources, toPlainSources } from "./mergeSources";
import { attemptSourceBackedRescue } from "./rescue";
import { productDiscoveryModelSchema, type ProductDiscoveryModelOutput } from "./schema";
import {
  extractWebSearchSources,
  isProductUrlEvidenceBacked,
  responseUsedWebSearch,
} from "./sources";
import type { ProductDiscoverySource, ProductDiscoveryProduct, ProductDiscoveryResult } from "./types";
import {
  TARGETED_RESEARCH_SYSTEM_PROMPT,
  buildTargetedResearchUserMessage,
} from "./targetedResearchPrompt";
import { OPENAI_PRODUCT_SEARCH_MODEL } from "./constants";
import type { InitialFailureReason } from "./rescue";

function clampMatchScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

function specificationsToRecord(
  specs: Array<{ key: string; value: string | number | boolean | null }> | undefined
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const entry of specs ?? []) {
    if (entry.key.trim()) out[entry.key.trim()] = entry.value;
  }
  return out;
}

export function sanitizeModelProductOutput(
  parsed: ProductDiscoveryModelOutput,
  requestedItem: string,
  allowlistDomains: string[],
  sources: ProductDiscoverySource[]
):
  | { ok: true; product: ProductDiscoveryProduct }
  | { ok: false; initialFailureReason: InitialFailureReason | null } {
  if (parsed.status !== "found" || !parsed.product) {
    return { ok: false, initialFailureReason: "model_not_found" };
  }

  const product = parsed.product;
  const retailerDomain = normalizeDomainToRoot(product.retailerDomain || product.productUrl);

  if (
    !domainAllowed(product.productUrl, allowlistDomains) ||
    (retailerDomain && !allowlistDomains.includes(retailerDomain))
  ) {
    return { ok: false, initialFailureReason: "domain_not_allowed" };
  }

  if (!isProductUrlEvidenceBacked(product.productUrl, sources)) {
    return { ok: false, initialFailureReason: "url_not_in_sources" };
  }

  const price =
    typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0
      ? product.price
      : null;

  const requirementLists = normalizeRequirementLists(
    requestedItem,
    {
      matchedRequirements: product.matchedRequirements ?? [],
      unmetRequirements: product.unmetRequirements ?? [],
      unknownRequirements: product.unknownRequirements ?? [],
    },
    price
  );

  const matchScore = normalizeMatchScore({
    matchScore: clampMatchScore(product.matchScore),
    unmetRequirements: requirementLists.unmetRequirements,
    unknownRequirements: requirementLists.unknownRequirements,
  });

  const currency =
    price != null && product.currency?.trim().toUpperCase() === "EUR" ? "EUR" : null;

  return {
    ok: true,
    product: {
      name: product.name.trim(),
      retailer: product.retailer.trim(),
      retailerDomain: retailerDomain || product.retailerDomain,
      productUrl: product.productUrl,
      price,
      currency,
      priceUnit: product.priceUnit,
      imageUrl: product.imageUrl?.startsWith("https://") ? product.imageUrl : null,
      specifications: specificationsToRecord(product.specifications),
      matchScore,
      matchedRequirements: requirementLists.matchedRequirements,
      unmetRequirements: requirementLists.unmetRequirements,
      unknownRequirements: requirementLists.unknownRequirements,
      whyItMatches: product.whyItMatches.trim(),
      priceEvidence: price != null ? "web_search" : "none",
    },
  };
}

export function productEvidenceText(
  product: ProductDiscoveryProduct,
  sources: ProductDiscoverySource[]
): string {
  const sourceTitle =
    sources.find((source) => source.url === product.productUrl)?.title ??
    sources.find((source) => product.productUrl.includes(source.url))?.title ??
    null;
  return [product.name, product.whyItMatches, sourceTitle].filter(Boolean).join("\n");
}

export function buildAcceptanceDiagnostics(
  source: "primary" | "rescue" | "targeted",
  finalized: AcceptanceResult
) {
  return {
    acceptanceChecked: true,
    acceptanceSource: source,
    acceptanceScore: finalized.matchScore,
    requirementCoverage: finalized.requirementCoverage,
    acceptanceReason: finalized.reason,
  };
}

export type PassProcessResult = {
  status: "found" | "not_found";
  product: ProductDiscoveryProduct | null;
  sources: ProductDiscoverySource[];
  rescueAttempted: boolean;
  rescueSelected: boolean;
  rescueSucceeded: boolean;
  rescueCandidateCount: number;
  rescueSelectedCandidateId: string | null;
  rescueElapsedMs: number | null;
  rejectedProduct: ProductDiscoveryProduct | null;
  acceptance?: AcceptanceResult;
  acceptanceSource?: "primary" | "rescue" | "targeted" | null;
  enrichmentStats?: Awaited<ReturnType<typeof attemptSourceBackedRescue>>["enrichmentStats"];
};

export async function processPassCandidates(input: {
  client: OpenAI;
  requestedItem: string;
  allowlistDomains: string[];
  sources: ProductDiscoverySource[];
  parsed: ProductDiscoveryModelOutput | null;
  acceptanceSource: "primary" | "targeted";
}): Promise<PassProcessResult> {
  const base: PassProcessResult = {
    status: "not_found",
    product: null,
    sources: input.sources,
    rescueAttempted: false,
    rescueSelected: false,
    rescueSucceeded: false,
    rescueCandidateCount: 0,
    rescueSelectedCandidateId: null,
    rescueElapsedMs: null,
    rejectedProduct: null,
  };

  if (input.parsed) {
    const direct = sanitizeModelProductOutput(
      input.parsed,
      input.requestedItem,
      input.allowlistDomains,
      input.sources
    );
    if (direct.ok) {
      const finalized = finalizeAcceptedProduct({
        requestedItem: input.requestedItem,
        source: input.acceptanceSource,
        product: direct.product,
        evidenceText: productEvidenceText(direct.product, input.sources),
      });
      if (finalized.accepted) {
        return {
          ...base,
          status: "found",
          product: finalized.product,
          acceptance: finalized,
          acceptanceSource: input.acceptanceSource,
        };
      }
      base.rejectedProduct = finalized.product;
      base.acceptance = finalized;
      base.acceptanceSource = input.acceptanceSource;
    }
  }

  const rescue = await attemptSourceBackedRescue({
    client: input.client,
    requestedItem: input.requestedItem,
    sources: input.sources,
    allowlistDomains: input.allowlistDomains,
  });

  base.rescueAttempted = rescue.rescueAttempted;
  base.rescueCandidateCount = rescue.rescueCandidateCount;
  base.rescueSelected = rescue.rescueSelected;
  base.rescueSelectedCandidateId = rescue.rescueSelectedCandidateId;
  base.rescueElapsedMs = rescue.rescueElapsedMs;
  base.enrichmentStats = rescue.enrichmentStats;

  if (!rescue.product) {
    return base;
  }

  const finalized = finalizeAcceptedProduct({
    requestedItem: input.requestedItem,
    source: "rescue",
    product: rescue.product,
    evidenceText: rescue.evidenceText ?? undefined,
  });

  if (finalized.accepted) {
    return {
      ...base,
      status: "found",
      product: finalized.product,
      rescueSucceeded: true,
      acceptance: finalized,
      acceptanceSource: "rescue",
    };
  }

  return {
    ...base,
    rejectedProduct: finalized.product,
    acceptance: finalized,
    acceptanceSource: "rescue",
  };
}

export type TargetedResearchResult = {
  attempted: boolean;
  searchUsed: boolean;
  sourceCount: number;
  accepted: boolean;
  durationMs: number;
  result: ProductDiscoveryResult | null;
};

export async function attemptTargetedResearch(input: {
  client: OpenAI;
  requestedItem: string;
  allowlistDomains: string[];
  primarySources: ProductDiscoverySource[];
  priorDiagnostics?: ProductDiscoveryResult["diagnostics"];
  priorRejectedProduct?: ProductDiscoveryProduct | null;
}): Promise<TargetedResearchResult> {
  const started = Date.now();
  const priorFailure = {
    primaryStatus: input.priorDiagnostics?.primaryStatus ?? null,
    initialFailureReason: input.priorDiagnostics?.initialFailureReason ?? null,
    acceptanceReason: input.priorDiagnostics?.acceptanceReason ?? null,
    unresolvedRequirements: [
      ...(input.priorRejectedProduct?.unknownRequirements ?? []),
      ...(input.priorRejectedProduct?.unmetRequirements ?? []),
    ],
  };

  try {
    const response: ParsedResponse<ProductDiscoveryModelOutput> = await input.client.responses.parse({
      model: OPENAI_PRODUCT_SEARCH_MODEL,
      instructions: TARGETED_RESEARCH_SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildTargetedResearchUserMessage({
                requestedItem: input.requestedItem,
                allowedDomains: input.allowlistDomains,
                requirementPolicy: buildRequirementPolicyHints(input.requestedItem),
                priorFailure,
              }),
            },
          ],
        },
      ],
      tools: [
        {
          type: "web_search",
          search_context_size: "medium",
          filters: { allowed_domains: input.allowlistDomains },
        },
      ],
      tool_choice: "required",
      reasoning: { effort: "low" },
      include: ["web_search_call.action.sources"],
      text: { format: zodTextFormat(productDiscoveryModelSchema, "product_discovery_result") },
    });

    const targetedSources = extractWebSearchSources(response);
    const searchUsed = responseUsedWebSearch(response);
    const mergedTagged = mergeProductDiscoverySources(input.primarySources, targetedSources);
    const mergedSources = toPlainSources(mergedTagged);
    const durationMs = Date.now() - started;

    if (!searchUsed) {
      return {
        attempted: true,
        searchUsed: false,
        sourceCount: targetedSources.length,
        accepted: false,
        durationMs,
        result: null,
      };
    }

    const pass = await processPassCandidates({
      client: input.client,
      requestedItem: input.requestedItem,
      allowlistDomains: input.allowlistDomains,
      sources: targetedSources,
      parsed: response.output_parsed ?? null,
      acceptanceSource: "targeted",
    });

    const result: ProductDiscoveryResult = {
      requestedItem: input.requestedItem,
      status: pass.status,
      product: pass.product,
      sources: mergedSources,
      diagnostics: {
        searchUsed: true,
        allowedDomainsCount: input.allowlistDomains.length,
        elapsedMs: (input.priorDiagnostics?.elapsedMs ?? 0) + durationMs,
        primaryStatus: input.priorDiagnostics?.primaryStatus,
        initialFailureReason: input.priorDiagnostics?.initialFailureReason,
        rescueAttempted: (input.priorDiagnostics?.rescueAttempted ?? false) || pass.rescueAttempted,
        rescueCandidateCount: pass.rescueCandidateCount,
        rescueSelected: (input.priorDiagnostics?.rescueSelected ?? false) || pass.rescueSelected,
        rescueSucceeded: input.priorDiagnostics?.rescueSucceeded ?? false,
        rescueElapsedMs: pass.rescueElapsedMs ?? input.priorDiagnostics?.rescueElapsedMs,
        rescueSelectedCandidateId: pass.rescueSelectedCandidateId,
        enrichmentAttemptedCount: pass.enrichmentStats?.enrichmentAttemptedCount,
        enrichmentSuccessCount: pass.enrichmentStats?.enrichmentSuccessCount,
        enrichment403Count: pass.enrichmentStats?.enrichment403Count,
        enrichmentTimeoutCount: pass.enrichmentStats?.enrichmentTimeoutCount,
        rejectedProduct: pass.status === "found" ? null : pass.rejectedProduct,
        targetedResearchAttempted: true,
        targetedResearchSearchUsed: true,
        targetedResearchSourceCount: targetedSources.length,
        targetedResearchAccepted: pass.status === "found",
        targetedResearchDurationMs: durationMs,
        targetedFailureReasonBeforeSearch: input.priorDiagnostics?.acceptanceReason ?? null,
        targetedRecovered: pass.status === "found",
        targetedResultAcceptanceReason: pass.acceptance?.reason ?? null,
        ...(pass.acceptance
          ? buildAcceptanceDiagnostics(pass.acceptanceSource ?? "targeted", pass.acceptance)
          : {}),
      },
    };

    return {
      attempted: true,
      searchUsed: true,
      sourceCount: targetedSources.length,
      accepted: pass.status === "found",
      durationMs,
      result,
    };
  } catch {
    return {
      attempted: true,
      searchUsed: false,
      sourceCount: 0,
      accepted: false,
      durationMs: Date.now() - started,
      result: null,
    };
  }
}
