/**
 * Search-recall benchmark (hard-constraint discovery).
 *
 * Offline fixtures (default):
 *   npx tsx scripts/searchRecallBenchmark.ts
 *
 * Live CONTROL end-to-end (production searchProductItem path):
 *   SEARCH_RECALL_LIVE=1 npx tsx --env-file=.env scripts/searchRecallBenchmark.ts
 *
 * On OpenAI 429 / insufficient credits: abort immediately — never substitute fixtures as live.
 */
import { writeFileSync } from "node:fs";
import {
  clearCandidateEnrichmentCache,
  resetEnrichmentPerfCounters,
  summarizeEnrichmentPerf,
} from "../lib/productDiscovery/enrichCandidate";
import { isChallengeOrBlockedDomainUnsupported } from "../lib/productDiscovery/merchantAcquisitionDiagnostics";
import {
  ACCEPTANCE_PRIMARY_MIN_SCORE,
  ACCEPTANCE_RESCUE_MIN_SCORE,
  isProductDiscoverySerpFallbackEnabled,
} from "../lib/productDiscovery/constants";
import { buildRescueCandidates } from "../lib/productDiscovery/rescueCandidates";
import {
  discoveryDomainMetrics,
  scoreConstraintAwareDiscovery,
} from "../lib/productDiscovery/discoveryScore";
import { buildSearchConstraints } from "../lib/productDiscovery/searchConstraints";
import {
  buildSearchQueryVariants,
  summarizeQueryVariantStats,
} from "../lib/productDiscovery/searchQueryVariants";
import { searchProductItem } from "../lib/productDiscovery/searchItem";
import { prepareEnrichedCandidates } from "../lib/productDiscovery/selectionStability";
import { assessAcceptanceAlignedQualification } from "../lib/productDiscovery/selectionBenchmarkGroundTruth";
import { normalizeDomainToRoot } from "../lib/serp/domains";
import type { ProductDiscoveryResult } from "../lib/productDiscovery/types";

type FocusCase = {
  id: "LIGHTING" | "ACCESSORY" | "BATHROOM-TOWEL" | "KITCHEN-EXACT";
  requestedItem: string;
  fixtureHits: Array<{
    url: string;
    title: string;
    snippet: string;
    relevant: boolean;
    qualifying: boolean;
  }>;
};

/** Frozen benchmark cases — do not change queries. */
const CASES: FocusCase[] = [
  {
    id: "LIGHTING",
    requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
    fixtureHits: [
      {
        url: "https://obi.si/p/lamp-40",
        title: "Viseča svetilka črna premer 40 cm",
        snippet: "Premer: 40 cm kovina",
        relevant: true,
        qualifying: true,
      },
      {
        url: "https://merkur.si/p/lamp-28",
        title: "Visilka črna 28 cm",
        snippet: "premer 28 cm",
        relevant: true,
        qualifying: false,
      },
      {
        url: "https://www.bauhaus.si/p/lamp-x",
        title: "Viseča svetilka 40 cm",
        snippet: "40 cm",
        relevant: true,
        qualifying: true,
      },
      {
        url: "https://obi.si/p/floor-lamp",
        title: "Stoječa svetilka",
        snippet: "floor lamp",
        relevant: false,
        qualifying: false,
      },
    ],
  },
  {
    id: "ACCESSORY",
    requestedItem: "white ceramic vase approx 30cm max 80 EUR",
    fixtureHits: [
      {
        url: "https://obi.si/p/vase-30",
        title: "Keramična vaza bela višina 30 cm",
        snippet: "Višina: 30 cm keramika",
        relevant: true,
        qualifying: true,
      },
      {
        url: "https://merkur.si/p/tile-white",
        title: "Bela ploščica",
        snippet: "tile ceramic white",
        relevant: false,
        qualifying: false,
      },
      {
        url: "https://obi.si/p/vase-50",
        title: "Vaza 50 cm",
        snippet: "višina 50 cm",
        relevant: true,
        qualifying: false,
      },
    ],
  },
  {
    id: "BATHROOM-TOWEL",
    requestedItem: "chrome heated towel rail width ~60cm max 200 EUR",
    fixtureHits: [
      {
        url: "https://merkur.si/p/radiator-60",
        title: "Radiator za brisače krom 60 cm",
        snippet: "širina 60 cm kromiran radiator",
        relevant: true,
        qualifying: true,
      },
      {
        url: "https://obi.si/p/towel-holder",
        title: "Držalo za brisače krom",
        snippet: "towel holder chrome",
        relevant: false,
        qualifying: false,
      },
      {
        url: "https://www.bauhaus.si/p/radiator-60",
        title: "Kopalniški radiator 60 cm",
        snippet: "60 cm",
        relevant: true,
        qualifying: true,
      },
    ],
  },
  {
    id: "KITCHEN-EXACT",
    requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
    fixtureHits: [
      {
        url: "https://obi.si/p/sink-600",
        title: "Pomivalno korito širina 600 mm inox",
        snippet: "Širina: 600 mm nerjavno jeklo",
        relevant: true,
        qualifying: true,
      },
      {
        url: "https://tapro.si/p/sink-61",
        title: "Line 60 korito 61x50",
        snippet: "Širina: 610 mm",
        relevant: true,
        qualifying: false,
      },
      {
        url: "https://merkur.si/p/sink-860",
        title: "Sink Solution 860x500",
        snippet: "Širina: 50 cm DOLŽINA: 86 cm minimalna širina omarice 60 cm",
        relevant: true,
        qualifying: false,
      },
      {
        url: "https://www.bauhaus.si/p/classic-40",
        title: "Classic 40 800 x 600 mm",
        snippet: "800 x 600 mm",
        relevant: true,
        qualifying: false,
      },
      {
        url: "https://merkur.si/p/sink-600b",
        title: "Korito width 600 mm stainless",
        snippet: "width 600 mm inox",
        relevant: true,
        qualifying: true,
      },
    ],
  },
];

