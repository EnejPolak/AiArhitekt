/**
 * One-off Terra vs Luna Step C comparison. 8 live requests, no retries.
 *
 *   OPENAI_PRODUCT_SEARCH_MODEL=gpt-5.6-terra PRODUCT_DISCOVERY_SERP_FALLBACK=false \
 *     npx tsx --env-file=.env scripts/stepCTerraLunaCompare.ts
 *
 *   OPENAI_PRODUCT_SEARCH_MODEL=gpt-5.6-luna PRODUCT_DISCOVERY_SERP_FALLBACK=false \
 *     npx tsx --env-file=.env scripts/stepCTerraLunaCompare.ts
 */
process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = "false";

import { searchProductItem } from "../lib/productDiscovery/searchItem";
import {
  isProductDiscoverySerpFallbackEnabled,
  OPENAI_PRODUCT_SEARCH_MODEL,
} from "../lib/productDiscovery/constants";
import { getCachedCandidateEnrichment } from "../lib/productDiscovery/enrichCandidate";
import {
  classifyExactDimensionAgainstEvidence,
  trustedEvidenceHaystack,
} from "../lib/productDiscovery/productEvidence";
import { isAppearanceOnlyMaterialEvidence } from "../lib/productDiscovery/materialEvidence";
import { parseRequestedRequirements } from "../lib/productDiscovery/requirementAnalysis";
import { normalizeDomainToRoot } from "../lib/serp/domains";
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

const RELEVANCE: Record<string, RegExp> = {
  LIGHTING: /svetil|lamp|pendant|vise[cč]a|luce|light/i,
  ACCESSORY: /vaza|vase/i,
  BATHROOM: /brisa[cč]|towel|grelnik|radiator|ogrev|kopalni[sš]ki\s+grel/i,
  KITCHEN: /korito|sink|pomival/i,
};

const LISTING_RE = /\/(c|category|kategorija|search|filter|izdelki|katalog)\b|\bq=/i;

function isCreditFailure(err: unknown, result?: ProductDiscoveryResult): boolean {
  const msg = [
    err instanceof Error ? err.message : String(err ?? ""),
    result?.diagnostics?.errorCode ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return /429|insufficient_quota|insufficient credits|quota|billing|credit_balance/.test(msg);
}

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return normalizeDomainToRoot(new URL(url).hostname);
  } catch {
    return null;
  }
}

function looksPdp(url: string): boolean {
  return !LISTING_RE.test(url);
}

function relevantUrlDiscovered(
  id: string,
  result: ProductDiscoveryResult
): { relevant: boolean; url: string | null } {
  const pattern = RELEVANCE[id];
  const candidates: Array<{ url: string; title: string | null }> = [];
  if (result.product?.productUrl) {
    candidates.push({ url: result.product.productUrl, title: result.product.name });
  }
  for (const source of result.sources) {
    candidates.push({ url: source.url, title: source.title ?? null });
  }
  for (const c of candidates) {
    const hay = `${c.url} ${c.title ?? ""}`;
    if (pattern?.test(hay) && looksPdp(c.url)) {
      return { relevant: true, url: c.url };
    }
  }
  if (result.status === "found" && result.product?.productUrl) {
    return { relevant: true, url: result.product.productUrl };
  }
  return { relevant: false, url: result.product?.productUrl ?? result.sources[0]?.url ?? null };
}

