/**
 * Classify why a relevant candidate is not fully evidenced.
 */
import type { FrozenEvidenceCandidate } from "./productEvidenceBenchmark";
import type { FullEvidenceBlocker } from "./merchantAcquisitionDiagnostics";

export function classifyFullEvidenceBlocker(
  candidate: FrozenEvidenceCandidate
): FullEvidenceBlocker | null {
  if (candidate.fullyQualifyingCandidate) return null;

  const fetchBlocked =
    candidate.enrichmentStatus === "forbidden" ||
    candidate.enrichmentDetail.priceFailureReason === "PRICE_NONE_FETCH_BLOCKED" ||
    Boolean(candidate.enrichmentDetail.fetchBlockReason);

  const reasons = candidate.qualificationReasons.map((r) => r.toLowerCase());
  const hard =
    reasons.some((r) => /hard|exact|constraint|width|dimension.?miss|material.?viol|appearance/.test(r)) ||
    candidate.productionDecision.rejectionReason?.includes("exact") ||
    candidate.productionDecision.rejectionReason?.includes("material") ||
    candidate.productionDecision.rejectionReason?.includes("appearance");

  if (fetchBlocked && !candidate.enrichmentDetail.merchantPrice) {
    return "FETCH_BLOCKED";
  }
  if (hard && candidate.productionDecision.rejectionReason) {
    // Prefer hard-constraint when acceptance failed for constraint reasons
    const rr = candidate.productionDecision.rejectionReason;
    if (
      /exact|width|dimension|material|appearance|color|finish|category|budget/.test(rr) &&
      !/budget_unverified|price_unverified|insufficient/.test(rr)
    ) {
      return "HARD_CONSTRAINT_MISS";
    }
  }

  const missingPrice =
    !candidate.enrichmentDetail.merchantPrice && candidate.evidenceCoverage.priceKind === "none";
  const missingMaterial =
    !candidate.enrichmentDetail.materialFound &&
    (candidate.evidenceCoverage.materialKinds?.length ?? 0) === 0;
  const missingColor =
    !candidate.enrichmentDetail.colorFound &&
    (candidate.evidenceCoverage.colorKinds?.length ?? 0) === 0;
  const missingDims =
    (candidate.enrichmentDetail.labeledDimensionsFound ?? 0) === 0 &&
    (candidate.evidenceCoverage.dimensionKinds?.length ?? 0) === 0;

  const flags = [
    missingPrice ? "price" : null,
    missingMaterial ? "material" : null,
    missingColor ? "color" : null,
    missingDims ? "dims" : null,
  ].filter(Boolean);

  if (flags.length >= 2) return "MISSING_MULTIPLE";
  if (missingPrice) return "MISSING_PRICE";
  if (missingMaterial) return "MISSING_MATERIAL";
  if (missingColor) return "MISSING_COLOR_FINISH";
  if (missingDims) return "MISSING_DIMENSIONS";

  if (hard) return "HARD_CONSTRAINT_MISS";
  if (fetchBlocked) return "FETCH_BLOCKED";
  return "MISSING_MULTIPLE";
}

export function summarizeFullEvidenceBlockers(
  candidates: FrozenEvidenceCandidate[]
): Record<FullEvidenceBlocker, number> {
  const out: Record<FullEvidenceBlocker, number> = {
    MISSING_PRICE: 0,
    MISSING_MATERIAL: 0,
    MISSING_COLOR_FINISH: 0,
    MISSING_DIMENSIONS: 0,
    MISSING_VARIANT_IDENTITY: 0,
    MISSING_MULTIPLE: 0,
    HARD_CONSTRAINT_MISS: 0,
    FETCH_BLOCKED: 0,
  };
  for (const c of candidates) {
    if (!c.relevantCandidate) continue;
    const blocker = classifyFullEvidenceBlocker(c);
    if (blocker) out[blocker] += 1;
  }
  return out;
}
