import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ParsedResponse } from "openai/resources/responses/responses";
import { isProductionDeployment } from "@/lib/env/deployment";
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import {
  OPENAI_PRODUCT_SEARCH_MODEL,
  OPENAI_PRODUCT_SEARCH_TIMEOUT_MS,
} from "./constants";
import { domainAllowed, normalizeProductDiscoveryAllowlist } from "./domains";
import {
  buildRequirementPolicyHints,
  normalizeMatchScore,
  normalizeRequirementLists,
} from "./matchPolicy";
import { finalizeAcceptedProduct } from "./acceptancePolicy";
import {
  attemptPriceVerificationRecovery,
  buildPriceVerificationDiagnostics,
} from "./attemptPriceVerificationRecovery";
import {
  buildProductDiscoveryUserMessage,
  PRODUCT_DISCOVERY_SYSTEM_PROMPT,
} from "./prompt";
import {
  attemptSourceBackedRescue,
  shouldAttemptRescue,
  type InitialFailureReason,
} from "./rescue";
import { productDiscoveryModelSchema, type ProductDiscoveryModelOutput } from "./schema";
import {
  extractWebSearchSources,
  isProductUrlEvidenceBacked,
  responseUsedWebSearch,
} from "./sources";
import type { ProductDiscoveryResult, ProductDiscoverySource, ProductDiscoveryProduct } from "./types";
import { attemptTargetedResearch } from "./searchPass";

export type SearchProductItemOptions = {
  requestedItem: string;
  allowlistDomains: string[];
  client?: OpenAI;
};

type PrimarySanitizeOutcome =
  | { ok: true; product: NonNullable<ProductDiscoveryResult["product"]> }
  | { ok: false; initialFailureReason: InitialFailureReason | null };

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return key;
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
  product: ProductDiscoveryProduct,
  sources: ProductDiscoverySource[]
): string {
  const sourceTitle =
    sources.find((source) => source.url === product.productUrl)?.title ??
    sources.find((source) => product.productUrl.includes(source.url))?.title ??
    null;
  return [product.name, product.whyItMatches, sourceTitle].filter(Boolean).join("\n");
}