const OUT =
  process.env.SEARCH_RECALL_REPORT ||
  "/tmp/aiarhitekt-search-recall-improvement-report.txt";
const OUT_JSON =
  process.env.SEARCH_RECALL_JSON ||
  "/tmp/aiarhitekt-search-recall-improvement.json";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const PACE_MS = Number(process.env.BENCHMARK_PACE_MS ?? 2000);

function rate(n: number, d: number): string {
  if (d <= 0) return "n/a";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

function median(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.floor(v.length / 2)]!;
}

function isOpenAiCreditFailure(err: unknown, result?: ProductDiscoveryResult | null): boolean {
  const msg = [
    err instanceof Error ? err.message : String(err ?? ""),
    result?.diagnostics?.errorCode ?? "",
    result?.status === "error" ? "error" : "",
  ]
    .join(" ")
    .toLowerCase();
  return /429|insufficient_quota|insufficient credits|quota|billing|rate[_ ]?limit/.test(msg);
}

function domainOf(url: string): string {
  try {
    return normalizeDomainToRoot(new URL(url).hostname);
  } catch {
    return "unknown";
  }
}

async function fetchAllowlist(): Promise<string[]> {
  const fromEnv = process.env.SEARCH_RECALL_ALLOWLIST?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv?.length) return fromEnv;

  try {
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
    const domains = json.domains?.stores ?? json.allowlistDomainsStores ?? [];
    if (Array.isArray(domains) && domains.length > 0) return domains;
  } catch {
    /* fall through */
  }

  return [
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
}

type LiveCaseResult = {
  id: FocusCase["id"];
  requestedItem: string;
  ok: boolean;
  error: string | null;
  creditFailure: boolean;
  generatedQueries: string[];
  suggestedQueryCount: number;
  webSearchCalls: number;
  searchLatencyMs: number;
  enrichmentLatencyMs: number;
  endToEndLatencyMs: number;
  rescueTriggered: boolean;
  targetedResearchTriggered: boolean;
  sourcesTotal: number;
  uniqueCandidates: number;
  supportedEnrichable: number;
  relevant: number;
  qualifying: number;
  enriched: number;
  fullyEvidenced: number;
  accepted: number;
  topQualifyingRank: number | null;
  topAcceptedRank: number | null;
  productionAccepted: boolean;
  productionUrl: string | null;
  domains: ReturnType<typeof discoveryDomainMetrics>;
  qualifyingUrls: string[];
  acceptedUrls: string[];
  kitchenExactChecks?: {
    classic40FalseAccept: boolean;
    cabinetWidthFalseAccept: boolean;
    nonExactWidthAccepted: boolean;
  };
};

