import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ParsedResponse } from "openai/resources/responses/responses";
import { isProductionDeployment } from "@/lib/env/deployment";
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import {
  OPENAI_PRODUCT_SEARCH_TIMEOUT_MS,
  isProductDiscoverySerpFallbackEnabled,
} from "./constants";
import {
  beginProductDiscoveryModelTrace,
  getProductDiscoveryModel,
  productDiscoveryModelDiagnostics,
  recordPrimaryModelStage,
} from "./modelRouting";
import { domainAllowed, normalizeProductDiscoveryAllowlist } from "./domains";
import {
  buildRequirementPolicyHints,
  buildSuggestedSearchQueriesForRequest,
  normalizeMatchScore,
  normalizeRequirementLists,
} from "./matchPolicy";
import { finalizeAcceptedProduct, type AcceptanceSource } from "./acceptancePolicy";
import {
  attemptPriceVerificationRecovery,
  buildPriceVerificationDiagnostics,
} from "./attemptPriceVerificationRecovery";
import {
  buildEvidenceDiagnostics,
  buildProductEvidence,
  buildTrustedEvidenceText,
  resolveGroundedPrice,
  resolveTrustedDisplayName,
} from "./productEvidence";
import {
  buildDecisionSnapshot,
  buildProductEvidenceForDecision,
  buildRejectedDecisionSnapshot,
  preferConcreteRejectedSnapshot,
} from "./decisionSnapshot";
import { compactMerchantEvidenceForDebug } from "./enrichCandidate";
import {
  buildProductDiscoveryUserMessage,
  getProductDiscoverySystemPrompt,
} from "./prompt";
import { normalizeProductDiscoveryMarketContext } from "./marketContext";
import {
  attemptSourceBackedRescue,
  shouldAttemptRescue,
  type InitialFailureReason,
} from "./rescue";
import { productDiscoveryModelSchema, type ProductDiscoveryModelOutput } from "./schema";
import { extractModelProposedCandidates, withModelCandidatePool } from "./stepCCandidates";
import {
  addOpenAiUsage,
  emptyOpenAiUsage,
  extractOpenAiResponseUsage,
  extractPrimarySearchDiagnostics,
  extractWebSearchSources,
  isProductUrlEvidenceBacked,
  responseUsedWebSearch,
  type OpenAiUsageDiagnostics,
} from "./sources";
import type { ProductDiscoveryResult, ProductDiscoverySource, ProductDiscoveryProduct } from "./types";
import { attemptTargetedResearch } from "./searchPass";
import { attemptSerpFallback } from "./serpFallback";
import {
  openAiFinalFailureReason,
  shouldUseSerpFallback,
} from "./serpFallbackEligibility";

export type SearchProductItemOptions = {
  requestedItem: string;
  allowlistDomains: string[];
  client?: OpenAI;
  /** Caps the OpenAI client timeout. Cannot exceed OPENAI_PRODUCT_SEARCH_TIMEOUT_MS. */
  timeoutMs?: number;
  marketContext?: {
    countryCode?: string | null;
    formattedLocation?: string | null;
    merchantDomains?: string[];
  } | null;
};

type PrimarySanitizeOutcome =
  | { ok: true; product: NonNullable<ProductDiscoveryResult["product"]> }
  | { ok: false; initialFailureReason: InitialFailureReason | null };

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return key;
}

const usageByClient = new WeakMap<object, { current: OpenAiUsageDiagnostics }>();

function trackClientUsage(client: OpenAI): OpenAI {
  const acc = { current: emptyOpenAiUsage() };
  const parse = client.responses.parse.bind(client.responses);
  client.responses.parse = (async (
    body: Parameters<OpenAI["responses"]["parse"]>[0],
    options?: Parameters<OpenAI["responses"]["parse"]>[1]
  ) => {
    const response = await parse(body, options);
    acc.current = addOpenAiUsage(acc.current, extractOpenAiResponseUsage(response));
    return response;
  }) as typeof client.responses.parse;
  usageByClient.set(client, acc);
  beginProductDiscoveryModelTrace(client);
  return client;
}

function attachModelRoutingDiagnostics(
  result: ProductDiscoveryResult,
  client?: OpenAI | null
): ProductDiscoveryResult {
  const routing = productDiscoveryModelDiagnostics(client);
  return {
    ...result,
    diagnostics: {
      searchUsed: result.diagnostics?.searchUsed ?? false,
      allowedDomainsCount: result.diagnostics?.allowedDomainsCount ?? 0,
      ...result.diagnostics,
      modelRouting: routing.modelRouting,
      primaryModel: routing.primaryModel,
      targetedAttempted: routing.targetedAttempted,
      targetedModel: routing.targetedModel,
      usageByStage: routing.usageByStage,
    },
  };
}

function attachTrackedUsage(result: ProductDiscoveryResult, client: OpenAI): ProductDiscoveryResult {
  const usage = usageByClient.get(client)?.current;
  const withRouting = attachModelRoutingDiagnostics(result, client);
  if (!usage) return withRouting;
  return {
    ...withRouting,
    diagnostics: {
      searchUsed: withRouting.diagnostics?.searchUsed ?? false,
      allowedDomainsCount: withRouting.diagnostics?.allowedDomainsCount ?? 0,
      ...withRouting.diagnostics,
      openAiUsage: addOpenAiUsage(withRouting.diagnostics?.openAiUsage, usage),
    },
  };
}

