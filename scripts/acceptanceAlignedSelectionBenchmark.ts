/**
 * Acceptance-aligned selection benchmark (dev-only).
 * CONTROL primary hardcoded. No production wiring / no selector integration.
 *
 *   npx tsx --env-file=.env scripts/acceptanceAlignedSelectionBenchmark.ts
 */
import { writeFileSync } from "node:fs";
import {
  isRadiatorPageCandidate,
  isVasePageCandidate,
} from "../lib/productDiscovery/selectionBenchmarkGroundTruth";
import {
  evaluateIsolatedSelectionAcceptance,
  prepareEnrichedCandidates,
  runControlPrimaryPass,
  runIsolatedSelector,
} from "../lib/productDiscovery/selectionStability";
import type { RescueCandidate } from "../lib/productDiscovery/rescueCandidates";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PACE_MS = Number(process.env.BENCHMARK_PACE_MS ?? 3000);
const RUNS = Number(process.env.FOCUS_RUNS ?? 5);

const FOCUS = [
  { category: "bathroom-towel", item: "chrome heated towel rail width 60cm max 150 EUR" },
  { category: "accessory", item: "ceramic vase white height 30cm max 40 EUR" },
  { category: "lighting", item: "black metal pendant lamp approx 40cm max 120 EUR" },
  { category: "kitchen-exact", item: "exactly 60cm wide kitchen sink stainless steel max 200 EUR" },
] as const;

type FrozenSelectionCase = {
  category: string;
  requestedItem: string;
  run: number;
  originalPrimaryStatus: "found" | "not_found" | "error";
  primaryProductName: string | null;
  primaryProductUrl: string | null;
  primarySearchQueries: string[];
  primarySourceCount: number;
  candidates: Array<{
    candidateId: string;
    url: string;
    domain: string;
    sourceTitle: string | null;
    sourceEvidence: string | null;
    enrichment: RescueCandidate["enrichment"];
  }>;
  groundTruth: {
    qualifyingCandidateIds: string[];
    nonQualifyingCandidateIds: string[];
    qualificationReasons: Record<string, string[]>;
  };
  diagnostics: {
    anyRadiatorPage: boolean;
    anyVasePage: boolean;
    qualifyingCount: number;
  };
};

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