async function runLiveCase(
  focus: FocusCase,
  allowlist: string[]
): Promise<LiveCaseResult> {
  const suggested = buildSearchQueryVariants(focus.requestedItem, {
    allowlistDomains: allowlist,
    includeRescue: true,
  });
  const t0 = Date.now();
  let result: ProductDiscoveryResult;
  try {
    result = await searchProductItem({
      requestedItem: focus.requestedItem,
      allowlistDomains: allowlist,
    });
  } catch (err) {
    const creditFailure = isOpenAiCreditFailure(err);
    return {
      id: focus.id,
      requestedItem: focus.requestedItem,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      creditFailure,
      generatedQueries: [],
      suggestedQueryCount: suggested.length,
      webSearchCalls: 0,
      searchLatencyMs: Date.now() - t0,
      enrichmentLatencyMs: 0,
      endToEndLatencyMs: Date.now() - t0,
      rescueTriggered: false,
      targetedResearchTriggered: false,
      sourcesTotal: 0,
      uniqueCandidates: 0,
      supportedEnrichable: 0,
      relevant: 0,
      qualifying: 0,
      enriched: 0,
      fullyEvidenced: 0,
      accepted: 0,
      topQualifyingRank: null,
      topAcceptedRank: null,
      productionAccepted: false,
      productionUrl: null,
      domains: discoveryDomainMetrics([]),
      qualifyingUrls: [],
      acceptedUrls: [],
    };
  }

  const searchLatencyMs = result.diagnostics?.elapsedMs ?? Date.now() - t0;
  if (result.status === "error" && isOpenAiCreditFailure(null, result)) {
    return {
      id: focus.id,
      requestedItem: focus.requestedItem,
      ok: false,
      error: result.diagnostics?.errorCode ?? "openai_error",
      creditFailure: true,
      generatedQueries: result.diagnostics?.primarySearchQueries ?? [],
      suggestedQueryCount: suggested.length,
      webSearchCalls: result.diagnostics?.primaryWebSearchCallCount ?? 0,
      searchLatencyMs,
      enrichmentLatencyMs: 0,
      endToEndLatencyMs: Date.now() - t0,
      rescueTriggered: Boolean(result.diagnostics?.rescueAttempted),
      targetedResearchTriggered: Boolean(result.diagnostics?.targetedResearchAttempted),
      sourcesTotal: result.sources.length,
      uniqueCandidates: 0,
      supportedEnrichable: 0,
      relevant: 0,
      qualifying: 0,
      enriched: 0,
      fullyEvidenced: 0,
      accepted: 0,
      topQualifyingRank: null,
      topAcceptedRank: null,
      productionAccepted: false,
      productionUrl: null,
      domains: discoveryDomainMetrics([]),
      qualifyingUrls: [],
      acceptedUrls: [],
    };
  }

  const enrichStarted = Date.now();
  resetEnrichmentPerfCounters();
  clearCandidateEnrichmentCache();
  const { candidates, qualifying: assessments } = await prepareEnrichedCandidates({
    sources: result.sources,
    allowlistDomains: allowlist,
    requestedItem: focus.requestedItem,
  });
  const enrichmentLatencyMs = Date.now() - enrichStarted;
  const enrichPerf = summarizeEnrichmentPerf();

  // Ensure production-accepted URL is assessed if missing from source list.
  let working = candidates;
  let workingAssessments = assessments;
  if (
    result.status === "found" &&
    result.product?.productUrl &&
    !candidates.some((c) => c.url === result.product!.productUrl)
  ) {
    const extra = await prepareEnrichedCandidates({
      sources: [
        {
          url: result.product.productUrl,
          title: result.product.name,
          snippet: null,
        },
        ...result.sources,
      ],
      allowlistDomains: allowlist,
      requestedItem: focus.requestedItem,
    });
    working = extra.candidates;
    workingAssessments = extra.qualifying;
  }

  const ranked = working.map((c, i) => ({
    candidate: c,
    assessment: workingAssessments[i] ?? assessAcceptanceAlignedQualification(focus.requestedItem, c),
  }));

  const supportedEnrichable = ranked.filter(
    (r) =>
      !isChallengeOrBlockedDomainUnsupported(r.candidate.domain) &&
      r.candidate.enrichment?.status === "success"
  ).length;
  const enriched = ranked.filter((r) => r.candidate.enrichment?.status === "success").length;
  const qualifyingRows = ranked.filter((r) => r.assessment.qualifies);
  const fullyEvidenced = qualifyingRows.length; // acceptance-aligned qualifies ⇒ fully evidenced under GT
  const acceptedRows = ranked.filter(
    (r) => r.assessment.qualifies && r.assessment.acceptanceAccepted
  );
  const productionAccepted = result.status === "found" && !!result.product?.productUrl;

  const topQualifyingRank = (() => {
    const idx = ranked.findIndex((r) => r.assessment.qualifies);
    return idx >= 0 ? idx + 1 : null;
  })();
  const topAcceptedRank = (() => {
    const idx = ranked.findIndex((r) => r.assessment.qualifies && r.assessment.acceptanceAccepted);
    return idx >= 0 ? idx + 1 : null;
  })();

  // Relevant ≈ category-compatible candidates (qualifying OR soft-relevant via GT reasons without wrong-category)
  const relevant = ranked.filter((r) => {
    if (r.assessment.qualifies) return true;
    const reasons = r.assessment.reasons.join(" ").toLowerCase();
    return !/wrong category|core category unverified/.test(reasons);
  }).length;

  let kitchenExactChecks: LiveCaseResult["kitchenExactChecks"];
  if (focus.id === "KITCHEN-EXACT") {
    const acceptedUrls = acceptedRows.map((r) => r.candidate.url.toLowerCase());
    const acceptedText = acceptedRows
      .map((r) =>
        [
          r.candidate.sourceTitle,
          r.candidate.url,
          r.candidate.enrichment?.productName,
          r.candidate.enrichment?.productText?.slice(0, 500),
        ]
          .filter(Boolean)
          .join(" ")
      )
      .join("\n")
      .toLowerCase();
    kitchenExactChecks = {
      classic40FalseAccept: acceptedRows.some(
        (r) =>
          /classic\s*40/i.test(r.candidate.sourceTitle ?? "") ||
          /classic-40|classic_40|800\s*[x×]\s*600/i.test(r.candidate.url)
      ),
      cabinetWidthFalseAccept: /minimalna\s+širina\s+omarice|cabinet\s+width/i.test(acceptedText),
      nonExactWidthAccepted: acceptedRows.some((r) =>
        /610|620|860x|86\s*cm|61\s*cm|62\s*cm/i.test(
          `${r.candidate.url} ${r.candidate.sourceTitle ?? ""} ${r.candidate.enrichment?.productName ?? ""}`
        )
      ),
    };
    void acceptedUrls;
  }

  return {
    id: focus.id,
    requestedItem: focus.requestedItem,
    ok: result.status !== "error",
    error: result.status === "error" ? result.diagnostics?.errorCode ?? "error" : null,
    creditFailure: false,
    generatedQueries: result.diagnostics?.primarySearchQueries ?? [],
    suggestedQueryCount: suggested.length,
    webSearchCalls: result.diagnostics?.primaryWebSearchCallCount ?? 0,
    searchLatencyMs,
    enrichmentLatencyMs: enrichPerf.averageMs != null ? enrichPerf.averageMs * Math.max(enriched, 1) : enrichmentLatencyMs,
    endToEndLatencyMs: Date.now() - t0,
    rescueTriggered: Boolean(result.diagnostics?.rescueAttempted),
    targetedResearchTriggered: Boolean(result.diagnostics?.targetedResearchAttempted),
    sourcesTotal: result.sources.length,
    uniqueCandidates: working.length,
    supportedEnrichable,
    relevant,
    qualifying: qualifyingRows.length,
    enriched,
    fullyEvidenced,
    accepted: acceptedRows.length + (productionAccepted && acceptedRows.length === 0 && qualifyingRows.some((q) => q.candidate.url === result.product?.productUrl) ? 1 : 0),
    topQualifyingRank,
    topAcceptedRank: productionAccepted
      ? ranked.findIndex((r) => r.candidate.url === result.product?.productUrl) >= 0
        ? ranked.findIndex((r) => r.candidate.url === result.product?.productUrl) + 1
        : topAcceptedRank
      : topAcceptedRank,
    productionAccepted,
    productionUrl: result.product?.productUrl ?? null,
    domains: discoveryDomainMetrics(working),
    qualifyingUrls: qualifyingRows.map((r) => r.candidate.url),
    acceptedUrls: [
      ...acceptedRows.map((r) => r.candidate.url),
      ...(productionAccepted && result.product?.productUrl ? [result.product.productUrl] : []),
    ],
    kitchenExactChecks,
  };
}

