/**
 * Four live Step C requests after offline merchant-evidence work.
 * Do not rerun. Do not expand into a benchmark.
 *
 *   npx tsx --env-file=.env scripts/stepCMerchantEvidenceLive.ts
 */
import { searchProductItem } from "../lib/productDiscovery/searchItem";
import { isProductDiscoverySerpFallbackEnabled } from "../lib/productDiscovery/constants";
import { getCachedCandidateEnrichment } from "../lib/productDiscovery/enrichCandidate";
import type { ProductDiscoveryResult } from "../lib/productDiscovery/types";

const CASES = [
  { id: "LIGHTING", requestedItem: "black metal pendant lamp approx 40cm max 120 EUR" },
  { id: "ACCESSORY", requestedItem: "ceramic vase white height 30cm max 40 EUR" },
  { id: "BATHROOM", requestedItem: "chrome heated towel rail width 60cm max 150 EUR" },
  { id: "KITCHEN", requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR" },
] as const;

const ALLOWLIST = [
  "obi.si",
  "merkur.si",
  "tapro.si",
  "bauhaus.si",
  "xxxlesnina.si",
  "harveynorman.si",
  "rutar.com",
  "svetpohistva.si",
  "vivozebra.si",
  "obnova.si",
];

function isCreditFailure(err: unknown, result?: ProductDiscoveryResult): boolean {
  const msg = [
    err instanceof Error ? err.message : String(err ?? ""),
    result?.diagnostics?.errorCode ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return /429|insufficient_quota|insufficient credits|quota|billing|credit_balance/.test(msg);
}

function specsFrom(result: ProductDiscoveryResult) {
  const ev = result.diagnostics?.acceptedDecisionSnapshot?.productEvidence;
  return {
    priceEvidence: ev?.priceEvidence?.map((f) => f.text).filter(Boolean) ?? [],
    materialEvidence: ev?.materialEvidence?.map((f) => f.text).filter(Boolean) ?? [],
    colorEvidence: ev?.colorEvidence?.map((f) => f.text).filter(Boolean) ?? [],
    dimensionEvidence: ev?.dimensionEvidence?.map((f) => f.text).filter(Boolean) ?? [],
  };
}

async function main() {
  process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = "false";
  console.log("SERP fallback:", isProductDiscoverySerpFallbackEnabled() ? "ON" : "OFF");
  console.log("Live Step C requests: 4 (one each). No reruns.\n");

  const rows: Array<Record<string, unknown>> = [];
  for (const focus of CASES) {
    console.log(`[${focus.id}] ${focus.requestedItem}`);
    const started = Date.now();
    try {
      const result = await searchProductItem({
        requestedItem: focus.requestedItem,
        allowlistDomains: ALLOWLIST,
      });
      if (isCreditFailure(null, result)) {
        console.error("ABORT: OpenAI credit/rate failure. Not retrying.");
        process.exit(2);
      }
      const specs = specsFrom(result);
      const usage = result.diagnostics?.openAiUsage ?? null;
      const url = result.product?.productUrl ?? result.sources[0]?.url ?? null;
      const cached = url ? getCachedCandidateEnrichment(url) : null;
      const enrichmentStatus =
        cached?.status ??
        ((result.diagnostics?.enrichment403Count ?? 0) > 0
          ? "forbidden"
          : (result.diagnostics?.enrichmentSuccessCount ?? 0) > 0
            ? "success"
            : (result.diagnostics?.enrichmentAttemptedCount ?? 0) > 0
              ? "failed"
              : "not_attempted");
      const row = {
        id: focus.id,
        requestedItem: focus.requestedItem,
        status: result.status,
        url,
        enrichment: enrichmentStatus,
        enrichmentAttempted: result.diagnostics?.enrichmentAttemptedCount ?? 0,
        enrichmentSuccess: result.diagnostics?.enrichmentSuccessCount ?? 0,
        enrichment403: result.diagnostics?.enrichment403Count ?? 0,
        cachedPrice: cached?.price ?? null,
        cachedPriceProvenance: cached?.verifiedPrice
          ? {
              amount: cached.verifiedPrice.amount,
              currency: cached.verifiedPrice.currency,
              evidenceKind: cached.verifiedPrice.source,
              extractionMethod: cached.verifiedPrice.extractionMethod ?? null,
              sourcePath: cached.verifiedPrice.sourcePath ?? null,
              excerpt: cached.verifiedPrice.evidenceExcerpt ?? null,
            }
          : null,
        merchantEvidenceDiagnostics: cached?.merchantEvidenceDiagnostics
          ? {
              status: cached.merchantEvidenceDiagnostics.status,
              canonicalUrl:
                cached.merchantEvidenceDiagnostics.canonicalUrl ?? cached.canonicalUrl ?? null,
              productName: cached.merchantEvidenceDiagnostics.productName,
              price: cached.merchantEvidenceDiagnostics.price,
              materialsFound: cached.merchantEvidenceDiagnostics.materialsFound,
              colorsFound: cached.merchantEvidenceDiagnostics.colorsFound,
              labeledDimensionsFound: cached.merchantEvidenceDiagnostics.labeledDimensionsFound,
              extractionMethods: cached.merchantEvidenceDiagnostics.extractionMethods,
            }
          : null,
        cachedMaterial: cached?.labeledSpecs?.some((s) => s.field === "material") ?? false,
        cachedColor: cached?.labeledSpecs?.some((s) => s.field === "color") ?? false,
        cachedLabeledDims: cached?.labeledSpecs?.filter((s) => s.field === "dimension").length ?? 0,
        price: result.product?.price ?? null,
        currency: result.product?.currency ?? null,
        priceEvidenceKind: result.product?.priceEvidence ?? result.diagnostics?.evidenceDiagnostics?.priceEvidenceKind ?? null,
        ...specs,
        durationMs: result.diagnostics?.elapsedMs ?? Date.now() - started,
        inputTokens: usage?.inputTokens ?? null,
        cachedInputTokens: usage?.cachedInputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        webSearchCalls: usage?.webSearchCalls ?? result.diagnostics?.primaryWebSearchCallCount ?? null,
        acceptanceReason: result.diagnostics?.acceptanceReason ?? null,
      };
      rows.push(row);
      console.log(JSON.stringify(row, null, 2));
    } catch (err) {
      if (isCreditFailure(err)) {
        console.error("ABORT: OpenAI credit/rate failure. Not retrying.");
        process.exit(2);
      }
      throw err;
    }
  }

  const sum = (key: "inputTokens" | "cachedInputTokens" | "outputTokens" | "webSearchCalls") =>
    rows.reduce((s, r) => s + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);

  console.log("\nTOTAL");
  console.log(
    JSON.stringify(
      {
        stepCRequests: rows.length,
        webSearchCalls: sum("webSearchCalls"),
        inputTokens: sum("inputTokens"),
        cachedTokens: sum("cachedInputTokens"),
        outputTokens: sum("outputTokens"),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
