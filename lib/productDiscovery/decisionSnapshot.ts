/**
 * Decision-time acceptance snapshots for parity audits.
 * Captures the exact ProductEvidence used when production accepts/rejects.
 */
import type { AcceptanceResult, AcceptanceSource } from "./acceptancePolicy";
import type { CandidateEnrichment } from "./enrichCandidate";
import {
  buildProductEvidence,
  type ProductEvidence,
} from "./productEvidence";
import type { RescueCandidate } from "./rescueCandidates";
import { assessAcceptanceAlignedQualification } from "./selectionBenchmarkGroundTruth";
import type { ProductDiscoveryProduct, ProductDiscoverySource } from "./types";

export type DecisionPath =
  | "primary"
  | "rescue"
  | "targeted"
  | "price_verification"
  | "serp";

export type AcceptedDecisionSnapshot = {
  requestedItem: string;
  path: DecisionPath;
  productUrl: string;
  productEvidence: ProductEvidence;
  normalizedRequirements: {
    matchedRequirements: string[];
    unmetRequirements: string[];
    unknownRequirements: string[];
  };
  acceptanceResult: {
    accepted: boolean;
    score: number;
    coverage: number;
    reason: string | null;
  };
};

/** api-debug only. Final rejected candidate — never a customer-facing field. */
export type RejectedDecisionSnapshot = AcceptedDecisionSnapshot & {
  candidateId: string | null;
  rejectionReason: string | null;
};

export type PathParityBucket = {
  path: DecisionPath;
  productionAccepted: number;
  benchmarkQualifying: number;
  mismatch: number;
};

export type ParityMismatchCause =
  | "PRODUCTION_ACCEPTANCE_BUG"
  | "BENCHMARK_SCOPE_MISMATCH"
  | "BENCHMARK_SERIALIZATION_LOSS"
  | "PATH_EVIDENCE_MISMATCH"
  | "OTHER";

function serializeProductEvidenceSafe(evidence: ProductEvidence): ProductEvidence {
  return JSON.parse(JSON.stringify(evidence)) as ProductEvidence;
}

function mapAcceptanceSourceToPath(source: AcceptanceSource | "price_verification"): DecisionPath {
  if (source === "serp_fallback") return "serp";
  if (source === "price_verification") return "price_verification";
  return source;
}

/** JSON-safe clone preserving EvidenceFact fields. */
export function freezeDecisionSnapshot(snapshot: AcceptedDecisionSnapshot): AcceptedDecisionSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as AcceptedDecisionSnapshot;
}

export function reloadDecisionSnapshot(raw: unknown): AcceptedDecisionSnapshot {
  if (!raw || typeof raw !== "object") throw new Error("Invalid decision snapshot");
  const record = raw as AcceptedDecisionSnapshot;
  if (!record.productEvidence || !record.productUrl || !record.path) {
    throw new Error("Decision snapshot missing required fields");
  }
  return freezeDecisionSnapshot({
    ...record,
    productEvidence: serializeProductEvidenceSafe(record.productEvidence),
  });
}

/** Later concrete rejection wins; keep earlier when a later stage selects none. */
export function preferConcreteRejectedSnapshot(
  earlier: RejectedDecisionSnapshot | null | undefined,
  later: RejectedDecisionSnapshot | null | undefined
): RejectedDecisionSnapshot | undefined {
  if (later?.productUrl) return later;
  if (earlier?.productUrl) return earlier;
  return undefined;
}

export function buildDecisionSnapshot(input: {
  requestedItem: string;
  path: DecisionPath | AcceptanceSource;
  product: ProductDiscoveryProduct;
  acceptance: Pick<AcceptanceResult, "accepted" | "matchScore" | "requirementCoverage" | "reason">;
  productEvidence: ProductEvidence;
}): AcceptedDecisionSnapshot {
  const path =
    input.path === "primary" ||
    input.path === "rescue" ||
    input.path === "targeted" ||
    input.path === "price_verification" ||
    input.path === "serp"
      ? input.path
      : mapAcceptanceSourceToPath(input.path);

  return {
    requestedItem: input.requestedItem,
    path,
    productUrl: input.product.productUrl,
    productEvidence: serializeProductEvidenceSafe(input.productEvidence),
    normalizedRequirements: {
      matchedRequirements: [...input.product.matchedRequirements],
      unmetRequirements: [...input.product.unmetRequirements],
      unknownRequirements: [...input.product.unknownRequirements],
    },
    acceptanceResult: {
      accepted: input.acceptance.accepted,
      score: input.acceptance.matchScore,
      coverage: input.acceptance.requirementCoverage,
      reason: input.acceptance.reason,
    },
  };
}

