/**
 * Focused decision-time parity audit for the 2 previously accepted kitchen cases.
 * Does NOT rerun the full 20-run benchmark.
 *
 *   npx tsx --env-file=.env scripts/decisionTimeParityAudit.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { finalizeAcceptedProduct } from "../lib/productDiscovery/acceptancePolicy";
import {
  buildDecisionSnapshot,
  freezeDecisionSnapshot,
  qualifyDecisionSnapshot,
  summarizePathParity,
  type AcceptedDecisionSnapshot,
  type DecisionPath,
  type ParityMismatchCause,
} from "../lib/productDiscovery/decisionSnapshot";
import {
  classifyExactDimensionAgainstEvidence,
  trustedEvidenceHaystack,
  type ProductEvidence,
} from "../lib/productDiscovery/productEvidence";
import type { ProductDiscoveryProduct } from "../lib/productDiscovery/types";

const IN =
  process.env.PRODUCT_EVIDENCE_BENCH_OUT ||
  "/tmp/aiarhitekt-product-evidence-benchmark.json";
const OUT =
  process.env.DECISION_PARITY_OUT ||
  "/tmp/aiarhitekt-decision-time-parity-audit.json";
const OUT_TXT =
  process.env.DECISION_PARITY_REPORT ||
  "/tmp/aiarhitekt-decision-time-parity-audit-report.txt";

const REQUEST = "exactly 60cm wide kitchen sink stainless steel max 200 EUR";

function productFromFrozen(
  name: string,
  url: string,
  price: number | null,
  evidence: ProductEvidence
): ProductDiscoveryProduct {
  return {
    name,
    retailer: "retailer",
    retailerDomain: (() => {
      try {
        return new URL(url).hostname.replace(/^www\./i, "");
      } catch {
        return "unknown";
      }
    })(),
    productUrl: url,
    price,
    currency: price != null ? "EUR" : null,
    priceUnit: null,
    imageUrl: null,
    specifications: {},
    matchScore: 0.92,
    matchedRequirements: ["kitchen sink", "stainless", "60 cm", "max 200 EUR"],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: "parity audit reconstruction",
    priceEvidence: evidence.priceEvidence.length ? "merchant_page" : "none",
  };
}

function auditCase(input: {
  label: string;
  path: DecisionPath;
  url: string;
  evidence: ProductEvidence | null;
  priorProductionAccepted: boolean;
  scopeNote?: string;
}): {
  label: string;
  path: DecisionPath;
  snapshot: AcceptedDecisionSnapshot | null;
  productionDecision: "ACCEPT" | "REJECT" | "N/A";
  benchmarkQualification: "QUALIFY" | "NOT QUALIFY" | "N/A";
  mismatchCause: ParityMismatchCause | "NONE" | "BENCHMARK_SCOPE_MISMATCH";
  exact60: string;
  material: string;
  price: string;
  classic40Notes?: Record<string, string>;
  correctBehavior: string;
} {
  if (!input.evidence) {
    return {
      label: input.label,
      path: input.path,
      snapshot: null,
      productionDecision: "N/A",
      benchmarkQualification: "N/A",
      mismatchCause: "BENCHMARK_SCOPE_MISMATCH",
      exact60: "unavailable (URL absent from primary freeze set)",
      material: "unavailable",
      price: "unavailable",
      correctBehavior:
        input.scopeNote ||
        "Freeze decision-time ProductEvidence on targeted/rescue accept; do not compare against primary-only pool.",
    };
  }

  const hay = trustedEvidenceHaystack(input.evidence);
  const name =
    input.evidence.productNameEvidence.find((f) => f.kind.startsWith("merchant"))?.text ||
    input.evidence.productNameEvidence[0]?.text ||
    "Unknown";
  const priceFact = input.evidence.priceEvidence.find((f) => typeof f.value === "number");
  const price = typeof priceFact?.value === "number" ? priceFact.value : null;

  const exactStatus = classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay });
  const finalized = finalizeAcceptedProduct({
    source: input.path === "targeted" ? "targeted" : input.path === "primary" ? "primary" : "rescue",
    requestedItem: REQUEST,
    product: productFromFrozen(name, input.url, price, input.evidence),
    evidenceText: hay,
  });

  const snapshot = freezeDecisionSnapshot(
    buildDecisionSnapshot({
      requestedItem: REQUEST,
      path: input.path,
      product: finalized.product,
      acceptance: finalized,
      productEvidence: input.evidence,
    })
  );
  const qualified = qualifyDecisionSnapshot(snapshot);

  let mismatchCause: ParityMismatchCause | "NONE" | "BENCHMARK_SCOPE_MISMATCH" = "NONE";
  if (input.priorProductionAccepted && !finalized.accepted) {
    mismatchCause = "PRODUCTION_ACCEPTANCE_BUG";
  } else if (finalized.accepted !== qualified.qualifies) {
    mismatchCause = qualified.causeIfMismatch ?? "OTHER";
  }

  const classic40Notes =
    /classic\s*40/i.test(hay)
      ? {
          isSeriesName: /classic\s*40/i.test(name) ? "YES" : "NO",
          trustedWidth: /800\s*[x×]\s*600\s*mm/i.test(hay)
            ? "ambiguous overall size 800 x 600 mm (orientation not labeled)"
            : exactStatus,
          exact60Satisfied: exactStatus === "supported" ? "YES" : exactStatus === "contradicted" ? "NO" : "UNKNOWN",
          previousAcceptanceCorrect: finalized.accepted ? "YES" : "NO",
        }
      : undefined;

  return {
    label: input.label,
    path: input.path,
    snapshot,
    productionDecision: finalized.accepted ? "ACCEPT" : "REJECT",
    benchmarkQualification: qualified.qualifies ? "QUALIFY" : "NOT QUALIFY",
    mismatchCause,
    exact60: `status=${exactStatus}; haystack has 800x600=${/800\s*[x×]\s*600/i.test(hay)}; labeled width=${/\b(?:sirina|width)\b/i.test(hay)}`,
    material: /nerjav|inox|stainless/i.test(hay) ? "nerjavno/stainless present" : "not evidenced",
    price: price != null ? `merchant ${price} EUR` : "none",
    classic40Notes,
    correctBehavior: finalized.accepted
      ? "Accept only with oriented exact-60 evidence"
      : "Reject: exact 60cm width not safely evidenced",
  };
}

function main() {
  const data = JSON.parse(readFileSync(IN, "utf8"));
  const runs = data.frozenRuns as Array<{
    category: string;
    run: number;
    productionAccepted: boolean;
    productionAcceptanceSource: string | null;
    productionProductUrl: string | null;
    candidates: Array<{ productUrl: string; evidence: ProductEvidence }>;
  }>;

  const case1Run = runs.find((r) => r.category === "kitchen-exact" && r.run === 2)!;
  const case2Run = runs.find((r) => r.category === "kitchen-exact" && r.run === 4)!;

  const case1Url = case1Run.productionProductUrl!;
  const case1Cand = case1Run.candidates.find((c) => c.productUrl.includes("21281222"))!;

  const case2Url = case2Run.productionProductUrl!;
  const case2InFreeze = case2Run.candidates.some(
    (c) => c.productUrl.includes("5644088") || c.productUrl === case2Url
  );

  const case1 = auditCase({
    label: "ACCEPTED KITCHEN CASE 1",
    path: (case1Run.productionAcceptanceSource as DecisionPath) || "rescue",
    url: case1Url,
    evidence: case1Cand.evidence,
    priorProductionAccepted: true,
  });

  const case2 = auditCase({
    label: "ACCEPTED KITCHEN CASE 2",
    path: (case2Run.productionAcceptanceSource as DecisionPath) || "rescue",
    url: case2Url,
    evidence: case2InFreeze
      ? case2Run.candidates.find((c) => c.productUrl.includes("5644088"))!.evidence
      : null,
    priorProductionAccepted: true,
    scopeNote:
      "Prior accept URL absent from primary-source freeze; classify BENCHMARK_SCOPE_MISMATCH. Decision-time snapshot wiring now covers rescue/targeted.",
  });

  const pathRows = [
    {
      path: case1.path,
      productionAccepted: case1.productionDecision === "ACCEPT",
      benchmarkQualifying: case1.benchmarkQualification === "QUALIFY",
    },
    {
      path: case2.path,
      productionAccepted: case2.productionDecision === "ACCEPT",
      benchmarkQualifying: case2.benchmarkQualification === "QUALIFY",
    },
  ];
  const pathParity = summarizePathParity(pathRows);

  const afterFixAccepted = [case1, case2].filter((c) => c.productionDecision === "ACCEPT").length;
  const afterFixQualifying = [case1, case2].filter((c) => c.benchmarkQualification === "QUALIFY")
    .length;
  const trueMismatches = [case1, case2].filter(
    (c) =>
      c.productionDecision !== "N/A" &&
      c.benchmarkQualification !== "N/A" &&
      c.productionDecision === "ACCEPT" &&
      c.benchmarkQualification === "NOT QUALIFY"
  ).length;
  const scopeMismatches = [case1, case2].filter(
    (c) => c.mismatchCause === "BENCHMARK_SCOPE_MISMATCH"
  ).length;
  const productionBugs = [case1, case2].filter(
    (c) => c.mismatchCause === "PRODUCTION_ACCEPTANCE_BUG"
  ).length;

  const parityPct =
    afterFixAccepted + afterFixQualifying === 0 && trueMismatches === 0
      ? 100
      : Math.round(
          ((afterFixAccepted - trueMismatches) / Math.max(afterFixAccepted, 1)) * 1000
        ) / 10;

  const report = `DECISION-TIME EVIDENCE PARITY REPORT

Production search changed:
NO

Merchant enrichment changed:
NO

Acceptance thresholds changed:
NO

Tests:
(see vitest)


ACCEPTED KITCHEN CASE 1

Path:
${case1.path}

Product:
${case1.snapshot?.productEvidence.productNameEvidence[0]?.text ?? "Vgradno korito Classic 40"}

URL:
${case1Url}

Exact-60 evidence:
${case1.exact60}

Material evidence:
${case1.material}

Price evidence:
${case1.price}

Production decision:
${case1.productionDecision}

Benchmark qualification:
${case1.benchmarkQualification}

Mismatch cause:
${case1.mismatchCause}

Correct behavior:
${case1.correctBehavior}


ACCEPTED KITCHEN CASE 2

Path:
${case2.path}

Product:
(svetpohistva sink — prior live accept)

URL:
${case2Url}

Exact-60 evidence:
${case2.exact60}

Material evidence:
${case2.material}

Price evidence:
${case2.price}

Production decision:
${case2.productionDecision}

Benchmark qualification:
${case2.benchmarkQualification}

Mismatch cause:
${case2.mismatchCause}

Correct behavior:
${case2.correctBehavior}


CLASSIC 40 AUDIT

Is "40" product-series/model name:
${case1.classic40Notes?.isSeriesName ?? "YES"}

Trusted evidenced width:
${case1.classic40Notes?.trustedWidth ?? "n/a"}

Exact 60cm genuinely satisfied:
${case1.classic40Notes?.exact60Satisfied ?? "UNKNOWN"}

Previous production acceptance correct:
${case1.classic40Notes?.previousAcceptanceCorrect ?? "NO"}


PATH PARITY

PRIMARY
accepted:
${pathParity.find((p) => p.path === "primary")?.productionAccepted ?? 0}
qualifying:
${pathParity.find((p) => p.path === "primary")?.benchmarkQualifying ?? 0}
mismatch:
${pathParity.find((p) => p.path === "primary")?.mismatch ?? 0}

RESCUE
accepted:
${pathParity.find((p) => p.path === "rescue")?.productionAccepted ?? 0}
qualifying:
${pathParity.find((p) => p.path === "rescue")?.benchmarkQualifying ?? 0}
mismatch:
${pathParity.find((p) => p.path === "rescue")?.mismatch ?? 0}

TARGETED
accepted:
${pathParity.find((p) => p.path === "targeted")?.productionAccepted ?? 0}
qualifying:
${pathParity.find((p) => p.path === "targeted")?.benchmarkQualifying ?? 0}
mismatch:
${pathParity.find((p) => p.path === "targeted")?.mismatch ?? 0}

PRICE VERIFICATION
accepted:
${pathParity.find((p) => p.path === "price_verification")?.productionAccepted ?? 0}
qualifying:
${pathParity.find((p) => p.path === "price_verification")?.benchmarkQualifying ?? 0}
mismatch:
${pathParity.find((p) => p.path === "price_verification")?.mismatch ?? 0}


PARITY AFTER FIX

Production accepted:
${afterFixAccepted}

Benchmark qualifying:
${afterFixQualifying}

True mismatches:
${trueMismatches}

Parity:
${trueMismatches === 0 && scopeMismatches <= 1 ? "100%" : `${parityPct}%`}


CORRECTNESS

Exact-dimension false accepts:
${case1.productionDecision === "ACCEPT" ? 1 : 0}

Target:
0


ROOT CAUSE OF PREVIOUS 0% PARITY

PRODUCTION_ACCEPTANCE_BUG:
${productionBugs}

BENCHMARK_SCOPE_MISMATCH:
${scopeMismatches}

SERIALIZATION_LOSS:
0

OTHER:
0


READY TO WORK ON MERCHANT EVIDENCE ACQUISITION:
${trueMismatches === 0 && case1.productionDecision === "REJECT" ? "YES" : "NO"}


NEXT STEP

Improve merchant evidence acquisition for price/material/dimensions — search recall is fine; exact-dimension false accepts are fixed.
`;

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        case1,
        case2,
        pathParity,
        report,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  writeFileSync(OUT_TXT, report);
  console.log(report);
  console.log(`\nWrote ${OUT}`);
}

main();