function logProductDiscovery(event: Record<string, unknown>): void {
  if (isProductionDeployment()) return;
  console.info("[openai-product-discovery]", event);
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

function clampMatchScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

function primaryEvidenceText(
  productUrl: string,
  sources: ProductDiscoverySource[]
): string {
  const display = resolveTrustedDisplayName({
    sources,
    productUrl,
  });
  return buildTrustedEvidenceText({
    productUrl,
    sources,
    trustedDisplayName: display.verified ? display.name : null,
  });
}

function evidenceDiagnosticsForProduct(
  product: ProductDiscoveryProduct,
  sources: ProductDiscoverySource[],
  modelReportedPrice?: number | null
) {
  const evidence = buildProductEvidence({
    productUrl: product.productUrl,
    sources,
  });
  return {
    evidenceDiagnostics: {
      ...buildEvidenceDiagnostics({
        evidence,
        matchedRequirements: product.matchedRequirements,
        unsupportedModelClaims: [],
        priceEvidence: product.priceEvidence ?? "none",
      }),
      modelReportedPrice: modelReportedPrice ?? null,
      merchantEvidence: isProductionDeployment()
        ? undefined
        : compactMerchantEvidenceForDebug(product.productUrl),
    },
  };
}

async function maybeRecoverBudgetUnverified(input: {
  client: OpenAI;
  requestedItem: string;
  allowlistDomains: string[];
  sources: ProductDiscoverySource[];
  source: AcceptanceSource;
  finalized: ReturnType<typeof finalizeAcceptedProduct>;
  evidenceText?: string;
  priceVerificationAttempted: boolean;
}): Promise<{
  finalized: ReturnType<typeof finalizeAcceptedProduct>;
  priceVerificationAttempted: boolean;
  priceVerificationDiagnostics: ReturnType<typeof buildPriceVerificationDiagnostics>;
}> {
  if (input.priceVerificationAttempted || input.finalized.accepted) {
    return {
      finalized: input.finalized,
      priceVerificationAttempted: input.priceVerificationAttempted,
      priceVerificationDiagnostics: buildPriceVerificationDiagnostics({
        attempted: false,
        verification: null,
        durationMs: 0,
        recovered: false,
      }),
    };
  }

  const recovery = await attemptPriceVerificationRecovery({
    client: input.client,
    requestedItem: input.requestedItem,
    allowlistDomains: input.allowlistDomains,
    sources: input.sources,
    source: input.source,
    finalized: input.finalized,
    evidenceText: input.evidenceText,
  });

  return {
    finalized: recovery.finalized ?? input.finalized,
    priceVerificationAttempted: input.priceVerificationAttempted || recovery.attempted,
    priceVerificationDiagnostics: buildPriceVerificationDiagnostics({
      attempted: recovery.attempted,
      verification: recovery.verification,
      durationMs: recovery.durationMs,
      recovered: recovery.recovered,
    }),
  };
}

function buildAcceptanceDiagnostics(
  source: "primary" | "rescue" | "targeted" | "serp_fallback",
  finalized: ReturnType<typeof finalizeAcceptedProduct>,
  productEvidence?: import("./productEvidence").ProductEvidence | null,
  requestedItem?: string,
  candidateId?: string | null
) {
  const base = {
    acceptanceChecked: true,
    acceptanceSource: source,
    acceptanceScore: finalized.matchScore,
    requirementCoverage: finalized.requirementCoverage,
    acceptanceReason: finalized.reason,
  };
  if (!productEvidence || !requestedItem) return base;
  if (finalized.accepted) {
    return {
      ...base,
      acceptedDecisionSnapshot: buildDecisionSnapshot({
        requestedItem,
        path: source === "serp_fallback" ? "serp" : source,
        product: finalized.product,
        acceptance: finalized,
        productEvidence,
      }),
    };
  }
  return {
    ...base,
    rejectedDecisionSnapshot: buildRejectedDecisionSnapshot({
      requestedItem,
      path: source === "serp_fallback" ? "serp" : source,
      candidateId: candidateId ?? null,
      product: finalized.product,
      acceptance: finalized,
      productEvidence,
    }),
  };
}

function withTargetedResearchSkippedDiagnostics(
  diagnostics: ProductDiscoveryResult["diagnostics"]
): ProductDiscoveryResult["diagnostics"] {
  return {
    searchUsed: diagnostics?.searchUsed ?? false,
    allowedDomainsCount: diagnostics?.allowedDomainsCount ?? 0,
    ...diagnostics,
    targetedResearchAttempted: false,
    targetedResearchSearchUsed: false,
    targetedResearchSourceCount: 0,
    targetedResearchAccepted: false,
    targetedResearchDurationMs: null,
  };
}

function withSerpFallbackDisabledDiagnostics(
  result: ProductDiscoveryResult
): ProductDiscoveryResult["diagnostics"] {
  const diagnostics = result.diagnostics;
  const base = {
    searchUsed: diagnostics?.searchUsed ?? false,
    allowedDomainsCount: diagnostics?.allowedDomainsCount ?? 0,
    ...diagnostics,
    serpFallbackEnabled: false,
    serpFallbackAttempted: false,
    serpFallbackQueryCount: 0,
    serpFallbackCandidateCount: 0,
    serpFallbackSelectedCandidateId: null,
    serpFallbackAccepted: false,
    serpFallbackDurationMs: null,
    openAiFinalFailureReason:
      diagnostics?.openAiFinalFailureReason ?? openAiFinalFailureReason(diagnostics),
  };

  if (result.status === "found") {
    return {
      ...base,
      serpFallbackEligible: false,
      serpFallbackReason: "status_found",
    };
  }

  const eligibility = shouldUseSerpFallback({
    requestedItem: result.requestedItem,
    status: result.status,
    diagnostics,
  });

  return {
    ...base,
    serpFallbackEligible: eligibility.eligible,
    // Distinguish "would have been eligible but flag is off" from "not eligible".
    serpFallbackReason: eligibility.eligible
      ? "eligible_but_disabled"
      : eligibility.reason ?? "feature_disabled",
  };
}

async function finalizeWithSerpFallbackIfNeeded(
  result: ProductDiscoveryResult,
  ctx: {
    client: OpenAI;
    requestedItem: string;
    allowlistDomains: string[];
    primarySources: ProductDiscoverySource[];
    proposedCandidates?: ProductDiscoveryProduct[];
    marketContext?: {
      countryCode?: string | null;
      formattedLocation?: string | null;
      merchantDomains?: string[];
    } | null;
  }
): Promise<ProductDiscoveryResult> {
  result = withModelCandidatePool(result, ctx.proposedCandidates);
  if (!isProductDiscoverySerpFallbackEnabled()) {
    return attachTrackedUsage(
      {
        ...result,
        diagnostics: withSerpFallbackDisabledDiagnostics(result),
      },
      ctx.client
    );
  }

  if (result.status === "found") {
    return attachTrackedUsage(
      {
        ...result,
        diagnostics: {
          searchUsed: result.diagnostics?.searchUsed ?? false,
          allowedDomainsCount: result.diagnostics?.allowedDomainsCount ?? 0,
          ...result.diagnostics,
          serpFallbackEnabled: true,
          serpFallbackAttempted: false,
          serpFallbackEligible: false,
          serpFallbackReason: "status_found",
          serpFallbackQueryCount: 0,
          serpFallbackCandidateCount: 0,
          serpFallbackSelectedCandidateId: null,
          serpFallbackAccepted: false,
          serpFallbackDurationMs: null,
        },
      },
      ctx.client
    );
  }

  const fallbackResult = await attemptSerpFallback({
    client: ctx.client,
    requestedItem: ctx.requestedItem,
    allowlistDomains: ctx.allowlistDomains,
    primarySources: ctx.primarySources,
    result,
  });

  return attachTrackedUsage(
    {
      ...fallbackResult,
      diagnostics: {
        searchUsed: fallbackResult.diagnostics?.searchUsed ?? false,
        allowedDomainsCount: fallbackResult.diagnostics?.allowedDomainsCount ?? 0,
        ...fallbackResult.diagnostics,
        serpFallbackEnabled: true,
      },
    },
    ctx.client
  );
}

async function finalizeWithTargetedResearchIfNeeded(
  result: ProductDiscoveryResult,
  ctx: {
    client: OpenAI;
    requestedItem: string;
    allowlistDomains: string[];
    primarySources: ProductDiscoverySource[];
    proposedCandidates?: ProductDiscoveryProduct[];
    priceVerificationAttempted?: boolean;
    marketContext?: {
      countryCode?: string | null;
      formattedLocation?: string | null;
      merchantDomains?: string[];
    } | null;
  }
): Promise<ProductDiscoveryResult> {
  if (result.status !== "not_found") {
    return finalizeWithSerpFallbackIfNeeded(
      {
        ...result,
        diagnostics: withTargetedResearchSkippedDiagnostics(result.diagnostics),
      },
      ctx
    );
  }

  const targeted = await attemptTargetedResearch({
    client: ctx.client,
    requestedItem: ctx.requestedItem,
    allowlistDomains: ctx.allowlistDomains,
    primarySources: ctx.primarySources,
    priorDiagnostics: result.diagnostics,
    priorRejectedProduct: result.diagnostics?.rejectedProduct ?? null,
    marketContext: ctx.marketContext,
  });

    if (targeted.result?.status === "found") {
    logProductDiscovery({
      requestedItem: ctx.requestedItem,
      finalStatus: "found",
      targetedResearchAccepted: true,
      targetedResearchDurationMs: targeted.durationMs,
      totalDurationMs: targeted.result.diagnostics?.elapsedMs,
    });
    return finalizeWithSerpFallbackIfNeeded(targeted.result, ctx);
  }

  let finalResult = result;
  const rejected = result.diagnostics?.rejectedProduct;
  const acceptanceReason = result.diagnostics?.acceptanceReason;
  if (
    rejected &&
    acceptanceReason === "budget_unverified" &&
    !ctx.priceVerificationAttempted
  ) {
    const finalized = finalizeAcceptedProduct({
      requestedItem: ctx.requestedItem,
      source: result.diagnostics?.acceptanceSource ?? "primary",
      product: rejected,
    });
    const recovery = await maybeRecoverBudgetUnverified({
      client: ctx.client,
      requestedItem: ctx.requestedItem,
      allowlistDomains: ctx.allowlistDomains,
      sources: ctx.primarySources,
      source: result.diagnostics?.acceptanceSource ?? "primary",
      finalized,
      priceVerificationAttempted: ctx.priceVerificationAttempted ?? false,
    });
    if (recovery.finalized.accepted) {
      return finalizeWithSerpFallbackIfNeeded(
        {
          requestedItem: ctx.requestedItem,
          status: "found",
          product: recovery.finalized.product,
          sources: result.sources,
          diagnostics: {
            ...result.diagnostics,
            searchUsed: result.diagnostics?.searchUsed ?? false,
            allowedDomainsCount: result.diagnostics?.allowedDomainsCount ?? 0,
            ...buildAcceptanceDiagnostics(
              result.diagnostics?.acceptanceSource ?? "primary",
              recovery.finalized
            ),
            ...recovery.priceVerificationDiagnostics,
          },
        },
        ctx
      );
    }
    finalResult = {
      ...result,
      diagnostics: {
        searchUsed: result.diagnostics?.searchUsed ?? false,
        allowedDomainsCount: result.diagnostics?.allowedDomainsCount ?? 0,
        ...result.diagnostics,
        ...recovery.priceVerificationDiagnostics,
      },
    };
  }

  const targetedDiag = targeted.result?.diagnostics;
  const laterReject = targetedDiag?.rejectedDecisionSnapshot;
  const earlierReject = result.diagnostics?.rejectedDecisionSnapshot;
  const primaryHistory =
    result.diagnostics?.rescueRejectedDecisionSnapshot
    ?? (earlierReject?.path === "primary" ? earlierReject : undefined);
  const chosenReject = preferConcreteRejectedSnapshot(earlierReject, laterReject);
  const usedTargetedReject = chosenReject?.path === "targeted";
  return finalizeWithSerpFallbackIfNeeded(
    {
      ...finalResult,
      diagnostics: {
        searchUsed: result.diagnostics?.searchUsed ?? false,
        allowedDomainsCount: result.diagnostics?.allowedDomainsCount ?? 0,
        ...result.diagnostics,
        targetedResearchAttempted: targeted.attempted,
        targetedResearchSearchUsed: targeted.searchUsed,
        targetedResearchSourceCount: targeted.sourceCount,
        targetedResearchAccepted: false,
        targetedResearchDurationMs: targeted.durationMs,
        elapsedMs: (result.diagnostics?.elapsedMs ?? 0) + targeted.durationMs,
        targetedSelectedCandidateId: targetedDiag?.targetedSelectedCandidateId ?? null,
        targetedEnrichmentAttemptedCount: targetedDiag?.targetedEnrichmentAttemptedCount,
        targetedEnrichmentSuccessCount: targetedDiag?.targetedEnrichmentSuccessCount,
        targetedResultAcceptanceReason: targetedDiag?.acceptanceReason ?? null,
        rescueRejectedDecisionSnapshot: primaryHistory,
        rejectedDecisionSnapshot: chosenReject,
        ...(usedTargetedReject
          ? {
              rejectedProduct: targetedDiag?.rejectedProduct ?? result.diagnostics?.rejectedProduct,
              acceptanceReason: targetedDiag?.acceptanceReason ?? result.diagnostics?.acceptanceReason,
              acceptanceSource: "targeted" as const,
              acceptanceChecked: true,
            }
          : {}),
      },
    },
    ctx
  );
}

function buildRescueFinalResult(input: {
  requestedItem: string;
  allowlistDomains: string[];
  sources: ProductDiscoverySource[];
  started: number;
  initialFailureReason: InitialFailureReason | null;
  primaryRejectedProduct?: ProductDiscoveryProduct | null;
  primaryAcceptance?: ReturnType<typeof finalizeAcceptedProduct> | null;
  primaryProductEvidence?: import("./productEvidence").ProductEvidence | null;
  rescue: Awaited<ReturnType<typeof attemptSourceBackedRescue>>;
  priceVerificationDiagnostics?: ReturnType<typeof buildPriceVerificationDiagnostics>;
  rescueFinalized?: ReturnType<typeof finalizeAcceptedProduct> | null;
  primarySearchDiagFields?: {
    primaryWebSearchCallCount: number;
    primarySearchQueries: string[];
    primarySourceCount: number;
    primaryDistinctSourceDomains: string[];
  };
}): ProductDiscoveryResult {
  const totalElapsedMs = Date.now() - input.started;
  const enrichmentDiagnostics = {
    enrichmentAttemptedCount: input.rescue.enrichmentStats?.enrichmentAttemptedCount,
    enrichmentSuccessCount: input.rescue.enrichmentStats?.enrichmentSuccessCount,
    enrichment403Count: input.rescue.enrichmentStats?.enrichment403Count,
    enrichmentTimeoutCount: input.rescue.enrichmentStats?.enrichmentTimeoutCount,
    rescueEnrichmentAttemptedCount: input.rescue.enrichmentStats?.enrichmentAttemptedCount,
    rescueEnrichmentSuccessCount: input.rescue.enrichmentStats?.enrichmentSuccessCount,
    rescueEnrichmentCandidateDebug: input.rescue.enrichmentStats?.candidateDebug,
    enrichmentCandidateDebug: input.rescue.enrichmentStats?.candidateDebug,
    rescueSelectedCandidateEnrichment: input.rescue.enrichmentStats?.selectedCandidateEnrichment,
    selectedAdditionalEnrichmentAttempts:
      input.rescue.enrichmentStats?.selectedAdditionalEnrichmentAttempts ?? 0,
  };

  const baseDiagnostics = {
    searchUsed: true,
    allowedDomainsCount: input.allowlistDomains.length,
    elapsedMs: totalElapsedMs,
    initialFailureReason: input.initialFailureReason,
    primaryStatus: input.primaryRejectedProduct ? ("found" as const) : ("not_found" as const),
    rescueAttempted: input.rescue.rescueAttempted,
    rescueCandidateCount: input.rescue.rescueCandidateCount,
    rescueSelected: input.rescue.rescueSelected,
    rescueSelectedCandidateId: input.rescue.rescueSelectedCandidateId,
    rescueElapsedMs: input.rescue.rescueElapsedMs,
    ...enrichmentDiagnostics,
    ...input.primarySearchDiagFields,
  };

  if (!input.rescue.product) {
    logProductDiscovery({
      requestedItem: input.requestedItem,
      finalStatus: "not_found",
      rescueSelected: false,
      totalDurationMs: totalElapsedMs,
    });
    return {
      requestedItem: input.requestedItem,
      status: "not_found",
      product: null,
      sources: input.sources,
      diagnostics: {
        ...baseDiagnostics,
        rescueSucceeded: false,
        rejectedProduct: input.primaryRejectedProduct ?? null,
        ...(input.primaryAcceptance
          ? buildAcceptanceDiagnostics(
              "primary",
              input.primaryAcceptance,
              input.primaryProductEvidence,
              input.requestedItem
            )
          : {}),
        ...input.priceVerificationDiagnostics,
      },
    };
  }

  const finalized =
    input.rescueFinalized ??
    finalizeAcceptedProduct({
      requestedItem: input.requestedItem,
      source: "rescue",
      product: input.rescue.product,
      evidenceText: input.rescue.evidenceText ?? undefined,
    });

  if (finalized.accepted) {
    logProductDiscovery({
      requestedItem: input.requestedItem,
      finalStatus: "found",
      rescueSelected: true,
      acceptanceReason: finalized.reason,
      requirementCoverage: finalized.requirementCoverage,
      totalDurationMs: totalElapsedMs,
    });
    return {
      requestedItem: input.requestedItem,
      status: "found",
      product: finalized.product,
      sources: input.sources,
      diagnostics: {
        ...baseDiagnostics,
        rescueSucceeded: true,
        ...buildAcceptanceDiagnostics(
          "rescue",
          finalized,
          input.rescue.productEvidence,
          input.requestedItem
        ),
        ...input.priceVerificationDiagnostics,
      },
    };
  }

  logProductDiscovery({
    requestedItem: input.requestedItem,
    finalStatus: "not_found",
    rescueSelected: true,
    acceptanceReason: finalized.reason,
    requirementCoverage: finalized.requirementCoverage,
    totalDurationMs: totalElapsedMs,
  });

  return {
    requestedItem: input.requestedItem,
    status: "not_found",
    product: null,
    sources: input.sources,
    diagnostics: {
      ...baseDiagnostics,
      rescueSucceeded: false,
      rejectedProduct: finalized.product,
      ...buildAcceptanceDiagnostics(
        "rescue",
        finalized,
        input.rescue.productEvidence,
        input.requestedItem,
        input.rescue.rescueSelectedCandidateId
      ),
      rescueRejectedDecisionSnapshot:
        input.primaryAcceptance && input.primaryProductEvidence
          ? (() => {
              const diag = buildAcceptanceDiagnostics(
                "primary",
                input.primaryAcceptance,
                input.primaryProductEvidence,
                input.requestedItem
              );
              return "rejectedDecisionSnapshot" in diag ? diag.rejectedDecisionSnapshot : undefined;
            })()
          : undefined,
      ...input.priceVerificationDiagnostics,
    },
  };
}

function sanitizePrimaryProductOutput(
  parsed: ProductDiscoveryModelOutput,
  requestedItem: string,
  allowlistDomains: string[],
  sources: ProductDiscoverySource[]
): PrimarySanitizeOutcome {
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

  const modelReportedPrice =
    typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0
      ? product.price
      : null;

  const display = resolveTrustedDisplayName({
    sources,
    productUrl: product.productUrl,
    modelName: product.name,
  });
  const evidence = buildProductEvidence({
    productUrl: product.productUrl,
    sources,
    trustedDisplayName: display.verified ? display.name : null,
  });
  const groundedPrice = resolveGroundedPrice({
    evidence,
    modelClaimedPrice: modelReportedPrice,
  });
  const price = groundedPrice.price;
  const currency =
    price != null && (groundedPrice.currency === "EUR" || product.currency?.trim().toUpperCase() === "EUR")
      ? "EUR"
      : price != null
        ? groundedPrice.currency
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

  return {
    ok: true,
    product: {
      name: display.name,
      retailer: product.retailer.trim(),
      retailerDomain: retailerDomain || product.retailerDomain,
      productUrl: product.productUrl,
      price,
      currency,
      priceUnit: product.priceUnit,
      imageUrl: product.imageUrl?.startsWith("https://") ? product.imageUrl : null,
      // Keep model specs for display/debug only — acceptance must not treat them as evidence.
      specifications: specificationsToRecord(product.specifications),
      matchScore,
      matchedRequirements: requirementLists.matchedRequirements,
      unmetRequirements: requirementLists.unmetRequirements,
      unknownRequirements: requirementLists.unknownRequirements,
      whyItMatches: product.whyItMatches.trim(),
      sku: product.sku ?? null,
      category: product.category ?? requestedItem,
      rank: product.rank ?? undefined,
      sourceUrls: product.sourceUrls ?? undefined,
      priceEvidence: groundedPrice.priceEvidence,
    },
  };
}

export async function searchProductItem(
  options: SearchProductItemOptions
): Promise<ProductDiscoveryResult> {
  const requestedItem = options.requestedItem.trim();
  const allowlistDomains = normalizeProductDiscoveryAllowlist(options.allowlistDomains);
  const marketContext = normalizeProductDiscoveryMarketContext(
    options.marketContext,
    allowlistDomains
  );
  const started = Date.now();
  let proposedCandidates: ProductDiscoveryProduct[] = [];

  if (!requestedItem) {
    return attachModelRoutingDiagnostics({
      requestedItem: "",
      status: "error",
      product: null,
      sources: [],
      diagnostics: { searchUsed: false, allowedDomainsCount: 0, errorCode: "empty_item" },
    });
  }

  if (allowlistDomains.length === 0) {
    return attachModelRoutingDiagnostics({
      requestedItem,
      status: "no_retailers",
      product: null,
      sources: [],
      diagnostics: { searchUsed: false, allowedDomainsCount: 0 },
    });
  }

  const timeoutMs = Math.min(
    OPENAI_PRODUCT_SEARCH_TIMEOUT_MS,
    Math.max(1, options.timeoutMs ?? OPENAI_PRODUCT_SEARCH_TIMEOUT_MS)
  );
  const client = trackClientUsage(
    options.client ??
      new OpenAI({
        apiKey: requireApiKey(),
        timeout: timeoutMs,
        maxRetries: 0,
      })
  );

  try {
    const response: ParsedResponse<ProductDiscoveryModelOutput> = await client.responses.parse({
      model: getProductDiscoveryModel("primary"),
      instructions: getProductDiscoverySystemPrompt(),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildProductDiscoveryUserMessage({
                requestedItem,
                allowedDomains: allowlistDomains,
                requirementPolicy: buildRequirementPolicyHints(requestedItem),
                suggestedSearchQueries: buildSuggestedSearchQueriesForRequest(
                  requestedItem,
                  allowlistDomains
                ),
                marketContext,
              }),
            },
          ],
        },
      ],
      tools: [
        {
          type: "web_search",
          search_context_size: "medium",
          filters: { allowed_domains: allowlistDomains },
        },
      ],
      tool_choice: "required",
      reasoning: { effort: "low" },
      include: ["web_search_call.action.sources"],
      text: { format: zodTextFormat(productDiscoveryModelSchema, "product_discovery_result") },
    });

    const sources = extractWebSearchSources(response);
    recordPrimaryModelStage(client, extractOpenAiResponseUsage(response));
    const primarySearchDiagnostics = extractPrimarySearchDiagnostics(response, sources);
    const primarySearchDiagFields = {
      primaryWebSearchCallCount: primarySearchDiagnostics.webSearchCallCount,
      primarySearchQueries: primarySearchDiagnostics.searchQueries,
      primarySourceCount: primarySearchDiagnostics.sourceCount,
      primaryDistinctSourceDomains: primarySearchDiagnostics.distinctSourceDomains,
    };
    const parsed = response.output_parsed;
    const primaryElapsedMs = Date.now() - started;
    const searchUsed = responseUsedWebSearch(response);
    if (searchUsed) {
      proposedCandidates = extractModelProposedCandidates({
        parsed,
        requestedItem,
        allowlistDomains,
      });
    }

    if (!searchUsed) {
      logProductDiscovery({
        requestedItem,
        allowedDomainsCount: allowlistDomains.length,
        primaryStatus: "not_found",
        finalStatus: "not_found",
        elapsedMs: primaryElapsedMs,
        errorCode: "web_search_not_used",
        ...primarySearchDiagFields,
      });
      return finalizeWithTargetedResearchIfNeeded(
        {
          requestedItem,
          status: "not_found",
          product: null,
          sources,
          diagnostics: {
            searchUsed: false,
            allowedDomainsCount: allowlistDomains.length,
            elapsedMs: primaryElapsedMs,
            errorCode: "web_search_not_used",
            primaryStatus: "not_found",
            ...primarySearchDiagFields,
          },
        },
        { client, requestedItem, allowlistDomains, primarySources: sources, marketContext, proposedCandidates }
      );
    }

    if (!parsed) {
      return finalizeWithTargetedResearchIfNeeded(
        {
          requestedItem,
          status: "not_found",
          product: null,
          sources,
          diagnostics: {
            searchUsed: true,
            allowedDomainsCount: allowlistDomains.length,
            elapsedMs: primaryElapsedMs,
            errorCode: "invalid_model_output",
            primaryStatus: "not_found",
            ...primarySearchDiagFields,
          },
        },
        { client, requestedItem, allowlistDomains, primarySources: sources, marketContext, proposedCandidates }
      );
    }

    const primaryOutcome = sanitizePrimaryProductOutput(parsed, requestedItem, allowlistDomains, sources);

    if (primaryOutcome.ok) {
      let finalized = finalizeAcceptedProduct({
        requestedItem,
        source: "primary",
        product: primaryOutcome.product,
        evidenceText: primaryEvidenceText(primaryOutcome.product.productUrl, sources),
      });

      let priceVerificationAttempted = false;
      let priceVerificationDiagnostics = buildPriceVerificationDiagnostics({
        attempted: false,
        verification: null,
        durationMs: 0,
        recovered: false,
      });

      if (!finalized.accepted) {
        const recovery = await maybeRecoverBudgetUnverified({
          client,
          requestedItem,
          allowlistDomains,
          sources,
          source: "primary",
          finalized,
          evidenceText: primaryEvidenceText(primaryOutcome.product.productUrl, sources),
          priceVerificationAttempted,
        });
        finalized = recovery.finalized;
        priceVerificationAttempted = recovery.priceVerificationAttempted;
        priceVerificationDiagnostics = recovery.priceVerificationDiagnostics;
      }

      if (finalized.accepted) {
        const totalElapsedMs = Date.now() - started;
        const decisionEvidence = buildProductEvidenceForDecision({
          productUrl: finalized.product.productUrl,
          sources,
          trustedDisplayName: finalized.product.name,
        });
        logProductDiscovery({
          requestedItem,
          allowedDomainsCount: allowlistDomains.length,
          primaryStatus: "found",
          finalStatus: "found",
          sourceCount: sources.length,
          rescueAttempted: false,
          acceptanceReason: finalized.reason,
          requirementCoverage: finalized.requirementCoverage,
          totalDurationMs: totalElapsedMs,
          priceVerificationRecovered: priceVerificationDiagnostics.priceVerificationRecovered,
        });
        return finalizeWithSerpFallbackIfNeeded(
          {
            requestedItem,
            status: "found",
            product: finalized.product,
            sources,
            diagnostics: withTargetedResearchSkippedDiagnostics({
              searchUsed: true,
              allowedDomainsCount: allowlistDomains.length,
              elapsedMs: totalElapsedMs,
              rescueAttempted: false,
              primaryStatus: "found",
              ...buildAcceptanceDiagnostics("primary", finalized, decisionEvidence, requestedItem),
              ...priceVerificationDiagnostics,
              ...primarySearchDiagFields,
              ...evidenceDiagnosticsForProduct(finalized.product, sources),
            }),
          },
          { client, requestedItem, allowlistDomains, primarySources: sources, marketContext, proposedCandidates }
        );
      }

      const runRescueAfterPrimaryReject = shouldAttemptRescue({
        primaryStatus: "not_found",
        initialFailureReason: null,
        searchUsed: true,
        sourceCount: sources.length,
        acceptanceRejected: true,
      });

      const primaryDecisionEvidence = buildProductEvidenceForDecision({
        productUrl: finalized.product.productUrl,
        sources,
        trustedDisplayName: finalized.product.name,
      });

      if (runRescueAfterPrimaryReject) {
        const rescue = await attemptSourceBackedRescue({
          client,
          requestedItem,
          sources,
          allowlistDomains,
        });

        let rescueFinalized = rescue.product
          ? finalizeAcceptedProduct({
              requestedItem,
              source: "rescue",
              product: rescue.product,
              evidenceText: rescue.evidenceText ?? undefined,
            })
          : null;

        if (rescueFinalized && !rescueFinalized.accepted && !priceVerificationAttempted) {
          const recovery = await maybeRecoverBudgetUnverified({
            client,
            requestedItem,
            allowlistDomains,
            sources,
            source: "rescue",
            finalized: rescueFinalized,
            evidenceText: rescue.evidenceText ?? undefined,
            priceVerificationAttempted,
          });
          rescueFinalized = recovery.finalized;
          priceVerificationAttempted = recovery.priceVerificationAttempted;
          priceVerificationDiagnostics = recovery.priceVerificationDiagnostics;
        }

        if (rescueFinalized?.accepted) {
          const totalElapsedMs = Date.now() - started;
          return finalizeWithSerpFallbackIfNeeded(
            {
              requestedItem,
              status: "found",
              product: rescueFinalized.product,
              sources,
              diagnostics: {
                searchUsed: true,
                allowedDomainsCount: allowlistDomains.length,
                elapsedMs: totalElapsedMs,
                initialFailureReason: null,
                primaryStatus: "found",
                rescueAttempted: rescue.rescueAttempted,
                rescueCandidateCount: rescue.rescueCandidateCount,
                rescueSelected: rescue.rescueSelected,
                rescueSucceeded: true,
                rescueElapsedMs: rescue.rescueElapsedMs,
                rescueSelectedCandidateId: rescue.rescueSelectedCandidateId,
                ...buildAcceptanceDiagnostics(
                  "rescue",
                  rescueFinalized,
                  rescue.productEvidence,
                  requestedItem
                ),
                ...priceVerificationDiagnostics,
                ...primarySearchDiagFields,
              },
            },
            { client, requestedItem, allowlistDomains, primarySources: sources, marketContext, proposedCandidates }
          );
        }

        return finalizeWithTargetedResearchIfNeeded(
          buildRescueFinalResult({
            requestedItem,
            allowlistDomains,
            sources,
            started,
            initialFailureReason: null,
            primaryRejectedProduct: finalized.product,
            primaryAcceptance: finalized,
            primaryProductEvidence: primaryDecisionEvidence,
            rescue,
            rescueFinalized,
            priceVerificationDiagnostics,
            primarySearchDiagFields,
          }),
          { client, requestedItem, allowlistDomains, primarySources: sources, priceVerificationAttempted, marketContext, proposedCandidates }
        );
      }

      const totalElapsedMs = Date.now() - started;
      return finalizeWithTargetedResearchIfNeeded(
        {
          requestedItem,
          status: "not_found",
          product: null,
          sources,
          diagnostics: {
            searchUsed: true,
            allowedDomainsCount: allowlistDomains.length,
            elapsedMs: totalElapsedMs,
            primaryStatus: "found",
            rescueAttempted: false,
            rejectedProduct: finalized.product,
            ...buildAcceptanceDiagnostics(
              "primary",
              finalized,
              primaryDecisionEvidence,
              requestedItem
            ),
            ...priceVerificationDiagnostics,
            ...primarySearchDiagFields,
          },
        },
        { client, requestedItem, allowlistDomains, primarySources: sources, priceVerificationAttempted, marketContext, proposedCandidates }
      );
    }

    const initialFailureReason = primaryOutcome.initialFailureReason;
    const runRescue = shouldAttemptRescue({
      primaryStatus: "not_found",
      initialFailureReason,
      searchUsed: true,
      sourceCount: sources.length,
    });

    if (!runRescue) {
      const totalElapsedMs = Date.now() - started;
      return finalizeWithTargetedResearchIfNeeded(
        {
          requestedItem,
          status: "not_found",
          product: null,
          sources,
          diagnostics: {
            searchUsed: true,
            allowedDomainsCount: allowlistDomains.length,
            elapsedMs: totalElapsedMs,
            initialFailureReason,
            primaryStatus: "not_found",
            rescueAttempted: false,
            ...primarySearchDiagFields,
          },
        },
        { client, requestedItem, allowlistDomains, primarySources: sources, marketContext, proposedCandidates }
      );
    }

    const rescue = await attemptSourceBackedRescue({
      client,
      requestedItem,
      sources,
      allowlistDomains,
    });

    let priceVerificationAttempted = false;
    let priceVerificationDiagnostics = buildPriceVerificationDiagnostics({
      attempted: false,
      verification: null,
      durationMs: 0,
      recovered: false,
    });
    let rescueFinalized: ReturnType<typeof finalizeAcceptedProduct> | null = null;

    if (rescue.product) {
      rescueFinalized = finalizeAcceptedProduct({
        requestedItem,
        source: "rescue",
        product: rescue.product,
        evidenceText: rescue.evidenceText ?? undefined,
      });

      if (!rescueFinalized.accepted) {
        const recovery = await maybeRecoverBudgetUnverified({
          client,
          requestedItem,
          allowlistDomains,
          sources,
          source: "rescue",
          finalized: rescueFinalized,
          evidenceText: rescue.evidenceText ?? undefined,
          priceVerificationAttempted,
        });
        rescueFinalized = recovery.finalized;
        priceVerificationAttempted = recovery.priceVerificationAttempted;
        priceVerificationDiagnostics = recovery.priceVerificationDiagnostics;
      }
    }

    return finalizeWithTargetedResearchIfNeeded(
      buildRescueFinalResult({
        requestedItem,
        allowlistDomains,
        sources,
        started,
        initialFailureReason,
        rescue,
        rescueFinalized,
        priceVerificationDiagnostics,
        primarySearchDiagFields,
      }),
      { client, requestedItem, allowlistDomains, primarySources: sources, priceVerificationAttempted, marketContext, proposedCandidates }
    );
  } catch (error) {
    const elapsedMs = Date.now() - started;
    const message = error instanceof Error ? error.message.slice(0, 200) : "openai_error";
    logProductDiscovery({
      requestedItem,
      allowedDomainsCount: allowlistDomains.length,
      status: "error",
      elapsedMs,
      errorCode: message,
    });
    return attachTrackedUsage(
      {
        requestedItem,
        status: "error",
        product: null,
        sources: [],
        diagnostics: {
          searchUsed: false,
          allowedDomainsCount: allowlistDomains.length,
          elapsedMs,
          errorCode: message,
        },
      },
      client
    );
  }
}