export function buildRejectedDecisionSnapshot(input: {
  requestedItem: string;
  path: DecisionPath | AcceptanceSource;
  candidateId: string | null;
  product: ProductDiscoveryProduct;
  acceptance: Pick<AcceptanceResult, "accepted" | "matchScore" | "requirementCoverage" | "reason">;
  productEvidence: ProductEvidence;
}): RejectedDecisionSnapshot {
  const base = buildDecisionSnapshot(input);
  return freezeDecisionSnapshot({
    ...base,
    candidateId: input.candidateId,
    rejectionReason: input.acceptance.reason,
  }) as RejectedDecisionSnapshot;
}

export function buildProductEvidenceForDecision(input: {
  productUrl: string;
  sources: ProductDiscoverySource[];
  enrichment?: CandidateEnrichment | null;
  trustedDisplayName?: string | null;
}): ProductEvidence {
  return buildProductEvidence({
    productUrl: input.productUrl,
    sources: input.sources,
    enrichment: input.enrichment,
    trustedDisplayName: input.trustedDisplayName,
  });
}

/**
 * Qualify a frozen decision snapshot with the same GT path used for benchmarks.
 * Uses ProductEvidence-backed candidate reconstruction (no model claims).
 */
export function qualifyDecisionSnapshot(snapshot: AcceptedDecisionSnapshot): {
  qualifies: boolean;
  acceptanceAccepted: boolean;
  reasons: string[];
  causeIfMismatch: ParityMismatchCause | null;
} {
  const hay = [
    ...snapshot.productEvidence.productNameEvidence,
    ...snapshot.productEvidence.categoryEvidence,
    ...snapshot.productEvidence.priceEvidence,
    ...snapshot.productEvidence.materialEvidence,
    ...snapshot.productEvidence.colorEvidence,
    ...snapshot.productEvidence.dimensionEvidence,
    ...snapshot.productEvidence.generalTextEvidence,
  ]
    .map((f) => f.text)
    .filter(Boolean)
    .join("\n");

  const name =
    snapshot.productEvidence.productNameEvidence.find((f) => f.kind.startsWith("merchant"))?.text ||
    snapshot.productEvidence.productNameEvidence[0]?.text ||
    null;

  const priceFact = snapshot.productEvidence.priceEvidence.find((f) => f.value != null);
  const enrichment: CandidateEnrichment | null = name
    ? {
        status: "success",
        pageTitle: name,
        metaDescription: null,
        productName: name,
        brand: null,
        price: typeof priceFact?.value === "number" ? priceFact.value : null,
        currency: "EUR",
        imageUrl: null,
        availability: null,
        sku: null,
        productText: hay,
        jsonLdProductFound: snapshot.productEvidence.priceEvidence.some(
          (f) => f.kind === "merchant_json_ld"
        ),
      }
    : null;

  let domain = "unknown";
  try {
    domain = new URL(snapshot.productUrl).hostname.replace(/^www\./i, "");
  } catch {
    /* ignore */
  }

  const candidate: RescueCandidate = {
    id: "decision_snapshot",
    url: snapshot.productUrl,
    domain,
    preRankScore: 1,
    sourceTitle:
      snapshot.productEvidence.productNameEvidence.find((f) => f.kind.startsWith("web_search"))
        ?.text ?? null,
    sourceEvidence:
      snapshot.productEvidence.generalTextEvidence.find((f) => f.kind === "web_search_source_snippet")
        ?.text ?? null,
    enrichment,
  };

  const gt = assessAcceptanceAlignedQualification(snapshot.requestedItem, candidate);

  let causeIfMismatch: ParityMismatchCause | null = null;
  if (snapshot.acceptanceResult.accepted && !gt.qualifies) {
    causeIfMismatch = "PRODUCTION_ACCEPTANCE_BUG";
  } else if (!snapshot.acceptanceResult.accepted && gt.qualifies) {
    causeIfMismatch = "OTHER";
  }

  return {
    qualifies: gt.qualifies,
    acceptanceAccepted: gt.acceptanceAccepted,
    reasons: gt.reasons,
    causeIfMismatch,
  };
}

export function summarizePathParity(
  rows: Array<{ path: DecisionPath; productionAccepted: boolean; benchmarkQualifying: boolean }>
): PathParityBucket[] {
  const paths: DecisionPath[] = ["primary", "rescue", "targeted", "price_verification"];
  return paths.map((path) => {
    const subset = rows.filter((r) => r.path === path);
    const productionAccepted = subset.filter((r) => r.productionAccepted).length;
    const benchmarkQualifying = subset.filter((r) => r.benchmarkQualifying).length;
    const mismatch = subset.filter((r) => r.productionAccepted !== r.benchmarkQualifying).length;
    return { path, productionAccepted, benchmarkQualifying, mismatch };
  });
}