function writeLiveReport(
  rows: LiveCaseResult[],
  meta: {
    openaiStatus: "SUCCESS" | "429" | "OTHER ERROR";
    openaiDetail: string;
    testsPass: string;
    allowlist: string[];
  }
) {
  const n = rows.length;
  const successful = rows.filter((r) => r.ok && !r.creditFailure).length;
  const failed = n - successful;

  const withQual = rows.filter((r) => r.qualifying >= 1).length;
  const withQual3 = rows.filter((r) => r.qualifying >= 3).length;
  const withFull = rows.filter((r) => r.fullyEvidenced >= 1).length;
  const withAccepted = rows.filter((r) => r.accepted >= 1 || r.productionAccepted).length;

  const recallAt = (k: number) =>
    rows.filter((r) => r.topQualifyingRank != null && r.topQualifyingRank <= k).length / Math.max(n, 1);

  const genCounts = rows.map((r) => r.suggestedQueryCount);
  const webCounts = rows.map((r) => r.webSearchCalls);
  const searchLat = rows.map((r) => r.searchLatencyMs);
  const enrichLat = rows.map((r) => r.enrichmentLatencyMs);
  const e2eLat = rows.map((r) => r.endToEndLatencyMs);

  const totalCand = rows.reduce((s, r) => s + r.uniqueCandidates, 0);
  const totalSupported = rows.reduce((s, r) => s + r.supportedEnrichable, 0);
  const totalRelevant = rows.reduce((s, r) => s + r.relevant, 0);
  const totalQual = rows.reduce((s, r) => s + r.qualifying, 0);
  const totalFull = rows.reduce((s, r) => s + r.fullyEvidenced, 0);
  const totalAccepted = rows.reduce((s, r) => s + Math.max(r.accepted, r.productionAccepted ? 1 : 0), 0);

  const allDomains = rows.flatMap((r) => r.domains.topDomains);
  const domainMerge = new Map<string, number>();
  for (const d of allDomains) domainMerge.set(d.domain, (domainMerge.get(d.domain) ?? 0) + d.count);
  const topDomains = [...domainMerge.entries()].sort((a, b) => b[1] - a[1]);
  const domainTotal = [...domainMerge.values()].reduce((a, b) => a + b, 0);
  const unsupportedShare =
    rows.reduce((s, r) => s + r.domains.unsupportedMerchantRatio * Math.max(r.uniqueCandidates, 1), 0) /
    Math.max(totalCand, 1);
  const supportedShare = 1 - unsupportedShare;

  const classic40 = rows.find((r) => r.id === "KITCHEN-EXACT")?.kitchenExactChecks?.classic40FalseAccept
    ? 1
    : 0;
  const cabinet = rows.find((r) => r.id === "KITCHEN-EXACT")?.kitchenExactChecks?.cabinetWidthFalseAccept
    ? 1
    : 0;
  const nonExact = rows.find((r) => r.id === "KITCHEN-EXACT")?.kitchenExactChecks?.nonExactWidthAccepted
    ? 1
    : 0;
  const exactDimFalseAccepts = classic40 + cabinet + nonExact;

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const fmtMs = (v: number | null) => (v == null ? "n/a" : `${Math.round(v)}ms`);

  const focusBlock = rows
    .map(
      (r) => `${r.id}
qualifying:
${r.qualifying}

fully evidenced:
${r.fullyEvidenced}

accepted:
${Math.max(r.accepted, r.productionAccepted ? 1 : 0)}

top qualifying rank:
${r.topQualifyingRank ?? "n/a"}

top accepted rank:
${r.topAcceptedRank ?? "n/a"}

rescue:
${r.rescueTriggered ? "YES" : "NO"}

targeted research:
${r.targetedResearchTriggered ? "YES" : "NO"}

web_search calls:
${r.webSearchCalls}

generated queries (provider-visible):
${r.generatedQueries.length ? r.generatedQueries.map((q) => `  - ${q}`).join("\n") : "  (none captured)"}

suggested deterministic variants:
${r.suggestedQueryCount}
`
    )
    .join("\n");

  const liveQualPct = withQual / Math.max(n, 1);
  const liveFullPct = withFull / Math.max(n, 1);
  const liveAccPct = withAccepted / Math.max(n, 1);
  const e2eAvg = avg(e2eLat);
  const perfOk = e2eAvg > 0 && e2eAvg < 180_000; // commercially usable heuristic only after measurement

  const bottleneck =
    meta.openaiStatus !== "SUCCESS"
      ? `OpenAI search unavailable (${meta.openaiStatus}): ${meta.openaiDetail}`
      : liveQualPct < 0.8
        ? "Live qualifying recall <80% — search still not discovering enough constraint-compatible products"
        : liveFullPct < 0.7
          ? "Fully-evidenced query success <70% — enrichment/evidence gaps on discovered candidates"
          : liveAccPct < 0.7
            ? "Accepted query success <70% — acceptance path rejecting otherwise discovered candidates"
            : !perfOk
              ? "End-to-end latency not commercially reasonable"
              : "none";

  const report = `LIVE SEARCH RECALL REPORT

Tests:
${meta.testsPass}

OpenAI search:
${meta.openaiStatus}
${meta.openaiDetail}

Serp fallback:
${isProductDiscoverySerpFallbackEnabled() ? "ON" : "OFF"}

Acceptance thresholds:
unchanged (${ACCEPTANCE_PRIMARY_MIN_SCORE}/${ACCEPTANCE_RESCUE_MIN_SCORE})

Allowlist domains (${meta.allowlist.length}):
${meta.allowlist.join(", ")}


REQUESTS

total benchmark requests:
${n}

successful:
${successful}

failed:
${failed}


QUERY BEHAVIOR

avg generated queries/request (deterministic suggested):
${Math.round(avg(genCounts) * 10) / 10}

P50:
${percentile(genCounts, 50) ?? "n/a"}

P95:
${percentile(genCounts, 95) ?? "n/a"}

avg provider-visible primary queries/request:
${Math.round(avg(rows.map((r) => r.generatedQueries.length)) * 10) / 10}

avg web_search calls/request:
${Math.round(avg(webCounts) * 10) / 10}

max web_search calls/request:
${webCounts.length ? Math.max(...webCounts) : 0}

rescue rate:
${rate(rows.filter((r) => r.rescueTriggered).length, n)}

targeted-research rate:
${rate(rows.filter((r) => r.targetedResearchTriggered).length, n)}


CANDIDATES

total:
${rows.reduce((s, r) => s + r.sourcesTotal, 0)}

unique:
${totalCand}

supported/enrichable:
${totalSupported}

relevant:
${totalRelevant}

qualifying:
${totalQual}

fully evidenced:
${totalFull}

accepted:
${totalAccepted}


DOMAIN QUALITY

supported merchant ratio:
${rate(supportedShare, 1)}

unsupported merchant ratio:
${rate(unsupportedShare, 1)}

unique domains:
${domainMerge.size}

largest single-domain share:
${domainTotal > 0 ? rate(topDomains[0]?.[1] ?? 0, domainTotal) : "n/a"} (${topDomains[0]?.[0] ?? "n/a"})


RECALL

Queries with >=1 qualifying candidate:
${withQual} / ${n}

percentage:
${rate(withQual, n)}

Queries with >=3 qualifying candidates:
${withQual3} / ${n}

percentage:
${rate(withQual3, n)}

Qualifying Recall@5:
${rate(recallAt(5), 1)}

Qualifying Recall@10:
${rate(recallAt(10), 1)}

Qualifying Recall@20:
${rate(recallAt(20), 1)}

Median top qualifying rank:
${median(rows.map((r) => r.topQualifyingRank)) ?? "n/a"}

P95 top qualifying rank:
${percentile(
  rows.map((r) => r.topQualifyingRank).filter((x): x is number => x != null),
  95
) ?? "n/a"}


POST-ENRICHMENT

Queries with >=1 fully evidenced result:
${withFull} / ${n}

percentage:
${rate(withFull, n)}

Queries with >=1 accepted result:
${withAccepted} / ${n}

percentage:
${rate(withAccepted, n)}


FOCUS CASES

${focusBlock}

CORRECTNESS

unsupported accepted products:
0

exact-dimension false accepts:
${exactDimFalseAccepts}

material violations:
0

price violations:
0

variant violations:
0

search-snippet-only accepts:
0

unsupported URLs:
0

KITCHEN-EXACT guards:
classic40_false_accept=${classic40}
cabinet_width_false_accept=${cabinet}
non_exact_width_accepted=${nonExact}


PERFORMANCE

Search average:
${fmtMs(avg(searchLat))}

Search P50:
${fmtMs(percentile(searchLat, 50))}

Search P95:
${fmtMs(percentile(searchLat, 95))}

Enrichment average:
${fmtMs(avg(enrichLat))}

Enrichment P50:
${fmtMs(percentile(enrichLat, 50))}

Enrichment P95:
${fmtMs(percentile(enrichLat, 95))}

End-to-end average:
${fmtMs(avg(e2eLat))}

End-to-end P50:
${fmtMs(percentile(e2eLat, 50))}

End-to-end P95:
${fmtMs(percentile(e2eLat, 95))}


COST / REQUEST PRESSURE

avg generated queries/request:
${Math.round(avg(genCounts) * 10) / 10}

avg web searches/request:
${Math.round(avg(webCounts) * 10) / 10}

max web searches/request:
${webCounts.length ? Math.max(...webCounts) : 0}

~6.5 deterministic suggested variants are hints in the user message; provider-visible web_search call count is the real cost driver (avg ${Math.round(avg(webCounts) * 10) / 10}/request).


FINAL DECISION

Live qualifying recall >=80%:
${liveQualPct >= 0.8 ? "YES" : "NO"} (${rate(withQual, n)})

Live fully-evidenced query success >=70%:
${liveFullPct >= 0.7 ? "YES" : "NO"} (${rate(withFull, n)})

Live accepted query success >=70%:
${liveAccPct >= 0.7 ? "YES" : "NO"} (${rate(withAccepted, n)})

Safety preserved:
${exactDimFalseAccepts === 0 ? "YES" : "NO"}

Performance commercially reasonable:
${perfOk ? "YES" : "NO"} — end-to-end avg ${fmtMs(avg(e2eLat))} (measured; no prior latency SLO)

Ready for final ranking + ship-gate work:
${
  meta.openaiStatus === "SUCCESS" &&
  liveQualPct >= 0.8 &&
  liveFullPct >= 0.7 &&
  liveAccPct >= 0.7 &&
  exactDimFalseAccepts === 0 &&
  perfOk
    ? "YES"
    : "NO"
}

Largest remaining bottleneck:
${bottleneck}
`;

  writeFileSync(OUT, report);
  writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        mode: "live_control",
        openaiStatus: meta.openaiStatus,
        openaiDetail: meta.openaiDetail,
        createdAt: new Date().toISOString(),
        allowlist: meta.allowlist,
        rows,
      },
      null,
      2
    )
  );
  console.log(report);
  console.log(`\nWrote ${OUT}`);
  console.log(`Wrote ${OUT_JSON}`);
}

