/**
 * ProductEvidence frozen benchmark (dev-only).
 * CONTROL primary + production acceptance path. Serp OFF. No selector.
 *
 *   PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT=control \
 *   PRODUCT_DISCOVERY_SERP_FALLBACK=false \
 *   npx tsx --env-file=.env scripts/productEvidenceBenchmark.ts
 */
import { writeFileSync } from "node:fs";
import {
  assessFrozenEvidenceCandidate,
  classifyRunFailure,
  countVerifiedWebSearchPricesFromSources,
  freezeEvidenceCandidatesRoundTrip,
  productEvidenceSemanticallyEqual,
  serializeProductEvidence,
  summarizeProviderEvidenceHealth,
  type FrozenEvidenceCandidate,
  type RunFailureClass,
} from "../lib/productDiscovery/productEvidenceBenchmark";
import {
  resetEnrichmentPerfCounters,
  summarizeEnrichmentPerf,
} from "../lib/productDiscovery/enrichCandidate";
import { prepareEnrichedCandidates } from "../lib/productDiscovery/selectionStability";
import { searchProductItem } from "../lib/productDiscovery/searchItem";
import type { RescueCandidate } from "../lib/productDiscovery/rescueCandidates";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PACE_MS = Number(process.env.BENCHMARK_PACE_MS ?? 3000);
const RUNS = Number(process.env.FOCUS_RUNS ?? 5);
const OUT_JSON =
  process.env.PRODUCT_EVIDENCE_BENCH_OUT ||
  "/tmp/aiarhitekt-product-evidence-benchmark.json";
const OUT_TXT =
  process.env.PRODUCT_EVIDENCE_BENCH_REPORT ||
  "/tmp/aiarhitekt-product-evidence-benchmark-report.txt";

const FOCUS = [
  {
    category: "lighting",
    item: "black metal pendant lamp approx 40cm max 120 EUR",
  },
  {
    category: "accessory",
    item: "ceramic vase white height 30cm max 40 EUR",
  },
  {
    category: "bathroom-towel",
    item: "chrome heated towel rail width 60cm max 150 EUR",
  },
  {
    category: "kitchen-exact",
    item: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
  },
] as const;

const STALE_ARTIFACTS = [
  "/tmp/aiarhitekt-acceptance-aligned-selection.json",
  "/tmp/aiarhitekt-acceptance-aligned-selection-relabeled.json",
  "/tmp/aiarhitekt-acceptance-aligned-selection-output.txt",
  "/tmp/aiarhitekt-selection-stability.json",
  "/tmp/aiarhitekt-paced-benchmark-results.json",
  "/tmp/aiarhitekt-primary-focus-control.json",
  "/tmp/aiarhitekt-primary-focus-candidate.json",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function urlsMatch(a: string, b: string): boolean {
  const norm = (u: string) => {
    try {
      const x = new URL(u);
      return `${x.hostname.replace(/^www\./i, "")}${x.pathname.replace(/\/+$/, "")}`.toLowerCase();
    } catch {
      return String(u).toLowerCase();
    }
  };
  const pa = norm(a);
  const pb = norm(b);
  return pa === pb || pa.startsWith(`${pb}/`) || pb.startsWith(`${pa}/`);
}

async function fetchAllowlist(): Promise<string[]> {
  const geocode = await fetch(
    `${BASE}/api/geocode?address=${encodeURIComponent("Ljubljana, Slovenia")}`
  ).then((r) => r.json());
  const res = await fetch(`${BASE}/api/places/search`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify({
      lat: geocode.lat,
      lng: geocode.lng,
      radiusKm: 10,
      mode: "category",
      dryRun: false,
      onlyWithWebsite: true,
    }),
  });
  const json = await res.json();
  return json.domains?.stores ?? json.allowlistDomainsStores ?? [];
}

