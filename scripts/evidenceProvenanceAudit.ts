/**
 * Evidence provenance consistency audit (dev-only).
 * Does NOT modify production Product Discovery behavior.
 *
 *   PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT=control \
 *   PRODUCT_DISCOVERY_SERP_FALLBACK=false \
 *   npx tsx --env-file=.env scripts/evidenceProvenanceAudit.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  buildProvenanceAudit,
  focusRequirementLabels,
  summarizeFocusGrounding,
  wouldFrozenQualifyIfProductionEvidencePreserved,
  PRODUCTION_ACCEPTANCE_EVIDENCE_NOTES,
  reconstructPrimaryEvidenceText,
} from "../lib/productDiscovery/evidenceProvenanceAudit";
import { searchProductItem } from "../lib/productDiscovery/searchItem";
import {
  isCategoryVerified,
} from "../lib/productDiscovery/requirementAnalysis";
import {
  categoryEvidenceHaystack,
  verifyIdentityRequirements,
} from "../lib/productDiscovery/productIdentity";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PACE_MS = Number(process.env.BENCHMARK_PACE_MS ?? 3000);
const RUNS = Number(process.env.FOCUS_RUNS ?? 5);
const FROZEN_PATH =
  process.env.FROZEN_BENCHMARK_PATH ||
  "/tmp/aiarhitekt-acceptance-aligned-selection-relabeled.json";
const OUT_PATH =
  process.env.PROVENANCE_OUT || "/tmp/aiarhitekt-evidence-provenance-audit.json";

const FOCUS = [
  {
    category: "lighting",
    item: "black metal pendant lamp approx 40cm max 120 EUR",
  },
  {
    category: "kitchen",
    item: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
  },
  {
    category: "bathroom",
    item: "chrome heated towel rail width 60cm max 150 EUR",
  },
  {
    category: "accessory",
    item: "ceramic vase white height 30cm max 40 EUR",
  },
] as const;

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

function loadFrozenCandidates(category: string): Array<{
  url: string;
  sourceTitle: string | null;
  sourceEvidence: string | null;
  enrichment: { status?: string; price?: number | null } | null;
}> {
  try {
    const raw = JSON.parse(readFileSync(FROZEN_PATH, "utf8"));
    const cases = (raw.frozenCases ?? []) as Array<{
      category: string;
      candidates?: Array<{
        url: string;
        sourceTitle: string | null;
        sourceEvidence: string | null;
        enrichment: { status?: string; price?: number | null } | null;
      }>;
    }>;
    const catKey =
      category === "kitchen"
        ? "kitchen-exact"
        : category === "bathroom"
          ? "bathroom-towel"
          : category;
    const out: Array<{
      url: string;
      sourceTitle: string | null;
      sourceEvidence: string | null;
      enrichment: { status?: string; price?: number | null } | null;
    }> = [];
    for (const c of cases) {
      if (c.category !== catKey && c.category !== category) continue;
      for (const cand of c.candidates ?? []) out.push(cand);
    }
    return out;
  } catch {
    return [];
  }
}

function findFrozenMatch(
  productUrl: string,
  frozen: ReturnType<typeof loadFrozenCandidates>
) {
  const match = frozen.find((c) => urlsMatch(c.url, productUrl));
  return {
    found: Boolean(match),
    inTopCandidates: Boolean(match),
    sourceTitle: match?.sourceTitle ?? null,
    sourceEvidence: match?.sourceEvidence ?? null,
    enrichmentStatus: match?.enrichment?.status ?? null,
    enrichmentPrice: match?.enrichment?.price ?? null,
  };
}

async function main() {
  // Force CONTROL + Serp off for this audit process only (does not change repo defaults).
  process.env.PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT = "control";
  process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = "false";

  console.log("EVIDENCE PROVENANCE CONSISTENCY AUDIT");
  console.log("Production behavior changed: NO");
  console.log("Prompt: CONTROL (process env override)");
  console.log("Serp fallback: false\n");
  console.log("Acceptance evidence notes:");
  for (const n of PRODUCTION_ACCEPTANCE_EVIDENCE_NOTES) console.log(`  - ${n}`);
  console.log("");

  const allowlist = await fetchAllowlist();
  console.log(`Allowlist (${allowlist.length}): ${allowlist.join(", ")}\n`);

  const rows: any[] = [];

  for (const entry of FOCUS) {
    const frozenPool = loadFrozenCandidates(entry.category);
    for (let i = 1; i <= RUNS; i++) {
      console.log(`[${entry.category}] run ${i}/${RUNS}...`);
      const result = await searchProductItem({
        requestedItem: entry.item,
        allowlistDomains: allowlist,
      });

      const accepted = result.status === "found" && !!result.product;
      const acceptanceSource = result.diagnostics?.acceptanceSource ?? null;
      const isPrimaryAccepted = accepted && acceptanceSource === "primary";

      let provenance = null;
      let focusGrounding = null;
      let wouldQualify = null;
      let identity = null;
      let categoryVerified = null;

      if (accepted && result.product) {
        const frozenMatch = findFrozenMatch(result.product.productUrl, frozenPool);
        provenance = buildProvenanceAudit({
          requestedItem: entry.item,
          accepted: true,
          acceptanceSource,
          acceptanceReason: result.diagnostics?.acceptanceReason ?? null,
          modelProduct: null, // searchProductItem returns post-finalize lists only
          finalProduct: result.product,
          sources: result.sources,
          frozenMatch,
        });
        provenance.requirementCoverage = result.diagnostics?.requirementCoverage ?? null;

        const labels = focusRequirementLabels(entry.item);
        focusGrounding = summarizeFocusGrounding(provenance.traces, labels);
        wouldQualify = wouldFrozenQualifyIfProductionEvidencePreserved({
          requestedItem: entry.item,
          product: result.product,
          sources: result.sources,
        });

        const evidenceText = reconstructPrimaryEvidenceText(result.product, result.sources);
        categoryVerified = isCategoryVerified(
          entry.item,
          result.product.name,
          evidenceText,
          result.product.specifications
        );
        identity = verifyIdentityRequirements({
          requestedItem: entry.item,
          lists: {
            matchedRequirements: result.product.matchedRequirements,
            unmetRequirements: result.product.unmetRequirements,
            unknownRequirements: result.product.unknownRequirements,
          },
          evidenceHaystack: categoryEvidenceHaystack({
            productName: result.product.name,
            evidenceText,
            specifications: result.product.specifications,
          }),
        });
      }

      const row = {
        category: entry.category,
        run: i,
        requestedItem: entry.item,
        status: result.status,
        acceptanceSource,
        acceptanceReason: result.diagnostics?.acceptanceReason ?? null,
        primaryStatus: result.diagnostics?.primaryStatus ?? null,
        isPrimaryAccepted,
        productName: result.product?.name ?? null,
        productUrl: result.product?.productUrl ?? null,
        price: result.product?.price ?? null,
        priceEvidence: result.product?.priceEvidence ?? null,
        matchScore: result.product?.matchScore ?? null,
        requirementCoverage: result.diagnostics?.requirementCoverage ?? null,
        matchedRequirements: result.product?.matchedRequirements ?? [],
        unknownRequirements: result.product?.unknownRequirements ?? [],
        unmetRequirements: result.product?.unmetRequirements ?? [],
        whyItMatches: result.product?.whyItMatches ?? null,
        sourceCount: result.sources.length,
        sourceTitlesPresent: result.sources.filter((s) => !!s.title).length,
        categoryVerified,
        identity,
        focusGrounding,
        wouldQualifyIfProductionEvidencePreserved: wouldQualify,
        provenance,
        diagnostics: {
          rescueAttempted: result.diagnostics?.rescueAttempted ?? false,
          priceVerificationAttempted: result.diagnostics?.priceVerificationAttempted ?? false,
          priceVerificationRecovered: result.diagnostics?.priceVerificationRecovered ?? false,
          serpFallbackEnabled: result.diagnostics?.serpFallbackEnabled ?? false,
          serpFallbackAttempted: result.diagnostics?.serpFallbackAttempted ?? false,
          primarySearchQueries: result.diagnostics?.primarySearchQueries ?? [],
        },
      };
      rows.push(row);

      console.log(
        `  status=${result.status} source=${acceptanceSource} primaryAccepted=${isPrimaryAccepted} name=${result.product?.name ?? "-"}`
      );
      if (provenance) {
        console.log(
          `  inconsistency=${provenance.inconsistency} unsupported=${JSON.stringify(provenance.unsupportedMatchedClaims)}`
        );
        console.log(
          `  wouldQualifyIfPreserved=${wouldQualify?.yes} groundedHard=${provenance.allHardOrIdentityMatchedGrounded}`
        );
      }

      if (!(entry === FOCUS[FOCUS.length - 1] && i === RUNS)) await sleep(PACE_MS);
    }
  }

  const primaryAccepted = rows.filter((r) => r.isPrimaryAccepted);
  const inconsistencyDist = {
    BENCHMARK_EVIDENCE_LOSS: 0,
    BENCHMARK_POLICY_MISMATCH: 0,
    PRODUCTION_ACCEPTANCE_EVIDENCE_BUG: 0,
    NO_INCONSISTENCY: 0,
    UNKNOWN: 0,
  };
  for (const r of primaryAccepted) {
    const key = (r.provenance?.inconsistency ?? "UNKNOWN") as keyof typeof inconsistencyDist;
    inconsistencyDist[key] = (inconsistencyDist[key] ?? 0) + 1;
  }

  const byCategory: Record<string, any> = {};
  for (const cat of ["lighting", "kitchen", "bathroom", "accessory"] as const) {
    const catRows = rows.filter((r) => r.category === cat);
    const accepted = catRows.filter((r) => r.isPrimaryAccepted);
    const labels = accepted[0]
      ? focusRequirementLabels(accepted[0].requestedItem)
      : [];
    const groundingCounts: Record<string, { grounded: number; total: number }> = {};
    for (const label of labels) {
      groundingCounts[label] = { grounded: 0, total: accepted.length };
    }
    for (const r of accepted) {
      for (const label of labels) {
        if (r.focusGrounding?.[label]?.grounded) groundingCounts[label].grounded += 1;
      }
    }
    byCategory[cat] = {
      runs: catRows.length,
      primaryAccepted: accepted.length,
      groundingCounts,
      frozenComplete: accepted.filter(
        (r) =>
          r.provenance?.frozenRetention?.selectedUrlInSources &&
          r.provenance?.frozenRetention?.sourceTitlePresent &&
          !r.provenance?.notes?.some((n: string) => n.includes("missing from frozen"))
      ).length,
      inconsistencies: accepted.map((r) => r.provenance?.inconsistency),
      wouldQualifyIfPreserved: accepted.filter(
        (r) => r.wouldQualifyIfProductionEvidencePreserved?.yes
      ).length,
      products: accepted.map((r) => ({
        run: r.run,
        name: r.productName,
        url: r.productUrl,
        price: r.price,
        priceEvidence: r.priceEvidence,
        matched: r.matchedRequirements,
        unknown: r.unknownRequirements,
        unsupported: r.provenance?.unsupportedMatchedClaims,
        inconsistency: r.provenance?.inconsistency,
        focusGrounding: r.focusGrounding,
        whyItMatches: r.whyItMatches,
        frozen: r.provenance?.frozenRetention,
      })),
    };
  }

  const summary = {
    productionBehaviorChanged: false,
    runsAudited: rows.length,
    productionAcceptedResultsAudited: primaryAccepted.length,
    alsoAcceptedNonPrimary: rows.filter((r) => r.status === "found" && !r.isPrimaryAccepted)
      .length,
    inconsistencyDistribution: inconsistencyDist,
    productionAcceptanceSafety: {
      allHardOrIdentityMatchedGrounded: primaryAccepted.filter(
        (r) => r.provenance?.allHardOrIdentityMatchedGrounded
      ).length,
      withUnsupportedMatchedClaim: primaryAccepted.filter(
        (r) => (r.provenance?.unsupportedMatchedClaims?.length ?? 0) > 0
      ).length,
      total: primaryAccepted.length,
    },
    byCategory,
    codePathFindings: PRODUCTION_ACCEPTANCE_EVIDENCE_NOTES,
  };

  const out = { ranAt: new Date().toISOString(), summary, rows };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