async function maybeRecoverBudgetUnverified(input: {
  client: OpenAI;
  requestedItem: string;
  allowlistDomains: string[];
  sources: ProductDiscoverySource[];
  source: "primary" | "rescue" | "targeted";
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
  source: "primary" | "rescue" | "targeted",
  finalized: ReturnType<typeof finalizeAcceptedProduct>
) {
  return {
    acceptanceChecked: true,
    acceptanceSource: source,
    acceptanceScore: finalized.matchScore,
    requirementCoverage: finalized.requirementCoverage,
    acceptanceReason: finalized.reason,
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

async function finalizeWithTargetedResearchIfNeeded(
  result: ProductDiscoveryResult,
  ctx: {
    client: OpenAI;
    requestedItem: string;
    allowlistDomains: string[];
    primarySources: ProductDiscoverySource[];
    priceVerificationAttempted?: boolean;
  }
): Promise<ProductDiscoveryResult> {
  if (result.status !== "not_found") {
    return {
      ...result,
      diagnostics: withTargetedResearchSkippedDiagnostics(result.diagnostics),
    };
  }

  const targeted = await attemptTargetedResearch({
    client: ctx.client,
    requestedItem: ctx.requestedItem,
    allowlistDomains: ctx.allowlistDomains,
    primarySources: ctx.primarySources,
    priorDiagnostics: result.diagnostics,
    priorRejectedProduct: result.diagnostics?.rejectedProduct ?? null,
  });

  if (targeted.result?.status === "found") {
    logProductDiscovery({
      requestedItem: ctx.requestedItem,
      finalStatus: "found",
      targetedResearchAccepted: true,
      targetedResearchDurationMs: targeted.durationMs,
      totalDurationMs: targeted.result.diagnostics?.elapsedMs,
    });
    return targeted.result;
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
      return {
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
      };
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

  return {
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
    },
  };
}

function buildRescueFinalResult(input: {
  requestedItem: string;
  allowlistDomains: string[];
  sources: ProductDiscoverySource[];
  started: number;
  initialFailureReason: InitialFailureReason | null;
  primaryRejectedProduct?: ProductDiscoveryProduct | null;
  primaryAcceptance?: ReturnType<typeof finalizeAcceptedProduct> | null;
  rescue: Awaited<ReturnType<typeof attemptSourceBackedRescue>>;
  priceVerificationDiagnostics?: ReturnType<typeof buildPriceVerificationDiagnostics>;
  rescueFinalized?: ReturnType<typeof finalizeAcceptedProduct> | null;
}): ProductDiscoveryResult {
  const totalElapsedMs = Date.now() - input.started;
  const enrichmentDiagnostics = {
    enrichmentAttemptedCount: input.rescue.enrichmentStats?.enrichmentAttemptedCount,
    enrichmentSuccessCount: input.rescue.enrichmentStats?.enrichmentSuccessCount,
    enrichment403Count: input.rescue.enrichmentStats?.enrichment403Count,
    enrichmentTimeoutCount: input.rescue.enrichmentStats?.enrichmentTimeoutCount,
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
          ? buildAcceptanceDiagnostics("primary", input.primaryAcceptance)
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
        ...buildAcceptanceDiagnostics("rescue", finalized),
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
      ...buildAcceptanceDiagnostics("rescue", finalized),
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

export async function searchProductItem(
  options: SearchProductItemOptions
): Promise<ProductDiscoveryResult> {
  const requestedItem = options.requestedItem.trim();
  const allowlistDomains = normalizeProductDiscoveryAllowlist(options.allowlistDomains);
  const started = Date.now();

  if (!requestedItem) {
    return {
      requestedItem: "",
      status: "error",
      product: null,
      sources: [],
      diagnostics: { searchUsed: false, allowedDomainsCount: 0, errorCode: "empty_item" },
    };
  }

  if (allowlistDomains.length === 0) {
    return {
      requestedItem,
      status: "no_retailers",
      product: null,
      sources: [],
      diagnostics: { searchUsed: false, allowedDomainsCount: 0 },
    };
  }

  const client =
    options.client ??
    new OpenAI({
      apiKey: requireApiKey(),
      timeout: OPENAI_PRODUCT_SEARCH_TIMEOUT_MS,
      maxRetries: 0,
    });

  try {
    const response: ParsedResponse<ProductDiscoveryModelOutput> = await client.responses.parse({
      model: OPENAI_PRODUCT_SEARCH_MODEL,
      instructions: PRODUCT_DISCOVERY_SYSTEM_PROMPT,
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
    const parsed = response.output_parsed;
    const primaryElapsedMs = Date.now() - started;
    const searchUsed = responseUsedWebSearch(response);

    if (!searchUsed) {
      logProductDiscovery({
        requestedItem,
        allowedDomainsCount: allowlistDomains.length,
        primaryStatus: "not_found",
        finalStatus: "not_found",
        elapsedMs: primaryElapsedMs,
        errorCode: "web_search_not_used",
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
          },
        },
        { client, requestedItem, allowlistDomains, primarySources: sources }
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
          },
        },
        { client, requestedItem, allowlistDomains, primarySources: sources }
      );
    }

    const primaryOutcome = sanitizePrimaryProductOutput(parsed, requestedItem, allowlistDomains, sources);

    if (primaryOutcome.ok) {
      let finalized = finalizeAcceptedProduct({
        requestedItem,
        source: "primary",
        product: primaryOutcome.product,
        evidenceText: primaryEvidenceText(primaryOutcome.product, sources),
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
          evidenceText: primaryEvidenceText(primaryOutcome.product, sources),
          priceVerificationAttempted,
        });
        finalized = recovery.finalized;
        priceVerificationAttempted = recovery.priceVerificationAttempted;
        priceVerificationDiagnostics = recovery.priceVerificationDiagnostics;
      }

      if (finalized.accepted) {
        const totalElapsedMs = Date.now() - started;
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
        return {
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
            ...buildAcceptanceDiagnostics("primary", finalized),
            ...priceVerificationDiagnostics,
          }),
        };
      }

      const runRescueAfterPrimaryReject = shouldAttemptRescue({
        primaryStatus: "not_found",
        initialFailureReason: null,
        searchUsed: true,
        sourceCount: sources.length,
        acceptanceRejected: true,
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
          return {
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
              ...buildAcceptanceDiagnostics("rescue", rescueFinalized),
              ...priceVerificationDiagnostics,
            },
          };
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
            rescue,
            rescueFinalized,
            priceVerificationDiagnostics,
          }),
          { client, requestedItem, allowlistDomains, primarySources: sources, priceVerificationAttempted }
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
            ...buildAcceptanceDiagnostics("primary", finalized),
            ...priceVerificationDiagnostics,
          },
        },
        { client, requestedItem, allowlistDomains, primarySources: sources, priceVerificationAttempted }
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
          },
        },
        { client, requestedItem, allowlistDomains, primarySources: sources }
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
      }),
      { client, requestedItem, allowlistDomains, primarySources: sources, priceVerificationAttempted }
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
    return {
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
    };
  }
}
