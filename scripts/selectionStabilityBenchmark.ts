/**
 * Source-backed selection stability experiment (dev-only).
 * CONTROL primary prompt hardcoded. No production wiring.
 *
 *   npx tsx --env-file=.env scripts/selectionStabilityBenchmark.ts
 */
import { writeFileSync } from "node:fs";
import {
  evaluateIsolatedSelectionAcceptance,
  prepareEnrichedCandidates,
  runControlPrimaryPass,
  runIsolatedSelector,
} from "../lib/productDiscovery/selectionStability";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PACE_MS = Number(process.env.BENCHMARK_PACE_MS ?? 3000);
const RUNS = Number(process.env.FOCUS_RUNS ?? 5);

const FOCUS = [
  { category: "bathroom-towel", item: "chrome heated towel rail width 60cm max 150 EUR" },
  { category: "accessory", item: "ceramic vase white height 30cm max 40 EUR" },
  { category: "lighting", item: "black metal pendant lamp approx 40cm max 120 EUR" },
  { category: "kitchen-exact", item: "exactly 60cm wide kitchen sink stainless steel max 200 EUR" },
] as const;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeUrl(url: string): string {
  try {
    const x = new URL(url);
    return `${x.hostname.replace(/^www\./i, "")}${x.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
}

function urlsMatch(a: string, b: string): boolean {
  const pa = normalizeUrl(a);
  const pb = normalizeUrl(b);
  return pa === pb || pa.startsWith(`${pb}/`) || pb.startsWith(`${pa}/`);
}

function urlInSources(productUrl: string | null | undefined, sources: Array<{ url: string }>): boolean {
  if (!productUrl) return false;
  return sources.some((s) => urlsMatch(productUrl, s.url));
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

async function main() {
  console.log("SELECTION STABILITY EXPERIMENT");
  console.log("Primary prompt: CONTROL (hardcoded)");
  console.log("Serp fallback: not used");
  console.log("Production wiring: unchanged\n");

  const allowlist = await fetchAllowlist();
  console.log(`Allowlist (${allowlist.length}): ${allowlist.join(", ")}\n`);

  const byCategory: Record<string, any[]> = {};
  const frozenCases: any[] = [];

  for (const entry of FOCUS) {
    const runs: any[] = [];
    for (let i = 1; i <= RUNS; i++) {
      process.stdout.write(`[${entry.category}] primary run ${i}/${RUNS}...\n`);
      const primary = await runControlPrimaryPass({
        requestedItem: entry.item,
        allowlistDomains: allowlist,
      });

      const { candidates, qualifying } = await prepareEnrichedCandidates({
        sources: primary.sources,
        allowlistDomains: allowlist,
        requestedItem: entry.item,
      });
      const qualifyingList = qualifying.filter((q) => q.qualifies);
      const hasValidInSources = qualifyingList.length > 0;

      let isolated: Awaited<ReturnType<typeof runIsolatedSelector>> | null = null;
      let isolatedAccepted = false;
      let isolatedCorrect = false;
      let currentCorrect = false;
      const currentSelected = primary.primaryDecision === "found" && !!primary.product;

      if (hasValidInSources) {
        isolated = await runIsolatedSelector({
          requestedItem: entry.item,
          candidates,
        });
        if (isolated.status === "selected" && isolated.product) {
          const acc = evaluateIsolatedSelectionAcceptance({
            requestedItem: entry.item,
            product: isolated.product,
            evidenceText: isolated.evidenceText,
          });
          isolatedAccepted = acc.accepted;
          isolatedCorrect =
            qualifyingList.some((q) => q.candidateId === isolated!.candidateId) || acc.accepted;
        }

        if (currentSelected && primary.product) {
          currentCorrect =
            qualifyingList.some((q) => urlsMatch(primary.product!.productUrl, q.url)) ||
            urlInSources(primary.product.productUrl, primary.sources);
        }

        frozenCases.push({
          category: entry.category,
          item: entry.item,
          run: i,
          primaryDecision: primary.primaryDecision,
          hasValidInSources: true,
          qualifyingCount: qualifyingList.length,
          qualifyingSample: qualifyingList.slice(0, 3),
          currentSelected,
          currentCorrect,
          isolatedStatus: isolated?.status ?? "none",
          isolatedCandidateId: isolated?.candidateId ?? null,
          isolatedProductName: isolated?.product?.name ?? null,
          isolatedAccepted,
          isolatedCorrect,
          primaryProductName: primary.product?.name ?? null,
          primaryQueries: primary.primarySearchQueries,
          primarySourceCount: primary.primarySourceCount,
          domains: primary.primaryDistinctSourceDomains,
        });
      }

      const row = {
        category: entry.category,
        run: i,
        primaryDecision: primary.primaryDecision,
        primarySourceCount: primary.primarySourceCount,
        queries: primary.primarySearchQueries,
        domains: primary.primaryDistinctSourceDomains,
        hasValidInSources,
        qualifyingCount: qualifyingList.length,
        qualifying: qualifyingList.slice(0, 5),
        currentSelected,
        currentCorrect: hasValidInSources ? currentCorrect : null,
        isolatedStatus: isolated?.status ?? null,
        isolatedCorrect: hasValidInSources ? isolatedCorrect : null,
        isolatedAccepted: hasValidInSources ? isolatedAccepted : null,
        elapsedMs: primary.elapsedMs,
        productName: primary.product?.name ?? null,
      };
      runs.push(row);
      console.log(
        `  primary=${primary.primaryDecision} sources=${primary.primarySourceCount} validInSources=${hasValidInSources} (${qualifyingList.length}) isolated=${isolated?.status ?? "n/a"}`
      );
      if (qualifyingList[0]) {
        console.log(
          `  topValid: ${qualifyingList[0].name} @ ${qualifyingList[0].price} (${qualifyingList[0].url})`
        );
      }
      if (i < RUNS) await sleep(PACE_MS);
    }
    byCategory[entry.category] = runs;
  }

  const bathroom = byCategory["bathroom-towel"] || [];
  const bathroomFound = bathroom.filter((r) => r.primaryDecision === "found").length;
  const bathroomNotFound = bathroom.filter((r) => r.primaryDecision === "not_found").length;
  const bathroomNfValid = bathroom.filter(
    (r) => r.primaryDecision === "not_found" && r.hasValidInSources
  ).length;
  const bathroomNfNoValid = bathroom.filter(
    (r) => r.primaryDecision === "not_found" && !r.hasValidInSources
  ).length;

  const frozen = frozenCases;
  const currentCorrectCount = frozen.filter((f) => f.currentSelected && f.currentCorrect).length;
  const currentFalseNone = frozen.filter((f) => !f.currentSelected).length;
  const isolatedCorrect = frozen.filter((f) => f.isolatedStatus === "selected" && f.isolatedCorrect);
  const isolatedAccepted = frozen.filter((f) => f.isolatedAccepted);
  const isolatedWrong = frozen.filter(
    (f) => f.isolatedStatus === "selected" && !f.isolatedCorrect
  );
  const isolatedFalseNone = frozen.filter((f) => f.isolatedStatus !== "selected");
  const isolatedSelected = frozen.filter((f) => f.isolatedStatus === "selected");
  const precision =
    isolatedSelected.length === 0
      ? null
      : Math.round((isolatedCorrect.length / isolatedSelected.length) * 1000) / 10;

  const summary = {
    bathroom: {
      runs: bathroom.length,
      primaryFound: bathroomFound,
      primaryNotFound: bathroomNotFound,
      notFoundWithValid: bathroomNfValid,
      notFoundWithoutValid: bathroomNfNoValid,
    },
    frozenSourceSets: frozen.length,
    currentCorrect: `${currentCorrectCount}/${frozen.length}`,
    isolatedCorrect: `${isolatedCorrect.length}/${frozen.length}`,
    currentFalseNone,
    isolatedFalseNone: isolatedFalseNone.length,
    isolatedWrong: isolatedWrong.length,
    isolatedAcceptedCount: isolatedAccepted.length,
    isolatedSelectedCount: isolatedSelected.length,
    selectionPrecision: precision,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([cat, rows]) => {
        const frozenCat = frozen.filter((f) => f.category === cat);
        return [
          cat,
          {
            runs: rows.length,
            primaryFound: rows.filter((r) => r.primaryDecision === "found").length,
            primaryNotFound: rows.filter((r) => r.primaryDecision === "not_found").length,
            notFoundWithValid: rows.filter(
              (r) => r.primaryDecision === "not_found" && r.hasValidInSources
            ).length,
            frozenSets: frozenCat.length,
            currentFalseNone: frozenCat.filter((f) => !f.currentSelected).length,
            isolatedFalseNone: frozenCat.filter((f) => f.isolatedStatus !== "selected").length,
            isolatedCorrect: frozenCat.filter((f) => f.isolatedCorrect).length,
            isolatedWrong: frozenCat.filter(
              (f) => f.isolatedStatus === "selected" && !f.isolatedCorrect
            ).length,
          },
        ];
      })
    ),
  };

  const out = { ranAt: new Date().toISOString(), summary, frozenCases, byCategory };
  writeFileSync("/tmp/aiarhitekt-selection-stability.json", JSON.stringify(out, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("Wrote /tmp/aiarhitekt-selection-stability.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