async function main() {
  console.log("ACCEPTANCE-ALIGNED SELECTION BENCHMARK");
  console.log("Primary prompt: CONTROL (hardcoded)");
  console.log("Production wiring: unchanged\n");

  const allowlist = await fetchAllowlist();
  console.log(`Allowlist (${allowlist.length}): ${allowlist.join(", ")}\n`);

  const frozenCases: FrozenSelectionCase[] = [];
  const selectionRows: any[] = [];

  for (const entry of FOCUS) {
    for (let i = 1; i <= RUNS; i++) {
      let primary = await runControlPrimaryPass({
        requestedItem: entry.item,
        allowlistDomains: allowlist,
      });
      if (primary.primaryDecision === "error") {
        console.log(`[${entry.category}] run ${i}/${RUNS} ERROR — retrying once...`);
        await sleep(PACE_MS);
        primary = await runControlPrimaryPass({
          requestedItem: entry.item,
          allowlistDomains: allowlist,
        });
      }

      const { candidates, qualifying } = await prepareEnrichedCandidates({
        sources: primary.sources,
        allowlistDomains: allowlist,
        requestedItem: entry.item,
      });

      const qualifyingIds = qualifying.filter((q) => q.qualifies).map((q) => q.candidateId);
      const nonQualifyingIds = qualifying.filter((q) => !q.qualifies).map((q) => q.candidateId);
      const qualificationReasons: Record<string, string[]> = {};
      for (const q of qualifying) qualificationReasons[q.candidateId] = q.reasons;

      const frozen: FrozenSelectionCase = {
        category: entry.category,
        requestedItem: entry.item,
        run: i,
        originalPrimaryStatus: primary.primaryDecision,
        primaryProductName: primary.product?.name ?? null,
        primaryProductUrl: primary.product?.productUrl ?? null,
        primarySearchQueries: primary.primarySearchQueries,
        primarySourceCount: primary.primarySourceCount,
        candidates: candidates.map((c) => ({
          candidateId: c.id,
          url: c.url,
          domain: c.domain,
          sourceTitle: c.sourceTitle,
          sourceEvidence: c.sourceEvidence,
          enrichment: c.enrichment,
        })),
        groundTruth: {
          qualifyingCandidateIds: qualifyingIds,
          nonQualifyingCandidateIds: nonQualifyingIds,
          qualificationReasons,
        },
        diagnostics: {
          anyRadiatorPage: candidates.some((c) => isRadiatorPageCandidate(c)),
          anyVasePage: candidates.some((c) => isVasePageCandidate(c)),
          qualifyingCount: qualifyingIds.length,
        },
      };
      frozenCases.push(frozen);

      const hasQualifying = qualifyingIds.length > 0;
      let isolated: Awaited<ReturnType<typeof runIsolatedSelector>> | null = null;
      let acceptance: ReturnType<typeof evaluateIsolatedSelectionAcceptance> | null = null;

      // Selection benchmark only on source-present cases (qualifying exists).
      // Also run isolated when qualifying exists for found primaries (compare decisions).
      if (hasQualifying) {
        isolated = await runIsolatedSelector({
          requestedItem: entry.item,
          candidates,
        });
        if (isolated.status === "selected" && isolated.product) {
          acceptance = evaluateIsolatedSelectionAcceptance({
            requestedItem: entry.item,
            product: isolated.product,
            evidenceText: isolated.evidenceText,
          });
        }

        const currentSelected =
          primary.primaryDecision === "found" &&
          !!primary.product?.productUrl &&
          qualifying.some((q) => q.qualifies && urlsMatch(primary.product!.productUrl, q.url));
        const currentNone = !currentSelected;
        // Primary found a non-qualifying URL while qualifying exists → wrong
        const currentWrong =
          primary.primaryDecision === "found" &&
          !!primary.product?.productUrl &&
          !currentSelected &&
          hasQualifying;

        const isolatedSelected =
          isolated.status === "selected" &&
          !!isolated.candidateId &&
          qualifyingIds.includes(isolated.candidateId);
        const isolatedNone = isolated.status !== "selected";
        const isolatedWrong =
          isolated.status === "selected" &&
          !!isolated.candidateId &&
          !qualifyingIds.includes(isolated.candidateId);

        selectionRows.push({
          category: entry.category,
          run: i,
          primaryStatus: primary.primaryDecision,
          qualifyingCount: qualifyingIds.length,
          currentSelected,
          currentNone,
          currentWrong,
          currentCorrect: currentSelected,
          isolatedSelected,
          isolatedNone,
          isolatedWrong,
          isolatedCorrect: isolatedSelected,
          isolatedCandidateId: isolated.candidateId,
          isolatedChoseQualifying: isolatedSelected,
          acceptanceAccepted: acceptance?.accepted ?? null,
          acceptanceReason: acceptance?.reason ?? null,
          topQualifying: qualifying
            .filter((q) => q.qualifies)
            .slice(0, 2)
            .map((q) => ({ id: q.candidateId, name: q.name, price: q.price, reasons: q.reasons })),
        });
      }

      console.log(
        `[${entry.category}] ${i}/${RUNS} primary=${primary.primaryDecision} sources=${primary.primarySourceCount} radiatorPage=${frozen.diagnostics.anyRadiatorPage} vasePage=${frozen.diagnostics.anyVasePage} qualifying=${qualifyingIds.length} isolated=${isolated?.status ?? "n/a"}`
      );
      if (qualifyingIds[0]) {
        const q = qualifying.find((x) => x.candidateId === qualifyingIds[0])!;
        console.log(`  topQualifying: ${q.name} @ ${q.price}`);
        console.log(`  reasons: ${q.reasons.slice(0, 4).join(" | ")}`);
      }
      await sleep(PACE_MS);
    }
  }

  // Aggregations
  function catRows(cat: string) {
    return frozenCases.filter((c) => c.category === cat);
  }
  function summarizeCategory(cat: string) {
    const rows = catRows(cat);
    const primaryFound = rows.filter((r) => r.originalPrimaryStatus === "found").length;
    const primaryNotFound = rows.filter((r) => r.originalPrimaryStatus === "not_found").length;
    const nf = rows.filter((r) => r.originalPrimaryStatus === "not_found");
    const sourcePresentMisses = nf.filter((r) => r.groundTruth.qualifyingCandidateIds.length > 0).length;
    const searchMisses = nf.filter((r) => r.groundTruth.qualifyingCandidateIds.length === 0).length;
    return {
      runs: rows.length,
      primaryFound,
      primaryNotFound,
      anyRadiatorPage: rows.filter((r) => r.diagnostics.anyRadiatorPage).length,
      anyVasePage: rows.filter((r) => r.diagnostics.anyVasePage).length,
      runsWithQualifying: rows.filter((r) => r.groundTruth.qualifyingCandidateIds.length > 0).length,
      trueSourcePresentMisses: sourcePresentMisses,
      trueSearchMisses: searchMisses,
    };
  }

  const sourcePresent = selectionRows;
  const currentCorrect = sourcePresent.filter((r) => r.currentCorrect).length;
  const currentFalseNone = sourcePresent.filter((r) => r.currentNone).length;
  const currentWrong = sourcePresent.filter((r) => r.currentWrong).length;
  const currentNonNone = sourcePresent.filter((r) => r.currentSelected).length;

  const isolatedCorrect = sourcePresent.filter((r) => r.isolatedCorrect).length;
  const isolatedFalseNone = sourcePresent.filter((r) => r.isolatedNone).length;
  const isolatedWrong = sourcePresent.filter((r) => r.isolatedWrong).length;
  const isolatedNonNone = sourcePresent.filter((r) => !r.isolatedNone).length;

  const gtQualifyingSelections = sourcePresent.filter((r) => r.isolatedChoseQualifying);
  const acceptedAfter = gtQualifyingSelections.filter((r) => r.acceptanceAccepted === true);
  const rejectedAfter = gtQualifyingSelections.filter((r) => r.acceptanceAccepted === false);

  const allQualified = frozenCases.reduce(
    (n, c) => n + c.groundTruth.qualifyingCandidateIds.length,
    0
  );

  const bathroom = summarizeCategory("bathroom-towel");
  const accessory = summarizeCategory("accessory");
  const lighting = summarizeCategory("lighting");
  const kitchen = summarizeCategory("kitchen-exact");

  const searchMiss =
    bathroom.trueSearchMisses +
    accessory.trueSearchMisses +
    lighting.trueSearchMisses +
    kitchen.trueSearchMisses;
  const modelSelectionMiss =
    bathroom.trueSourcePresentMisses +
    accessory.trueSourcePresentMisses +
    lighting.trueSourcePresentMisses +
    kitchen.trueSourcePresentMisses;
  const acceptanceEvidenceMiss = rejectedAfter.length;

  const summary = {
    frozenRuns: frozenCases.length,
    candidatesPolicyQualified: allQualified,
    byCategory: { bathroom, accessory, lighting, kitchen },
    sourcePresentCases: sourcePresent.length,
    current: {
      correct: currentCorrect,
      falseNone: currentFalseNone,
      wrong: currentWrong,
      precision: rate(currentCorrect, currentNonNone),
      recall: rate(currentCorrect, sourcePresent.length),
    },
    isolated: {
      correct: isolatedCorrect,
      falseNone: isolatedFalseNone,
      wrong: isolatedWrong,
      precision: rate(isolatedCorrect, isolatedNonNone),
      recall: rate(isolatedCorrect, sourcePresent.length),
    },
    acceptanceAfterIsolated: {
      groundTruthQualifyingSelections: gtQualifyingSelections.length,
      accepted: acceptedAfter.length,
      rejected: rejectedAfter.length,
      rejectedReasons: [...new Set(rejectedAfter.map((r) => r.acceptanceReason).filter(Boolean))],
    },
    rootCause: {
      SEARCH_MISS: searchMiss,
      MODEL_SELECTION_MISS: modelSelectionMiss,
      ACCEPTANCE_EVIDENCE_MISS: acceptanceEvidenceMiss,
    },
  };

  writeFileSync(
    "/tmp/aiarhitekt-acceptance-aligned-selection.json",
    JSON.stringify({ ranAt: new Date().toISOString(), summary, frozenCases, selectionRows }, null, 2)
  );
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("Wrote /tmp/aiarhitekt-acceptance-aligned-selection.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
