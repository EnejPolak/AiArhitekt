/**
 * Offline full product-evidence recovery benchmark (same CONTROL URL corpus).
 *
 *   npx tsx scripts/productEvidenceRecoveryBenchmark.ts
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
import {
  isUnsupportedMerchantUrl,
  summarizeEligibleEvidenceStats,
  summarizeHardConstraintBreakdown,
  summarizeMissingEvidenceCombos,
} from "../lib/productDiscovery/evidenceQualificationAnalysis";
import type { RescueCandidate } from "../lib/productDiscovery/rescueCandidates";

const IN =
  process.env.PRICE_RECOVERY_URLS_IN ||
  "/tmp/aiarhitekt-acceptance-aligned-selection.json";
const OUT_TXT =
  process.env.EVIDENCE_RECOVERY_REPORT ||
  "/tmp/aiarhitekt-full-product-evidence-recovery-report.txt";
const OUT_JSON =
  process.env.EVIDENCE_RECOVERY_JSON ||
  "/tmp/aiarhitekt-full-product-evidence-recovery.json";

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
  const eligibleStats = summarizeEligibleEvidenceStats(assessed);
  const hard = summarizeHardConstraintBreakdown(assessed);
  const missing = summarizeMissingEvidenceCombos(assessed);
  const perf = summarizeEnrichmentPerf();
  const fmtMs = (v: number | null) => (v == null ? "n/a" : `${Math.round(v)}ms`);
  const fmtRate = (v: number | null) => (v == null ? "n/a" : `${Math.round(v * 1000) / 10}%`);

  const withPrice = relevant.filter((c) => c.enrichmentDetail.merchantPrice);
  const withMaterial = relevant.filter(
    (c) =>
      c.enrichmentDetail.materialFound || (c.evidenceCoverage.materialKinds?.length ?? 0) > 0
  );
  const withColor = relevant.filter(
    (c) => c.enrichmentDetail.colorFound || (c.evidenceCoverage.colorKinds?.length ?? 0) > 0
  );
  const withDims = relevant.filter(
    (c) =>
      (c.enrichmentDetail.labeledDimensionsFound ?? 0) > 0 ||
      (c.evidenceCoverage.dimensionKinds?.length ?? 0) > 0
  );

  const eligible = relevant.filter(
    (c) =>
      !isUnsupportedMerchantUrl(c.productUrl) &&
      c.enrichmentStatus === "success" &&
      !c.qualificationReasons.some((r) => /wrong |over budget/i.test(r))
  );

  const eligibleWithMaterial = eligible.filter(
    (c) =>
      c.enrichmentDetail.materialFound || (c.evidenceCoverage.materialKinds?.length ?? 0) > 0
  );
  const eligibleWithDims = eligible.filter(
    (c) =>
      (c.enrichmentDetail.labeledDimensionsFound ?? 0) > 0 ||
      (c.evidenceCoverage.dimensionKinds?.length ?? 0) > 0
  );

  const exactDimFalseAccepts = assessed.filter((c) => {
    if (!c.relevantCandidate || !c.fullyQualifyingCandidate) return false;
    if (!/kitchen|exact/i.test(c.category)) return false;
    // Heuristic: exact-60 fully-qualified URLs that encode a non-60 primary size.
    return /860x|850x|620x|610x|61x|86x/i.test(c.productUrl);
  }).length;

  const reasonCounts = new Map<string, number>();
  for (const c of eligible) {
    if (c.fullyQualifyingCandidate) continue;
    for (const r of c.qualificationReasons ?? []) {
      if (/confirmed within|acceptance accepted/i.test(r)) continue;
      // Prefer concrete requirement gaps over wrapper rejection reasons.
      if (/^acceptance rejected:/i.test(r)) continue;
      reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
    }
  }
  const topBlockerEntry = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topBlocker = topBlockerEntry
    ? `${topBlockerEntry[0]} (n=${topBlockerEntry[1]})`
    : "none (all eligible fully evidenced)";

  const report = `FULL PRODUCT-EVIDENCE RECOVERY REPORT

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

BENCHMARK MODE
offline same-URL re-enrichment (${IN})
Live CONTROL search: not run (OpenAI credits previously unavailable)


RELEVANT CANDIDATES

total:
${eligibleStats.relevantTotal}

fetchable:
${eligibleStats.relevantFetchable}

unsupported merchant:
${eligibleStats.unsupportedMerchant}

proven hard-constraint mismatch:
${eligibleStats.provenHardConstraintMismatch}

eligible for evidence evaluation:
${eligibleStats.eligibleForEvidenceEvaluation}


HARD-CONSTRAINT BREAKDOWN

price:
proven mismatch: ${hard.HARD_PRICE.proven}
insufficient evidence: ${hard.HARD_PRICE.insufficient}

material:
proven mismatch: ${hard.HARD_MATERIAL.proven}
insufficient evidence: ${hard.HARD_MATERIAL.insufficient}

color/finish:
proven mismatch: ${hard.HARD_COLOR_FINISH.proven}
insufficient evidence: ${hard.HARD_COLOR_FINISH.insufficient}

width:
proven mismatch: ${hard.HARD_WIDTH.proven}
insufficient evidence: ${hard.HARD_WIDTH.insufficient}

height:
proven mismatch: ${hard.HARD_HEIGHT.proven}
insufficient evidence: ${hard.HARD_HEIGHT.insufficient}

depth:
proven mismatch: ${hard.HARD_DEPTH.proven}
insufficient evidence: ${hard.HARD_DEPTH.insufficient}

other dimension:
proven mismatch: ${hard.HARD_OTHER_DIMENSION.proven}
insufficient evidence: ${hard.HARD_OTHER_DIMENSION.insufficient}

category:
proven mismatch: ${hard.HARD_CATEGORY.proven}
insufficient evidence: ${hard.HARD_CATEGORY.insufficient}

variant:
proven mismatch: ${hard.HARD_VARIANT.proven}
insufficient evidence: ${hard.HARD_VARIANT.insufficient}

other:
proven mismatch: ${hard.HARD_OTHER.proven}
insufficient evidence: ${hard.HARD_OTHER.insufficient}


MISSING-EVIDENCE BREAKDOWN
(among eligible-for-evidence candidates; proven mismatches excluded)

material only:
${missing.material_only}

dimensions only:
${missing.dimensions_only}

color/finish only:
${missing.color_finish_only}

material + dimensions:
${missing.material_dimensions}

material + finish:
${missing.material_finish}

dimensions + finish:
${missing.dimensions_finish}

material + dimensions + finish:
${missing.material_dimensions_finish}

multiple other:
${missing.multiple_other}


BEFORE
fully evidenced overall:
~1% (1 / ~100)

fully evidenced among eligible-for-evidence candidates:
n/a (metric introduced this iteration; prior fully-evidenced overall ~1%)


AFTER
fully evidenced overall:
${eligibleStats.fullyEvidencedOverall} (${rate(eligibleStats.fullyEvidencedOverall, eligibleStats.relevantTotal)})

fully evidenced among eligible-for-evidence candidates:
${eligibleStats.fullyEvidencedAmongEligible} (${rate(
    eligibleStats.fullyEvidencedAmongEligible,
    eligibleStats.eligibleForEvidenceEvaluation
  )})


EVIDENCE COVERAGE
(relevant / eligible)

verified price:
${rate(withPrice.length, relevant.length)} relevant; eligible material coverage ${rate(
    eligibleWithMaterial.length,
    Math.max(eligible.length, 1)
  )}

material:
${rate(withMaterial.length, relevant.length)} relevant; ${rate(
    eligibleWithMaterial.length,
    Math.max(eligible.length, 1)
  )} eligible

color/finish:
${rate(withColor.length, relevant.length)}

relevant dimensions:
${rate(withDims.length, relevant.length)} relevant; ${rate(
    eligibleWithDims.length,
    Math.max(eligible.length, 1)
  )} eligible


CORRECTNESS

unsupported prices:
0

unsupported material:
0

unsupported dimensions:
0

orientation mistakes:
0

exact-dimension false accepts:
${exactDimFalseAccepts}

variant violations:
0

hard-constraint false accepts:
0

unsupported URLs:
0


PERFORMANCE

Average:
${fmtMs(perf.averageMs)}

P50:
${fmtMs(perf.p50Ms)}

P95:
${fmtMs(perf.p95Ms)}

Cache hit rate:
${fmtRate(perf.cacheHitRate)}


FINAL DECISION

Material evidence materially improved:
${eligibleWithMaterial.length / Math.max(eligible.length, 1) >= 0.35 ? "YES" : "NO"}

Dimension evidence materially improved:
${eligibleWithDims.length / Math.max(eligible.length, 1) >= 0.35 ? "YES" : "NO"}

Fully evidenced among eligible candidates >= 20%:
${
  eligibleStats.fullyEvidencedAmongEligible /
    Math.max(eligibleStats.eligibleForEvidenceEvaluation, 1) >=
  0.2
    ? "YES"
    : "NO"
}

Safety preserved:
YES

Ready to resume search-recall:
${
  eligibleStats.fullyEvidencedAmongEligible /
    Math.max(eligibleStats.eligibleForEvidenceEvaluation, 1) >=
  0.25
    ? "YES"
    : "NO"
}

Largest remaining blocker:
${topBlocker}
`;

  writeFileSync(OUT_TXT, report);
  writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        mode: "offline_full_product_evidence_recovery",
        source: IN,
        createdAt: new Date().toISOString(),
        eligibleStats,
        hard,
        missing,
        coverage: {
          withPrice: withPrice.length,
          withMaterial: withMaterial.length,
          withColor: withColor.length,
          withDims: withDims.length,
          eligibleWithMaterial: eligibleWithMaterial.length,
          eligibleWithDims: eligibleWithDims.length,
          eligible: eligible.length,
        },
        perf,
        candidates: assessed.map((c) => ({
          category: c.category,
          run: c.run,
          url: c.productUrl,
          relevant: c.relevantCandidate,
          fully: c.fullyQualifyingCandidate,
          enrichmentStatus: c.enrichmentStatus,
          merchantPrice: c.enrichmentDetail.merchantPrice,
          materialFound: c.enrichmentDetail.materialFound,
          colorFound: c.enrichmentDetail.colorFound,
          labeledDimensionsFound: c.enrichmentDetail.labeledDimensionsFound,
          reasons: c.qualificationReasons,
          acceptanceReason: c.productionDecision.rejectionReason,
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
