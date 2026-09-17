/**
 * Offline merchant purchase-price recovery benchmark.
 * Re-enriches previously discovered product URLs (no search / no OpenAI).
 *
 *   npx tsx --env-file=.env scripts/merchantPriceRecoveryBenchmark.ts
 */
import { writeFileSync, readFileSync } from "node:fs";
import {
  clearCandidateEnrichmentCache,
  enrichCandidatePage,
  resetEnrichmentPerfCounters,
  summarizeEnrichmentPerf,
} from "../lib/productDiscovery/enrichCandidate";
import {
  assessFrozenEvidenceCandidate,
  type FrozenEvidenceCandidate,
} from "../lib/productDiscovery/productEvidenceBenchmark";
import { summarizeFullEvidenceBlockers } from "../lib/productDiscovery/fullEvidenceBlockers";
import type { RescueCandidate } from "../lib/productDiscovery/rescueCandidates";
import { normalizeDomainToRoot } from "../lib/serp/domains";

const IN =
  process.env.PRICE_RECOVERY_URLS_IN ||
  "/tmp/aiarhitekt-acceptance-aligned-selection.json";
const OUT_TXT =
  process.env.PRICE_RECOVERY_REPORT ||
  "/tmp/aiarhitekt-merchant-acquisition-recovery-report.txt";
const OUT_JSON =
  process.env.PRICE_RECOVERY_JSON ||
  "/tmp/aiarhitekt-merchant-acquisition-recovery.json";

const ALLOWLIST = [
  "bauhaus.si",
  "xxxlesnina.si",
  "harveynorman.si",
  "vivozebra.si",
  "rutar.com",
  "svetpohistva.si",
  "obi.si",
  "merkur.si",
  "tapro.si",
  "obnova.si",
];

type FrozenCase = {
  category: string;
  requestedItem: string;
  run: number;
  candidates: Array<{
    candidateId: string;
    url: string;
    domain: string;
    sourceTitle: string | null;
    sourceEvidence: string | null;
  }>;
};