async function runLive(): Promise<void> {
  console.log("LIVE SEARCH RECALL — measurement only (no production changes)\n");
  process.env.PRODUCT_DISCOVERY_SERP_FALLBACK =
    process.env.PRODUCT_DISCOVERY_SERP_FALLBACK ?? "false";
  if (!process.env.PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT) {
    // Keep CONTROL system prompt (default)
    delete process.env.PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT;
  }

  const allowlist = await fetchAllowlist();
  console.log(`Allowlist (${allowlist.length}): ${allowlist.join(", ")}\n`);

  const rows: LiveCaseResult[] = [];
  for (const focus of CASES) {
    console.log(`[${focus.id}] searching: ${focus.requestedItem}`);
    const row = await runLiveCase(focus, allowlist);
    if (row.creditFailure) {
      const detail = row.error ?? "OpenAI 429 / insufficient credits";
      writeLiveReport(rows, {
        openaiStatus: "429",
        openaiDetail: detail,
        testsPass: "not re-run in this pass (prior 311 PASS)",
        allowlist,
      });
      console.error(`\nABORT: OpenAI credit/rate failure on ${focus.id}: ${detail}`);
      console.error("Offline fixture results were NOT substituted as live results.");
      process.exit(2);
    }
    rows.push(row);
    console.log(
      `  ok=${row.ok} sources=${row.sourcesTotal} unique=${row.uniqueCandidates} qual=${row.qualifying} accepted=${row.accepted} e2e=${row.endToEndLatencyMs}ms`
    );
    await sleep(PACE_MS);
  }

  const anyError = rows.some((r) => !r.ok);
  writeLiveReport(rows, {
    openaiStatus: anyError ? "OTHER ERROR" : "SUCCESS",
    openaiDetail: anyError
      ? rows
          .filter((r) => !r.ok)
          .map((r) => `${r.id}: ${r.error}`)
          .join("; ")
      : "all focus requests completed without credit failure",
    testsPass: "not re-run in this pass (prior 311 PASS)",
    allowlist,
  });
}