function evidenceHaystack(result: ProductDiscoveryResult): string {
  const snap = result.diagnostics?.acceptedDecisionSnapshot?.productEvidence;
  if (snap) return trustedEvidenceHaystack(snap);
  return [
    result.product?.name,
    result.product?.whyItMatches,
    ...result.sources.map((s) => `${s.title ?? ""} ${s.snippet ?? ""}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function safetyForCase(id: string, requestedItem: string, result: ProductDiscoveryResult) {
  const found = result.status === "found" && result.product != null;
  const hay = evidenceHaystack(result);
  const snap = result.diagnostics?.acceptedDecisionSnapshot;
  const unmet = snap?.normalizedRequirements.unmetRequirements ?? result.product?.unmetRequirements ?? [];
  const hardReqs = parseRequestedRequirements(requestedItem).filter((r) => r.hard);

  let exactDimensionFalseAccept = false;
  if (found && /exactly/i.test(requestedItem)) {
    exactDimensionFalseAccept =
      classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay }) !== "supported";
  }

  let materialAppearanceViolation = false;
  if (found) {
    if (id === "ACCESSORY") {
      materialAppearanceViolation = isAppearanceOnlyMaterialEvidence("ceramic", hay)
        ? true
        : !/ceramic|keramik|porcelan/i.test(hay);
    }
    if (id === "KITCHEN") {
      materialAppearanceViolation = isAppearanceOnlyMaterialEvidence("stainless", hay)
        ? true
        : !/stainless|inox|nerjavn|jeklo|steel/i.test(hay);
    }
    if (id === "LIGHTING") {
      materialAppearanceViolation = isAppearanceOnlyMaterialEvidence("metal", hay)
        ? true
        : !/metal|kovin|steel|jeklo|aluminij/i.test(hay);
    }
  }

  const unsupportedAccepted =
    found &&
    ((result.diagnostics?.evidenceDiagnostics?.unsupportedModelClaims?.length ?? 0) > 0 ||
      exactDimensionFalseAccept ||
      materialAppearanceViolation);

  const grounded =
    !found
      ? null
      : hardReqs.every((req) => {
          if (req.id.startsWith("budget:")) {
            const price = result.product?.price;
            const max = Number(req.label.replace(/[^\d.]/g, ""));
            return price != null && Number.isFinite(max) && price <= max + 0.009;
          }
          if (req.id.startsWith("dimension:") && /exactly/i.test(requestedItem)) {
            return classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay }) === "supported";
          }
          return req.tokens.some((t) => t.length >= 3 && hay.toLowerCase().includes(t.toLowerCase()));
        }) && unmet.length === 0;

  return {
    groundedHardIdentity: grounded,
    unsupportedEvidenceAccepted: unsupportedAccepted,
    exactDimensionFalseAccept,
    materialAppearanceViolation,
    unmetRequirements: unmet,
    hardRequirementLabels: hardReqs.map((r) => r.label),
  };
}

async function main() {
  const model = OPENAI_PRODUCT_SEARCH_MODEL;
  console.log("MODEL:", model);
  console.log("SERP fallback:", isProductDiscoverySerpFallbackEnabled() ? "ON" : "OFF");
  console.log("Live Step C requests this process: 4. No reruns.\n");

  const rows: Array<Record<string, unknown>> = [];
  for (const focus of CASES) {
    console.error(`[${model}] [${focus.id}] ${focus.requestedItem}`);
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
      const url = result.product?.productUrl ?? null;
      const cached = url ? getCachedCandidateEnrichment(url) : null;
      const discovered = relevantUrlDiscovered(focus.id, result);
      const safety = safetyForCase(focus.id, focus.requestedItem, result);
      const usage = result.diagnostics?.openAiUsage ?? null;
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
        model,
        id: focus.id,
        requestedItem: focus.requestedItem,
        relevantUrlDiscovered: discovered.relevant ? "YES" : "NO",
        selectedUrl: url,
        discoveredUrl: discovered.url,
        merchantDomain: domainOf(url ?? discovered.url),
        merchantEnrichmentStatus: enrichmentStatus,
        finalResult: result.status,
        acceptedProduct: result.product?.name ?? null,
        acceptedPrice: result.product?.price ?? null,
        acceptedCurrency: result.product?.currency ?? null,
        rejectionReason:
          result.status === "found"
            ? null
            : result.diagnostics?.acceptanceReason ??
              result.diagnostics?.openAiFinalFailureReason ??
              result.diagnostics?.errorCode ??
              result.status,
        groundedHardIdentity: safety.groundedHardIdentity == null ? "N/A" : safety.groundedHardIdentity ? "YES" : "NO",
        unsupportedEvidenceAccepted: safety.unsupportedEvidenceAccepted ? "YES" : "NO",
        exactDimensionFalseAccept: safety.exactDimensionFalseAccept ? "YES" : "NO",
        materialAppearanceViolation: safety.materialAppearanceViolation ? "YES" : "NO",
        verifiedPriceEvidenceKind:
          result.product?.priceEvidence ??
          result.diagnostics?.evidenceDiagnostics?.priceEvidenceKind ??
          null,
        priceProvenance: cached?.verifiedPrice
          ? {
              amount: cached.verifiedPrice.amount,
              currency: cached.verifiedPrice.currency,
              evidenceKind: cached.verifiedPrice.source,
              extractionMethod: cached.verifiedPrice.extractionMethod ?? null,
              sourcePath: cached.verifiedPrice.sourcePath ?? null,
              evidenceExcerpt: cached.verifiedPrice.evidenceExcerpt ?? null,
            }
          : null,
        webSearchCalls: usage?.webSearchCalls ?? result.diagnostics?.primaryWebSearchCallCount ?? null,
        inputTokens: usage?.inputTokens ?? null,
        cachedInputTokens: usage?.cachedInputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        durationMs: result.diagnostics?.elapsedMs ?? Date.now() - started,
        sourceUrls: result.sources.slice(0, 8).map((s) => s.url),
        acceptanceReason: result.diagnostics?.acceptanceReason ?? null,
        unmatched: result.product?.unmetRequirements ?? [],
        unknown: result.product?.unknownRequirements ?? [],
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

  console.log("\nBATCH_TOTAL");
  console.log(
    JSON.stringify(
      {
        model,
        stepCRequests: rows.length,
        webSearchCalls: rows.reduce((s, r) => s + (typeof r.webSearchCalls === "number" ? r.webSearchCalls : 0), 0),
        inputTokens: rows.reduce((s, r) => s + (typeof r.inputTokens === "number" ? r.inputTokens : 0), 0),
        cachedTokens: rows.reduce((s, r) => s + (typeof r.cachedInputTokens === "number" ? r.cachedInputTokens : 0), 0),
        outputTokens: rows.reduce((s, r) => s + (typeof r.outputTokens === "number" ? r.outputTokens : 0), 0),
      },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