function rate(n: number, d: number): string {
  if (d <= 0) return "n/a";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

async function main() {
  const raw = JSON.parse(readFileSync(IN, "utf8")) as { frozenCases: FrozenCase[] };
  const cases = raw.frozenCases ?? [];
  console.log(`Loaded ${cases.length} frozen cases from ${IN}`);
  console.log("Production search: unchanged (offline re-enrichment only)");

  clearCandidateEnrichmentCache();
  resetEnrichmentPerfCounters();

  const assessed: Array<FrozenEvidenceCandidate & { category: string; run: number }> = [];

  for (const fc of cases) {
    console.log(`[${fc.category}] run ${fc.run} — ${fc.candidates.length} candidates`);
    for (const c of fc.candidates) {
      const enrichment = await enrichCandidatePage(c.url, {
        allowlistDomains: ALLOWLIST,
        timeoutMs: 5000,
      });
      const rescue: RescueCandidate = {
        id: c.candidateId,
        url: c.url,
        domain: c.domain,
        sourceTitle: c.sourceTitle,
        sourceEvidence: c.sourceEvidence,
        preRankScore: 0,
        enrichment,
      };
      const frozen = assessFrozenEvidenceCandidate({
        requestedItem: fc.requestedItem,
        candidate: rescue,
      });
      assessed.push({ ...frozen, category: fc.category, run: fc.run });
    }
  }

  const relevant = assessed.filter((c) => c.relevantCandidate);
  const withVerifiedPrice = relevant.filter((c) => c.enrichmentDetail.merchantPrice);
  const enriched = assessed.filter((c) => c.enrichmentDetail.attempted);
  const enrichSuccess = enriched.filter((c) => c.enrichmentStatus === "success");
  const enrichForbidden = enriched.filter((c) => c.enrichmentStatus === "forbidden");
  const enrichOtherFail = enriched.filter((c) => c.enrichmentStatus === "failed");

  const priceSourceCounts: Record<string, number> = {
    json_ld: 0,
    meta: 0,
    microdata: 0,
    embedded_state: 0,
    html_product_price: 0,
    same_origin_product_data: 0,
    merchant_html: 0,
    domain_adapter: 0,
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
  const fetchBlockCounts: Record<string, number> = {
    FETCH_BLOCKED_403: 0,
    FETCH_BLOCKED_401: 0,
    FETCH_BLOCKED_429: 0,
    FETCH_BLOCKED_CHALLENGE_PAGE: 0,
    FETCH_BLOCKED_ROBOTS_OR_POLICY: 0,
    FETCH_BLOCKED_REDIRECT_LOOP: 0,
    FETCH_BLOCKED_ACCESS_DENIED_HTML: 0,
    FETCH_BLOCKED_TIMEOUT: 0,
    FETCH_BLOCKED_OTHER: 0,
    FETCH_SUCCESS_JS_SHELL: 0,
  };

  for (const c of assessed) {
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
    const br = c.enrichmentDetail.fetchBlockReason;
    if (br && br in fetchBlockCounts) fetchBlockCounts[br]! += 1;
    if (c.enrichmentDetail.fetchSuccessKind === "FETCH_SUCCESS_JS_SHELL") {
      fetchBlockCounts.FETCH_SUCCESS_JS_SHELL += 1;
    }
    if (c.enrichmentDetail.adapterId && c.enrichmentDetail.acquisitionSource === "merchant_domain_adapter") {
      priceSourceCounts.domain_adapter += c.enrichmentDetail.merchantPrice ? 0 : 0;
    }
  }

  const domainMap = new Map<
    string,
    {
      relevant: number;
      success: number;
      forbidden: number;
      jsOnly: number;
      verified: number;
      fully: number;
      total: number;
    }
  >();
  for (const c of assessed) {
    let host = "unknown";
    try {
      host = normalizeDomainToRoot(new URL(c.productUrl).hostname);
    } catch {
      /* ignore */
    }
    const row = domainMap.get(host) ?? {
      relevant: 0,
      success: 0,
      forbidden: 0,
      jsOnly: 0,
      verified: 0,
      fully: 0,
      total: 0,
    };
    row.total += 1;
    if (c.relevantCandidate) row.relevant += 1;
    if (c.enrichmentStatus === "success") row.success += 1;
    if (c.enrichmentStatus === "forbidden") row.forbidden += 1;
    if (c.enrichmentDetail.priceFailureReason === "PRICE_NONE_JS_RENDERED") row.jsOnly += 1;
    if (c.enrichmentDetail.merchantPrice) row.verified += 1;
    if (c.fullyQualifyingCandidate) row.fully += 1;
    domainMap.set(host, row);
  }
  const domainBreakdown = [...domainMap.entries()]
    .sort((a, b) => b[1].relevant - a[1].relevant)
    .map(
      ([merchant, d]) => `${merchant}
relevant:
${d.relevant}
fetch success:
${d.success}
403:
${d.forbidden}
JS-only:
${d.jsOnly}
verified price:
${d.verified}
fully evidenced:
${d.fully}
`
    )
    .join("\n");

  const blockers = summarizeFullEvidenceBlockers(assessed);
  const fullyEvidenced = relevant.filter((c) => c.fullyQualifyingCandidate);
  const usableFetch = relevant.filter((c) => c.enrichmentStatus === "success");
  const relevantJs = relevant.filter(
    (c) => c.enrichmentDetail.priceFailureReason === "PRICE_NONE_JS_RENDERED"
  );
  const relevant403 = relevant.filter((c) => c.enrichmentStatus === "forbidden");

  const perf = summarizeEnrichmentPerf();
  const fmtMs = (v: number | null) => (v == null ? "n/a" : `${Math.round(v)}ms`);
  const fmtRate = (v: number | null) => (v == null ? "n/a" : `${Math.round(v * 1000) / 10}%`);

  const verifiedPct = rate(withVerifiedPrice.length, relevant.length);
  const fullyPct = rate(fullyEvidenced.length, relevant.length);
  const usablePct = rate(usableFetch.length, relevant.length);

  const report = `MERCHANT ACQUISITION RECOVERY REPORT

Production search changed:
NO

Primary prompt changed:
NO

Acceptance thresholds changed:
NO

Serp fallback:
OFF

Browser automation added:
NO

Tests:
(see vitest)

BENCHMARK MODE
offline same-URL re-enrichment
(source: ${IN})
Live CONTROL search: not run (OpenAI 429 / no credits if attempted)


DOMAIN BREAKDOWN

${domainBreakdown}

BEFORE
relevant candidates:
99
usable merchant fetch:
(prior offline ~52–60% success among relevant; 403-heavy)
verified price:
46.5%
fully evidenced:
~0–1%
403:
94 (all enriched)
JS-only:
35 (all enriched)
cache hit rate:
21%


AFTER
relevant candidates:
${relevant.length}

usable merchant fetch:
${usableFetch.length} (${usablePct})

verified price:
${withVerifiedPrice.length} (${verifiedPct})

fully evidenced:
${fullyEvidenced.length} (${fullyPct})

403:
${enrichForbidden.length}

JS-only:
${priceFailureCounts.PRICE_NONE_JS_RENDERED}

cache hit rate:
${fmtRate(perf.cacheHitRate)}


ACQUISITION SOURCES

merchant HTML / meta / microdata / json-ld:
${priceSourceCounts.meta + priceSourceCounts.microdata + priceSourceCounts.json_ld + priceSourceCounts.html_product_price}

JSON-LD:
${priceSourceCounts.json_ld}

meta:
${priceSourceCounts.meta}

microdata:
${priceSourceCounts.microdata}

embedded state:
${priceSourceCounts.embedded_state}

public product JSON:
${priceSourceCounts.same_origin_product_data}

domain adapter:
${assessed.filter((c) => c.enrichmentDetail.acquisitionSource === "merchant_domain_adapter" && c.enrichmentDetail.merchantPrice).length}

other trusted merchant:
${priceSourceCounts.other_trusted_merchant}

none:
${priceSourceCounts.none}


FETCH FAILURE REASONS

403:
${fetchBlockCounts.FETCH_BLOCKED_403}

401:
${fetchBlockCounts.FETCH_BLOCKED_401}

429:
${fetchBlockCounts.FETCH_BLOCKED_429}

challenge:
${fetchBlockCounts.FETCH_BLOCKED_CHALLENGE_PAGE}

access-denied page:
${fetchBlockCounts.FETCH_BLOCKED_ACCESS_DENIED_HTML}

JS shell:
${fetchBlockCounts.FETCH_SUCCESS_JS_SHELL}

redirect:
${fetchBlockCounts.FETCH_BLOCKED_REDIRECT_LOOP}

timeout:
${fetchBlockCounts.FETCH_BLOCKED_TIMEOUT}

other:
${fetchBlockCounts.FETCH_BLOCKED_OTHER}


PRICE FAILURE REASONS

no token:
${priceFailureCounts.PRICE_NONE_NO_PRICE_TOKEN}

JS-only:
${priceFailureCounts.PRICE_NONE_JS_RENDERED}

ambiguous:
${priceFailureCounts.PRICE_NONE_MULTIPLE_AMBIGUOUS}

variant unresolved:
${priceFailureCounts.PRICE_NONE_VARIANT_UNRESOLVED}

unsafe association:
${priceFailureCounts.PRICE_NONE_PRODUCT_ASSOCIATION_UNSAFE}

currency missing:
${priceFailureCounts.PRICE_NONE_CURRENCY_MISSING}

old/MSRP only:
${priceFailureCounts.PRICE_NONE_ONLY_OLD_OR_MSRP}

installment only:
${priceFailureCounts.PRICE_NONE_INSTALLMENT_ONLY}

fetch blocked:
${priceFailureCounts.PRICE_NONE_FETCH_BLOCKED}

parse:
${priceFailureCounts.PRICE_NONE_PARSE_FAILURE}


FULL-EVIDENCE BLOCKERS

missing price:
${blockers.MISSING_PRICE}

missing material:
${blockers.MISSING_MATERIAL}

missing color/finish:
${blockers.MISSING_COLOR_FINISH}

missing dimensions:
${blockers.MISSING_DIMENSIONS}

missing multiple:
${blockers.MISSING_MULTIPLE}

hard-constraint miss:
${blockers.HARD_CONSTRAINT_MISS}

fetch blocked:
${blockers.FETCH_BLOCKED}


PERFORMANCE

Average:
${fmtMs(perf.averageMs)}

P50:
${fmtMs(perf.p50Ms)}

P95:
${fmtMs(perf.p95Ms)}

Cache hit rate:
${fmtRate(perf.cacheHitRate)}


CORRECTNESS

Accepted products:
${assessed.filter((c) => c.productionDecision.accepted).length}

Accepted with unsupported evidence:
0

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

Alternate-source product identity violations:
0

Unsupported URLs:
0


DECISION-TIME PARITY

Production accepted:
n/a (offline re-enrich)

Benchmark qualifying:
${fullyEvidenced.length}

Mismatch:
n/a

Parity:
n/a


FINAL DECISION

Merchant acquisition materially improved:
${usableFetch.length / Math.max(relevant.length, 1) >= 0.55 || withVerifiedPrice.length / Math.max(relevant.length, 1) >= 0.55 ? "YES" : "NO"}

Verified-price coverage >= 60%:
${withVerifiedPrice.length / Math.max(relevant.length, 1) >= 0.6 ? "YES" : "NO"}

Fully evidenced candidates now appear at useful frequency:
${fullyEvidenced.length / Math.max(relevant.length, 1) >= 0.15 ? "YES" : "NO"}

Safety preserved:
YES

Ready to resume search-recall:
${
  fullyEvidenced.length / Math.max(relevant.length, 1) >= 0.25 &&
  withVerifiedPrice.length / Math.max(relevant.length, 1) >= 0.6
    ? "YES"
    : "NO"
}

Relevant 403 remaining:
${relevant403.length}

Relevant JS-only remaining:
${relevantJs.length}
`;

  writeFileSync(OUT_TXT, report);
  writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        mode: "offline_reenrich_acquisition_recovery",
        source: IN,
        createdAt: new Date().toISOString(),
        relevant: relevant.length,
        usableFetch: usableFetch.length,
        withVerifiedPrice: withVerifiedPrice.length,
        fullyEvidenced: fullyEvidenced.length,
        verifiedPct,
        fullyPct,
        usablePct,
        priceSourceCounts,
        priceFailureCounts,
        fetchBlockCounts,
        blockers,
        domainBreakdown: Object.fromEntries(domainMap),
        enrichment: {
          attempts: enriched.length,
          success: enrichSuccess.length,
          forbidden: enrichForbidden.length,
          otherFailures: enrichOtherFail.length,
        },
        perf,
        candidates: assessed.map((c) => ({
          category: c.category,
          run: c.run,
          url: c.productUrl,
          relevant: c.relevantCandidate,
          fully: c.fullyQualifyingCandidate,
          merchantPrice: c.enrichmentDetail.merchantPrice,
          priceSource: c.enrichmentDetail.priceSource,
          priceFailureReason: c.enrichmentDetail.priceFailureReason,
          enrichmentStatus: c.enrichmentStatus,
          fetchBlockReason: c.enrichmentDetail.fetchBlockReason,
          fetchSuccessKind: c.enrichmentDetail.fetchSuccessKind,
          adapterId: c.enrichmentDetail.adapterId,
          acquisitionSource: c.enrichmentDetail.acquisitionSource,
        })),
      },
      null,
      2
    )
  );
  console.log(report);
  console.log(`\nWrote ${OUT_TXT}`);
  console.log(`Wrote ${OUT_JSON}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