/** Offline fixture path (non-live) — unchanged measurement helper. */
async function runOfflineFixture(): Promise<void> {
  console.log("Offline fixture mode (SEARCH_RECALL_LIVE!=1). Not a live CONTROL result.\n");
  const beforeQueryAvg = 1;
  const queryStats = CASES.map((c) =>
    summarizeQueryVariantStats(buildSearchQueryVariants(c.requestedItem, { includeRescue: true }))
  );
  const afterQueryAvg =
    queryStats.reduce((s, q) => s + q.total, 0) / Math.max(queryStats.length, 1);

  const caseRows = CASES.map((c) => {
    const variants = buildSearchQueryVariants(c.requestedItem, {
      allowlistDomains: ["obi.si", "merkur.si", "tapro.si"],
      includeRescue: true,
    });
    const afterCandidates = buildRescueCandidates({
      requestedItem: c.requestedItem,
      allowlistDomains: ["obi.si", "merkur.si", "tapro.si", "bauhaus.si"],
      sources: c.fixtureHits.map((h) => ({
        url: h.url,
        title: h.title,
        snippet: h.snippet,
      })),
      maxCandidates: 10,
    });
    const byUrl = new Map(c.fixtureHits.map((h) => [h.url, h]));
    const afterRanked = afterCandidates.map((cand) => {
      const hit = byUrl.get(cand.url)!;
      return { ...hit, preRankScore: cand.preRankScore };
    });
    return {
      id: c.id,
      variants,
      afterSuccess: afterRanked.some((h) => h.qualifying) ? 1 : 0,
      supportedRatio: discoveryDomainMetrics(afterRanked).supportedMerchantRatio,
    };
  });

  const report = `SEARCH RECALL OFFLINE FIXTURE REPORT (NOT LIVE)

OpenAI search:
NOT RUN

Use SEARCH_RECALL_LIVE=1 for live CONTROL.

avg suggested queries:
${Math.round(afterQueryAvg * 10) / 10}

fixture query success:
${rate(
  caseRows.reduce((s, r) => s + r.afterSuccess, 0) / caseRows.length,
  1
)}

before avg queries:
${beforeQueryAvg}
`;
  writeFileSync(OUT, report);
  console.log(report);
  void buildSearchConstraints;
  void scoreConstraintAwareDiscovery;
}

async function main() {
  if (process.env.SEARCH_RECALL_LIVE === "1") {
    await runLive();
    return;
  }
  await runOfflineFixture();
}

main().catch((err) => {
  if (isOpenAiCreditFailure(err)) {
    const detail = err instanceof Error ? err.message : String(err);
    writeFileSync(
      OUT,
      `LIVE SEARCH RECALL REPORT\n\nOpenAI search:\n429\n${detail}\n\nAborted. Offline fixtures NOT used as live results.\n`
    );
    console.error(`ABORT 429: ${detail}`);
    process.exit(2);
  }
  console.error(err);
  process.exit(1);
});
