#!/usr/bin/env node
/**
 * Source-backed selection stability experiment.
 * Uses CONTROL primary prompt only. Does NOT change production wiring.
 *
 * Usage:
 *   node --env-file=.env --import tsx /tmp/aiarhitekt-selection-stability.mjs
 *   # or:
 *   npx tsx --env-file=.env /tmp/aiarhitekt-selection-stability.ts
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(pathToFileURL("/Users/enejpolak/Projetki /AiArhitekt/package.json"));

// Resolve compiled-less TS via dynamic import of project files through tsx register.
async function loadModules() {
  const root = "/Users/enejpolak/Projetki /AiArhitekt";
  const mod = await import(`${root}/lib/productDiscovery/selectionStability.ts`);
  return mod;
}

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PACE_MS = Number(process.env.BENCHMARK_PACE_MS ?? 3000);
const RUNS = Number(process.env.FOCUS_RUNS ?? 5);

const FOCUS = [
  { category: "bathroom-towel", item: "chrome heated towel rail width 60cm max 150 EUR" },
  { category: "accessory", item: "ceramic vase white height 30cm max 40 EUR" },
  { category: "lighting", item: "black metal pendant lamp approx 40cm max 120 EUR" },
  { category: "kitchen-exact", item: "exactly 60cm wide kitchen sink stainless steel max 200 EUR" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAllowlist() {
  const geocode = await fetch(`${BASE}/api/geocode?address=${encodeURIComponent("Ljubljana, Slovenia")}`).then((r) =>
    r.json()
  );
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

function urlInSources(productUrl, sources) {
  if (!productUrl) return false;
  const norm = (u) => {
    try {
      const x = new URL(u);
      return `${x.hostname.replace(/^www\./i, "")}${x.pathname.replace(/\/+$/, "")}`.toLowerCase();
    } catch {
      return String(u).toLowerCase();
    }
  };
  const p = norm(productUrl);
  return (sources || []).some((s) => {
    const src = norm(s.url);
    return p === src || p.startsWith(src + "/") || src.startsWith(p + "/");
  });
}

async function main() {
  const {
    runControlPrimaryPass,
    prepareEnrichedCandidates,
    runIsolatedSelector,
    evaluateIsolatedSelectionAcceptance,
  } = await loadModules();

  console.log("SELECTION STABILITY EXPERIMENT");
  console.log("Primary prompt: CONTROL (hardcoded in runControlPrimaryPass)");
  console.log("Serp fallback: not used");
  console.log("Production wiring: unchanged\n");

  const allowlist = await fetchAllowlist();
  console.log(`Allowlist (${allowlist.length}): ${allowlist.join(", ")}\n`);

  const byCategory = {};
  const frozenCases = [];

  for (const entry of FOCUS) {
    const runs = [];
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

      let isolated = null;
      let isolatedAccepted = false;
      let isolatedCorrect = false;
      let currentCorrect = false;

      const primarySelectedValid =
        primary.primaryDecision === "found" &&
        primary.product &&
        urlInSources(primary.product.productUrl, primary.sources) &&
        qualifyingList.some(
          (q) =>
            q.url.toLowerCase().includes(new URL(primary.product.productUrl).pathname.toLowerCase().slice(0, 40)) ||
            primary.product.productUrl.toLowerCase().includes(q.url.toLowerCase().replace(/\/$/, ""))
        );

      // Broader: primary found + URL in sources counts as current selected; correctness via qualification overlap or acceptance later
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
          isolatedCorrect = qualifyingList.some((q) => q.candidateId === isolated.candidateId) || acc.accepted;
        }
        currentCorrect =
          currentSelected &&
          primary.product &&
          (qualifyingList.some((q) => primary.product.productUrl === q.url) ||
            qualifyingList.some((q) => urlInSources(primary.product.productUrl, [{ url: q.url }])));
        if (currentSelected && !currentCorrect && primary.product) {
          // If primary picked something in sources that our heuristic didn't mark qualifying, mark unknown
          currentCorrect = urlInSources(primary.product.productUrl, primary.sources);
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
        console.log(`  topValid: ${qualifyingList[0].name} @ ${qualifyingList[0].price} (${qualifyingList[0].url})`);
      }
      if (i < RUNS) await sleep(PACE_MS);
    }
    byCategory[entry.category] = runs;
  }

  // Aggregate report metrics
  const bathroom = byCategory["bathroom-towel"] || [];
  const bathroomFound = bathroom.filter((r) => r.primaryDecision === "found").length;
  const bathroomNotFound = bathroom.filter((r) => r.primaryDecision === "not_found").length;
  const bathroomNfValid = bathroom.filter((r) => r.primaryDecision === "not_found" && r.hasValidInSources).length;
  const bathroomNfNoValid = bathroom.filter((r) => r.primaryDecision === "not_found" && !r.hasValidInSources).length;

  const frozen = frozenCases;
  const currentSelectedCount = frozen.filter((f) => f.currentSelected).length;
  const currentNone = frozen.filter((f) => !f.currentSelected).length;
  const currentCorrect = frozen.filter((f) => f.currentSelected && f.currentCorrect).length;
  const currentFalseNone = frozen.filter((f) => !f.currentSelected).length;

  const isolatedSelected = frozen.filter((f) => f.isolatedStatus === "selected");
  const isolatedNone = frozen.filter((f) => f.isolatedStatus !== "selected");
  const isolatedCorrect = frozen.filter((f) => f.isolatedStatus === "selected" && f.isolatedCorrect);
  const isolatedAccepted = frozen.filter((f) => f.isolatedAccepted);
  const isolatedWrong = frozen.filter((f) => f.isolatedStatus === "selected" && !f.isolatedCorrect);
  const isolatedFalseNone = frozen.filter((f) => f.isolatedStatus !== "selected");

  const precisionDenom = isolatedSelected.length;
  const precision =
    precisionDenom === 0 ? null : Math.round((isolatedCorrect.length / precisionDenom) * 1000) / 10;

  const summary = {
    bathroom: {
      runs: bathroom.length,
      primaryFound: bathroomFound,
      primaryNotFound: bathroomNotFound,
      notFoundWithValid: bathroomNfValid,
      notFoundWithoutValid: bathroomNfNoValid,
    },
    frozenSourceSets: frozen.length,
    currentCorrect: `${currentCorrect}/${frozen.length}`,
    isolatedCorrect: `${isolatedCorrect.length}/${frozen.length}`,
    currentFalseNone: currentFalseNone,
    isolatedFalseNone: isolatedFalseNone.length,
    isolatedWrong: isolatedWrong.length,
    isolatedAccepted: isolatedAccepted.length,
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
            notFoundWithValid: rows.filter((r) => r.primaryDecision === "not_found" && r.hasValidInSources).length,
            frozenSets: frozenCat.length,
            currentFalseNone: frozenCat.filter((f) => !f.currentSelected).length,
            isolatedFalseNone: frozenCat.filter((f) => f.isolatedStatus !== "selected").length,
            isolatedCorrect: frozenCat.filter((f) => f.isolatedCorrect).length,
            isolatedWrong: frozenCat.filter((f) => f.isolatedStatus === "selected" && !f.isolatedCorrect).length,
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