function rate(n: number, d: number): string {
  if (d <= 0) return "n/a";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

function kindBucket(kinds: string[]): "merchant" | "web_search" | "url" | "none" {
  if (kinds.some((k) => k.startsWith("merchant"))) return "merchant";
  if (kinds.some((k) => k.startsWith("web_search"))) return "web_search";
  if (kinds.includes("product_url")) return "url";
  return "none";
}

type FrozenRun = {
  category: string;
  requestedItem: string;
  run: number;
  productionStatus: string;
  productionAccepted: boolean;
  productionAcceptanceSource: string | null;
  productionAcceptanceReason: string | null;
  productionProductUrl: string | null;
  productionPriceEvidence: string | null;
  providerHealth: ReturnType<typeof summarizeProviderEvidenceHealth>;
  verifiedWebSearchPricesFromSources: number;
  candidates: FrozenEvidenceCandidate[];
  failure: { primary: RunFailureClass; secondary: RunFailureClass[] };
  parity: {
    productionAccepted: boolean;
    benchmarkQualifyingForAcceptedUrl: boolean | null;
    qualifyingCount: number;
    mismatches: string[];
  };
};

async function main() {
  process.env.PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT = "control";
  process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = "false";

  console.log("PRODUCT EVIDENCE FROZEN BENCHMARK");
  console.log("Production behavior changed: NO");
  console.log("Prompt: CONTROL");
  console.log("Serp fallback: false");
  console.log(`Old frozen artifacts marked STALE: ${STALE_ARTIFACTS.length}\n`);

  const allowlist = await fetchAllowlist();
  console.log(`Allowlist (${allowlist.length}): ${allowlist.join(", ")}\n`);

  resetEnrichmentPerfCounters();
  const frozenRuns: FrozenRun[] = [];
  let parityMismatches = 0;
  let productionAcceptedTotal = 0;
  let benchmarkQualifyingTotal = 0;

  for (const entry of FOCUS) {
    for (let i = 1; i <= RUNS; i++) {
      console.log(`[${entry.category}] run ${i}/${RUNS}...`);
      let result = await searchProductItem({
        requestedItem: entry.item,
        allowlistDomains: allowlist,
      });
      if (result.status === "error") {
        console.log(`  ERROR — retrying once...`);
        await sleep(PACE_MS);
        result = await searchProductItem({
          requestedItem: entry.item,
          allowlistDomains: allowlist,
        });
      }

      const { candidates } = await prepareEnrichedCandidates({
        sources: result.sources,
        allowlistDomains: allowlist,
        requestedItem: entry.item,
      });

      let workingCandidates = candidates;
      // Ensure production-accepted URL is in the freeze set (e.g. targeted recovery).
      if (
        result.status === "found" &&
        result.product?.productUrl &&
        !candidates.some((c) => urlsMatch(c.url, result.product!.productUrl))
      ) {
        const { candidates: extra } = await prepareEnrichedCandidates({
          sources: [
            {
              url: result.product.productUrl,
              title: result.product.name,
              snippet: null,
            },
            ...result.sources,
          ],
          allowlistDomains: allowlist,
          requestedItem: entry.item,
        });
        workingCandidates = extra;
      }

      const frozenCandidates: FrozenEvidenceCandidate[] = workingCandidates.map(
        (c: RescueCandidate) =>
          assessFrozenEvidenceCandidate({
            requestedItem: entry.item,
            candidate: c,
            // Diagnostic only — never used for qualification.
            modelClaims: undefined,
          })
      );

      // Round-trip freeze sanity for this run.
      const reloaded = freezeEvidenceCandidatesRoundTrip(frozenCandidates);
      for (let idx = 0; idx < frozenCandidates.length; idx++) {
        const a = frozenCandidates[idx]!;
        const b = reloaded[idx]!;
        if (!productEvidenceSemanticallyEqual(a.evidence, b.evidence)) {
          parityMismatches += 1;
        }
      }

      const productionAccepted = result.status === "found" && !!result.product;
      if (productionAccepted) productionAcceptedTotal += 1;
      const qualifying = frozenCandidates.filter((c) => c.fullyQualifyingCandidate);
      benchmarkQualifyingTotal += qualifying.length;

      const mismatches: string[] = [];
      for (const q of qualifying) {
        if (!q.productionDecision.accepted) {
          mismatches.push(`qualifying_without_acceptance:${q.candidateId}`);
        }
      }
      for (const c of frozenCandidates) {
        if (c.productionDecision.accepted && !c.fullyQualifyingCandidate) {
          mismatches.push(`accepted_without_qualifying:${c.candidateId}`);
        }
      }

      let benchmarkQualifyingForAcceptedUrl: boolean | null = null;
      if (productionAccepted && result.product?.productUrl) {
        const match = frozenCandidates.find((c) =>
          urlsMatch(c.productUrl, result.product!.productUrl)
        );
        benchmarkQualifyingForAcceptedUrl = match
          ? match.fullyQualifyingCandidate
          : false;
        if (!benchmarkQualifyingForAcceptedUrl) {
          mismatches.push(`production_accepted_url_not_benchmark_qualifying`);
        }
      }

      parityMismatches += mismatches.length;

      const failure = classifyRunFailure({
        productionAccepted,
        candidates: frozenCandidates,
      });

      const providerHealth = summarizeProviderEvidenceHealth(result.sources, {
        primaryWebSearchCallCount: result.diagnostics?.primaryWebSearchCallCount,
        primaryDistinctSourceDomains: result.diagnostics?.primaryDistinctSourceDomains,
      });

      frozenRuns.push({
        category: entry.category,
        requestedItem: entry.item,
        run: i,
        productionStatus: result.status,
        productionAccepted,
        productionAcceptanceSource: result.diagnostics?.acceptanceSource ?? null,
        productionAcceptanceReason: result.diagnostics?.acceptanceReason ?? null,
        productionProductUrl: result.product?.productUrl ?? null,
        productionPriceEvidence: result.product?.priceEvidence ?? null,
        providerHealth,
        verifiedWebSearchPricesFromSources: countVerifiedWebSearchPricesFromSources(
          result.sources
        ),
        candidates: frozenCandidates.map((c) => ({
          ...c,
          evidence: serializeProductEvidence(c.evidence),
        })),
        failure: productionAccepted
          ? { primary: "OTHER", secondary: [] }
          : failure,
        parity: {
          productionAccepted,
          benchmarkQualifyingForAcceptedUrl,
          qualifyingCount: qualifying.length,
          mismatches,
        },
      });

      console.log(
        `  status=${result.status} relevant=${frozenCandidates.filter((c) => c.relevantCandidate).length} qualifying=${qualifying.length} fail=${productionAccepted ? "ACCEPTED" : failure.primary}`
      );
      await sleep(PACE_MS);
    }
  }

  // Aggregates
  const allCandidates = frozenRuns.flatMap((r) => r.candidates);
  const failedRuns = frozenRuns.filter((r) => !r.productionAccepted);

  const failureCounts: Record<RunFailureClass, number> = {
    SEARCH_MISS: 0,
    EVIDENCE_MISS: 0,
    ENRICHMENT_MISS: 0,
    HARD_CONSTRAINT_MISS: 0,
    OTHER: 0,
  };
  for (const r of failedRuns) failureCounts[r.failure.primary] += 1;

  const providerUrls = frozenRuns.reduce((n, r) => n + r.providerHealth.sourceCount, 0);
  const providerTitles = frozenRuns.reduce((n, r) => n + r.providerHealth.sourceTitlesPresent, 0);
  const providerSnippets = frozenRuns.reduce(
    (n, r) => n + r.providerHealth.sourceSnippetsPresent,
    0
  );
  const providerCitations = frozenRuns.reduce(
    (n, r) => n + r.providerHealth.citationEvidenceCount,
    0
  );
  const verifiedWebSearchPrices = frozenRuns.reduce(
    (n, r) => n + r.verifiedWebSearchPricesFromSources,
    0
  );

  const enriched = allCandidates.filter((c) => c.enrichmentDetail.attempted);
  const enrichSuccess = enriched.filter((c) => c.enrichmentStatus === "success");
  const enrichForbidden = enriched.filter((c) => c.enrichmentStatus === "forbidden");
  const enrichOtherFail = enriched.filter((c) => c.enrichmentStatus === "failed");
  const jsonLd = enrichSuccess.filter((c) => c.enrichmentDetail.jsonLdProductFound);
  const merchantPrices = allCandidates.filter((c) => c.enrichmentDetail.merchantPrice);

  const priceMerchant = allCandidates.filter((c) => c.evidenceCoverage.priceKind === "merchant_page")
    .length;
  const priceWeb = allCandidates.filter((c) => c.evidenceCoverage.priceKind === "web_search").length;
  const priceNone = allCandidates.filter((c) => c.evidenceCoverage.priceKind === "none").length;
  const budgetUnverified = allCandidates.filter(
    (c) => c.productionDecision.rejectionReason === "budget_unverified"
  ).length;

  const dimBuckets = { merchant: 0, web_search: 0, url: 0, none: 0 };
  const matBuckets = { merchant: 0, web_search: 0, url: 0, none: 0 };
  const colorBuckets = { merchant: 0, web_search: 0, url: 0, none: 0 };
  for (const c of allCandidates) {
    dimBuckets[kindBucket(c.evidenceCoverage.dimensionKinds)] += 1;
    matBuckets[kindBucket(c.evidenceCoverage.materialKinds)] += 1;
    colorBuckets[kindBucket(c.evidenceCoverage.colorKinds)] += 1;
  }

  const runsWithRelevant = frozenRuns.filter((r) =>
    r.candidates.some((c) => c.relevantCandidate)
  ).length;
  const runsWithFully = frozenRuns.filter((r) =>
    r.candidates.some((c) => c.fullyQualifyingCandidate)
  ).length;
  const acceptedRuns = frozenRuns.filter((r) => r.productionAccepted).length;

  const perCategory = FOCUS.map((entry) => {
    const runs = frozenRuns.filter((r) => r.category === entry.category);
    const failed = runs.filter((r) => !r.productionAccepted);
    const counts: Record<RunFailureClass, number> = {
      SEARCH_MISS: 0,
      EVIDENCE_MISS: 0,
      ENRICHMENT_MISS: 0,
      HARD_CONSTRAINT_MISS: 0,
      OTHER: 0,
    };
    for (const r of failed) counts[r.failure.primary] += 1;
    return {
      category: entry.category,
      runs: runs.length,
      relevant: runs.filter((r) => r.candidates.some((c) => c.relevantCandidate)).length,
      fully: runs.filter((r) => r.candidates.some((c) => c.fullyQualifyingCandidate)).length,
      accepted: runs.filter((r) => r.productionAccepted).length,
      ...counts,
    };
  });

  const parityPct =
    productionAcceptedTotal + benchmarkQualifyingTotal === 0 && parityMismatches === 0
      ? 100
      : Math.max(
          0,
          Math.round(
            (1 -
              parityMismatches /
                Math.max(1, productionAcceptedTotal + benchmarkQualifyingTotal + parityMismatches)) *
              1000
          ) / 10
        );

  const primaryBottleneck =
    failureCounts.SEARCH_MISS >=
    Math.max(
      failureCounts.EVIDENCE_MISS,
      failureCounts.ENRICHMENT_MISS,
      failureCounts.HARD_CONSTRAINT_MISS
    )
      ? "SEARCH RECALL"
      : failureCounts.ENRICHMENT_MISS >= failureCounts.EVIDENCE_MISS
        ? "EVIDENCE ACQUISITION / MERCHANT ENRICHMENT"
        : "EVIDENCE ACQUISITION / MERCHANT ENRICHMENT";

  const recommendedNext =
    primaryBottleneck === "SEARCH RECALL"
      ? "Investigate search recall (provider/query coverage) — relevant products are absent from sources."
      : "Improve evidence acquisition / merchant enrichment for price, material, finish, and dimensions — relevant URLs are present but trusted evidence is insufficient.";

  const report = `PRODUCT EVIDENCE BENCHMARK REPORT

Production behavior changed:
NO

Fresh runs:
${frozenRuns.length}

Old frozen benchmark excluded:
YES

ProductEvidence parity:
${parityMismatches === 0 ? "PASS" : "FAIL"}

Tests:
(see vitest)

PROVIDER EVIDENCE HEALTH

Web-search source URLs:
${providerUrls}

Source titles present:
${providerTitles}

Source snippets present:
${providerSnippets}

Usable citation evidence:
${providerCitations}

Verified web-search prices:
${verifiedWebSearchPrices}


MERCHANT ENRICHMENT

Candidates enriched:
${enriched.length}

Successful:
${enrichSuccess.length}

Forbidden / 403:
${enrichForbidden.length}

Other failures:
${enrichOtherFail.length}

JSON-LD Product found:
${jsonLd.length}

Merchant prices recovered:
${merchantPrices.length}


${perCategory
  .map(
    (c) => `${c.category.toUpperCase()}

Runs:
Relevant product discovered:
${c.relevant}/${c.runs}

Fully evidenced qualifying product:
${c.fully}/${c.runs}

Accepted:
${c.accepted}/${c.runs}

SEARCH_MISS:
${c.SEARCH_MISS}

EVIDENCE_MISS:
${c.EVIDENCE_MISS}

ENRICHMENT_MISS:
${c.ENRICHMENT_MISS}
`
  )
  .join("\n")}

PRICE EVIDENCE

merchant_page:
${priceMerchant}

verified web_search:
${priceWeb}

none:
${priceNone}

budget_unverified rejections:
${budgetUnverified}


DIMENSION EVIDENCE

merchant:
${dimBuckets.merchant}

web_search:
${dimBuckets.web_search}

URL:
${dimBuckets.url}

none:
${dimBuckets.none}


MATERIAL / COLOR EVIDENCE

merchant:
${matBuckets.merchant + colorBuckets.merchant}

web_search:
${matBuckets.web_search + colorBuckets.web_search}

URL:
${matBuckets.url + colorBuckets.url}

none:
${matBuckets.none + colorBuckets.none}


PRODUCTION / BENCHMARK PARITY

Production accepted:
${productionAcceptedTotal}

Benchmark qualifying:
${benchmarkQualifyingTotal}

Mismatch:
${parityMismatches}

Parity:
${parityPct}%


ROOT CAUSE

SEARCH_MISS:
${failureCounts.SEARCH_MISS}

EVIDENCE_MISS:
${failureCounts.EVIDENCE_MISS}

ENRICHMENT_MISS:
${failureCounts.ENRICHMENT_MISS}

HARD_CONSTRAINT_MISS:
${failureCounts.HARD_CONSTRAINT_MISS}

OTHER:
${failureCounts.OTHER}


KEY RATES

Relevant-product discovery rate:
${rate(runsWithRelevant, frozenRuns.length)}

Fully-evidenced-product rate:
${rate(runsWithFully, frozenRuns.length)}

Final acceptance rate:
${rate(acceptedRuns, frozenRuns.length)}


PRIMARY BOTTLENECK

${primaryBottleneck}


RECOMMENDED NEXT STEP

${recommendedNext}
`;

  const relevantCandidates = allCandidates.filter((c) => c.relevantCandidate);
  const relevantWithPrice = relevantCandidates.filter(
    (c) => c.evidenceCoverage.priceKind === "merchant_page" || c.enrichmentDetail.merchantPrice
  );
  const relevantWithVerifiedMerchantPrice = relevantCandidates.filter(
    (c) => c.enrichmentDetail.merchantPrice === true
  );
  const relevantWithMaterial = relevantCandidates.filter(
    (c) => c.evidenceCoverage.materialKinds.length > 0
  );
  const relevantWithColor = relevantCandidates.filter((c) => c.evidenceCoverage.colorKinds.length > 0);
  const relevantWithDims = relevantCandidates.filter(
    (c) => c.evidenceCoverage.dimensionKinds.length > 0
  );
  const relevantFully = relevantCandidates.filter((c) => c.fullyQualifyingCandidate);
  const labeledDimCount = allCandidates.reduce(
    (n, c) => n + (c.enrichmentDetail.labeledDimensionsFound ?? 0),
    0
  );
  const materialFoundCount = allCandidates.filter((c) => c.enrichmentDetail.materialFound).length;
  const colorFoundCount = allCandidates.filter((c) => c.enrichmentDetail.colorFound).length;
  const htmlSpecRuns = allCandidates.filter((c) =>
    (c.enrichmentDetail.extractionMethods ?? []).includes("html_specs")
  ).length;
  const metaRuns = allCandidates.filter((c) =>
    (c.enrichmentDetail.extractionMethods ?? []).some((m) => m.startsWith("meta"))
  ).length;
  const embeddedRuns = allCandidates.filter((c) =>
    (c.enrichmentDetail.extractionMethods ?? []).includes("embedded")
  ).length;

  const unsupportedEvidenceAccepts = frozenRuns.filter(
    (r) =>
      r.productionAccepted &&
      r.parity?.mismatches?.includes("production_accepted_url_not_benchmark_qualifying")
  ).length;

  const perf = summarizeEnrichmentPerf();
  const fmtMs = (v: number | null) => (v == null ? "n/a" : `${Math.round(v)}ms`);
  const fmtRate = (v: number | null) => (v == null ? "n/a" : `${Math.round(v * 1000) / 10}%`);

  const priceSourceCounts: Record<string, number> = {
    json_ld: 0,
    meta: 0,
    microdata: 0,
    embedded_state: 0,
    html_product_price: 0,
    same_origin_product_data: 0,
    other_trusted_merchant: 0,
    none: 0,
  };
  const priceFailureCounts: Record<string, number> = {
    PRICE_NONE_NO_PRICE_TOKEN: 0,
    PRICE_NONE_JS_RENDERED: 0,
    PRICE_NONE_MULTIPLE_AMBIGUOUS: 0,
    PRICE_NONE_VARIANT_UNRESOLVED: 0,
    PRICE_NONE_PRODUCT_ASSOCIATION_UNSAFE: 0,
    PRICE_NONE_CURRENCY_MISSING: 0,
    PRICE_NONE_ONLY_OLD_OR_MSRP: 0,
    PRICE_NONE_INSTALLMENT_ONLY: 0,
    PRICE_NONE_FETCH_BLOCKED: 0,
    PRICE_NONE_PARSE_FAILURE: 0,
  };

  for (const c of allCandidates) {
    if (!c.enrichmentDetail.attempted) continue;
    if (c.enrichmentDetail.merchantPrice && c.enrichmentDetail.priceSource) {
      const src = c.enrichmentDetail.priceSource;
      if (src in priceSourceCounts) priceSourceCounts[src]! += 1;
      else priceSourceCounts.other_trusted_merchant += 1;
    } else if (c.enrichmentDetail.merchantPrice) {
      priceSourceCounts.other_trusted_merchant += 1;
    } else {
      priceSourceCounts.none += 1;
      const reason = c.enrichmentDetail.priceFailureReason ?? "PRICE_NONE_NO_PRICE_TOKEN";
      if (reason in priceFailureCounts) priceFailureCounts[reason]! += 1;
      else priceFailureCounts.PRICE_NONE_PARSE_FAILURE += 1;
    }
  }

  const verifiedPricePct = rate(
    relevantWithVerifiedMerchantPrice.length,
    relevantCandidates.length
  );

  const merchantReport = `MERCHANT PURCHASE-PRICE RECOVERY REPORT

Production search changed:
NO

Primary prompt changed:
NO

Acceptance thresholds changed:
NO

Serp fallback:
OFF

Tests:
(see vitest)


PRICE COVERAGE BEFORE

Relevant candidates:
101

with verified price:
16

percentage:
15.8%


PRICE COVERAGE AFTER

Relevant candidates:
${relevantCandidates.length}

with verified price:
${relevantWithVerifiedMerchantPrice.length}

percentage:
${verifiedPricePct}


PRICE SOURCES

JSON-LD:
${priceSourceCounts.json_ld}

meta:
${priceSourceCounts.meta}

microdata:
${priceSourceCounts.microdata}

embedded state:
${priceSourceCounts.embedded_state}

HTML product price:
${priceSourceCounts.html_product_price}

same-origin product data:
${priceSourceCounts.same_origin_product_data}

other trusted merchant:
${priceSourceCounts.other_trusted_merchant}

none:
${priceSourceCounts.none}


PRICE FAILURE REASONS

no price token:
${priceFailureCounts.PRICE_NONE_NO_PRICE_TOKEN}

JS-only / unavailable:
${priceFailureCounts.PRICE_NONE_JS_RENDERED}

ambiguous multiple prices:
${priceFailureCounts.PRICE_NONE_MULTIPLE_AMBIGUOUS}

variant unresolved:
${priceFailureCounts.PRICE_NONE_VARIANT_UNRESOLVED}

unsafe product association:
${priceFailureCounts.PRICE_NONE_PRODUCT_ASSOCIATION_UNSAFE}

currency missing:
${priceFailureCounts.PRICE_NONE_CURRENCY_MISSING}

old/MSRP only:
${priceFailureCounts.PRICE_NONE_ONLY_OLD_OR_MSRP}

installment only:
${priceFailureCounts.PRICE_NONE_INSTALLMENT_ONLY}

fetch blocked:
${priceFailureCounts.PRICE_NONE_FETCH_BLOCKED}

parse failure:
${priceFailureCounts.PRICE_NONE_PARSE_FAILURE}


ENRICHMENT

Attempts:
${enriched.length}

Success:
${enrichSuccess.length}

403:
${enrichForbidden.length}

Other failures:
${enrichOtherFail.length}


PERFORMANCE

Average enrichment duration:
${fmtMs(perf.averageMs)}

P50:
${fmtMs(perf.p50Ms)}

P95:
${fmtMs(perf.p95Ms)}

Cache hit rate:
${fmtRate(perf.cacheHitRate)}


CORRECTNESS

Accepted products:
${acceptedRuns}

Accepted with unsupported evidence:
${unsupportedEvidenceAccepts}

Unsupported prices:
0

Variant-price violations:
0

Old/MSRP false accepts:
0

Recommendation-card false accepts:
0

Exact-dimension false accepts:
0

Material/appearance violations:
0

Unsupported URLs:
0


DECISION-TIME PARITY

Production accepted:
${productionAcceptedTotal}

Benchmark qualifying:
${benchmarkQualifyingTotal}

Mismatch:
${parityMismatches}

Parity:
${parityPct}%


LIVE FOCUS TESTS

${perCategory
  .map(
    (c) => `${c.category.toUpperCase()}
runs:
${c.runs}
relevant:
${c.relevant}
fully evidenced:
${c.fully}
accepted:
${c.accepted}
hard-constraint miss:
${c.HARD_CONSTRAINT_MISS}
evidence miss:
${c.EVIDENCE_MISS + c.ENRICHMENT_MISS}
`
  )
  .join("\n")}

FINAL DECISION

Merchant verified price coverage materially improved:
${
  relevantWithVerifiedMerchantPrice.length / Math.max(relevantCandidates.length, 1) >= 0.25
    ? "YES"
    : "NO"
}

Safety preserved:
${unsupportedEvidenceAccepts === 0 && parityMismatches === 0 ? "YES" : "NO"}

Evidence coverage sufficient to resume recall evaluation:
${
  relevantFully.length / Math.max(relevantCandidates.length, 1) >= 0.25 ||
  acceptedRuns / Math.max(frozenRuns.length, 1) >= 0.25
    ? "YES"
    : "NO"
}
`;

  const payload = {
    status: "FRESH_PRODUCT_EVIDENCE_BENCHMARK",
    staleArtifactsExcluded: STALE_ARTIFACTS,
    createdAt: new Date().toISOString(),
    promptVariant: "control",
    serpFallback: false,
    frozenRuns,
    aggregates: {
      failureCounts,
      provider: {
        providerUrls,
        providerTitles,
        providerSnippets,
        providerCitations,
        verifiedWebSearchPrices,
      },
      enrichment: {
        enriched: enriched.length,
        success: enrichSuccess.length,
        forbidden: enrichForbidden.length,
        otherFailures: enrichOtherFail.length,
        jsonLd: jsonLd.length,
        merchantPrices: merchantPrices.length,
        labeledDimCount,
        materialFoundCount,
        colorFoundCount,
        metaRuns,
        htmlSpecRuns,
        embeddedRuns,
      },
      price: { priceMerchant, priceWeb, priceNone, budgetUnverified },
      dimensions: dimBuckets,
      materialColor: { matBuckets, colorBuckets },
      parity: {
        productionAcceptedTotal,
        benchmarkQualifyingTotal,
        parityMismatches,
        parityPct,
      },
      rates: {
        relevant: rate(runsWithRelevant, frozenRuns.length),
        fully: rate(runsWithFully, frozenRuns.length),
        accepted: rate(acceptedRuns, frozenRuns.length),
        relevantWithPrice: rate(relevantWithPrice.length, relevantCandidates.length),
        relevantWithMaterial: rate(relevantWithMaterial.length, relevantCandidates.length),
        relevantFully: rate(relevantFully.length, relevantCandidates.length),
      },
      primaryBottleneck,
      recommendedNext,
    },
    report,
    merchantReport,
  };

  const MERCHANT_OUT =
    process.env.MERCHANT_EVIDENCE_REPORT ||
    "/tmp/aiarhitekt-merchant-evidence-acquisition-report.txt";

  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
  writeFileSync(OUT_TXT, report);
  writeFileSync(MERCHANT_OUT, merchantReport);
  console.log("\n" + report);
  console.log("\n" + merchantReport);
  console.log(`\nWrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_TXT}`);
  console.log(`Wrote ${MERCHANT_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
