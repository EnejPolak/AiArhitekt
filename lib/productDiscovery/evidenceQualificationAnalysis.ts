/**
 * Detailed qualification / evidence-gap analysis for benchmarks.
 * Does not change production acceptance semantics.
 */
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import type { FrozenEvidenceCandidate } from "./productEvidenceBenchmark";

export type HardConstraintKind =
  | "HARD_PRICE"
  | "HARD_MATERIAL"
  | "HARD_COLOR_FINISH"
  | "HARD_WIDTH"
  | "HARD_HEIGHT"
  | "HARD_DEPTH"
  | "HARD_OTHER_DIMENSION"
  | "HARD_CATEGORY"
  | "HARD_VARIANT"
  | "HARD_OTHER";

export type HardConstraintEvidenceMode = "PROVEN_MISMATCH" | "INSUFFICIENT_EVIDENCE";

export type HardConstraintDetail = {
  kind: HardConstraintKind;
  mode: HardConstraintEvidenceMode;
  reason: string;
};

export type MissingEvidenceCombo =
  | "material_only"
  | "dimensions_only"
  | "color_finish_only"
  | "price_only"
  | "material_dimensions"
  | "material_finish"
  | "dimensions_finish"
  | "material_dimensions_finish"
  | "multiple_other";

const UNSUPPORTED_ENRICHMENT_DOMAINS = new Set(["bauhaus.si", "xxxlesnina.si"]);

export function isUnsupportedMerchantUrl(url: string): boolean {
  try {
    return UNSUPPORTED_ENRICHMENT_DOMAINS.has(normalizeDomainToRoot(new URL(url).hostname));
  } catch {
    return false;
  }
}

export function isFetchableCandidate(candidate: FrozenEvidenceCandidate): boolean {
  if (isUnsupportedMerchantUrl(candidate.productUrl)) return false;
  if (candidate.enrichmentStatus === "forbidden") return false;
  if (candidate.enrichmentDetail.fetchBlockReason?.includes("CHALLENGE")) return false;
  if (candidate.enrichmentDetail.unsupportedDirectEnrichment) return false;
  return candidate.enrichmentStatus === "success";
}

function reasonKind(reason: string): HardConstraintKind {
  const r = reason.toLowerCase();
  if (/over budget|price unknown|budget/.test(r)) return "HARD_PRICE";
  if (/ceramic|stainless|inox|metal|material|gold|oak|wood|leather/.test(r) && /material|inox|steel|ceramic/.test(r)) {
    return "HARD_MATERIAL";
  }
  if (/chrome|finish|color|colour|black|white|barva|matte|krom/.test(r)) return "HARD_COLOR_FINISH";
  if (/exact\s*60|width|širina|sirina|wide/.test(r)) return "HARD_WIDTH";
  if (/height|višina|visina/.test(r)) return "HARD_HEIGHT";
  if (/depth|globina|length|dolžina/.test(r)) return "HARD_DEPTH";
  if (/cm|mm|dimension|size|approx\s*40/.test(r)) return "HARD_OTHER_DIMENSION";
  if (/categor|tile|vase|radiator|pendant|sink|towel holder|core category/.test(r)) {
    return "HARD_CATEGORY";
  }
  if (/variant|sku/.test(r)) return "HARD_VARIANT";
  return "HARD_OTHER";
}

function reasonMode(reason: string): HardConstraintEvidenceMode {
  const r = reason.toLowerCase();
  // Positive contradiction / wrong product
  if (
    r.includes("wrong ") ||
    r.includes("over budget") ||
    /contradict|violat/.test(r) ||
    /white, not chrome|black, not chrome|tile, not vase|towel holder, not radiator/.test(r)
  ) {
    return "PROVEN_MISMATCH";
  }
  // Missing / unverified / insufficient
  if (
    r.includes("not evidenced") ||
    r.includes("unknown") ||
    r.includes("unverified") ||
    r.includes("missing") ||
    r.includes("insufficient") ||
    r.includes("acceptance rejected: insufficient") ||
    r.includes("acceptance rejected: budget_unverified") ||
    r.includes("acceptance rejected: hard_constraint_unmet") ||
    r.includes("acceptance rejected: identity_requirement_unverified") ||
    r.includes("acceptance rejected: category_unverified")
  ) {
    // hard_constraint_unmet can be proven OR insufficient depending on lists —
    // treat as insufficient unless the reason text also says "wrong".
    if (r.includes("hard_constraint_unmet") && !r.includes("wrong")) {
      return "INSUFFICIENT_EVIDENCE";
    }
    return "INSUFFICIENT_EVIDENCE";
  }
  return "INSUFFICIENT_EVIDENCE";
}

/**
 * Extract hard-constraint details from qualification / acceptance reasons.
 * Missing evidence is never reported as PROVEN_MISMATCH.
 */
export function classifyHardConstraintDetails(
  candidate: FrozenEvidenceCandidate
): HardConstraintDetail[] {
  const details: HardConstraintDetail[] = [];
  const seen = new Set<string>();
  const push = (reason: string) => {
    const kind = reasonKind(reason);
    const mode = reasonMode(reason);
    const key = `${kind}|${mode}|${reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    details.push({ kind, mode, reason });
  };

  for (const reason of candidate.qualificationReasons) {
    const r = reason.toLowerCase();
    if (r.includes("confirmed") || r.startsWith("price €") && r.includes("within")) continue;
    if (
      r.includes("not evidenced") ||
      r.includes("wrong ") ||
      r.includes("over budget") ||
      r.includes("unverified") ||
      r.includes("unknown") ||
      r.includes("missing") ||
      r.includes("acceptance rejected")
    ) {
      push(reason);
    }
  }

  const rr = candidate.productionDecision.rejectionReason;
  if (rr && rr !== "accepted") {
    push(`acceptance rejected: ${rr}`);
  }

  return details;
}

export function hasProvenHardConstraintMismatch(candidate: FrozenEvidenceCandidate): boolean {
  return classifyHardConstraintDetails(candidate).some((d) => d.mode === "PROVEN_MISMATCH");
}

export function missingEvidenceFlags(candidate: FrozenEvidenceCandidate): {
  price: boolean;
  material: boolean;
  color: boolean;
  dimensions: boolean;
} {
  const price =
    !candidate.enrichmentDetail.merchantPrice && candidate.evidenceCoverage.priceKind === "none";
  const material =
    !candidate.enrichmentDetail.materialFound &&
    (candidate.evidenceCoverage.materialKinds?.length ?? 0) === 0;
  const color =
    !candidate.enrichmentDetail.colorFound &&
    (candidate.evidenceCoverage.colorKinds?.length ?? 0) === 0;
  const dimensions =
    (candidate.enrichmentDetail.labeledDimensionsFound ?? 0) === 0 &&
    (candidate.evidenceCoverage.dimensionKinds?.length ?? 0) === 0;
  return { price, material, color, dimensions };
}

export function classifyMissingEvidenceCombo(
  candidate: FrozenEvidenceCandidate
): MissingEvidenceCombo | null {
  if (candidate.fullyQualifyingCandidate) return null;
  const f = missingEvidenceFlags(candidate);
  const missing = [
    f.price ? "price" : null,
    f.material ? "material" : null,
    f.color ? "color" : null,
    f.dimensions ? "dimensions" : null,
  ].filter(Boolean) as string[];

  if (missing.length === 0) return null;
  if (missing.length === 1) {
    if (missing[0] === "material") return "material_only";
    if (missing[0] === "dimensions") return "dimensions_only";
    if (missing[0] === "color") return "color_finish_only";
    if (missing[0] === "price") return "price_only";
  }
  const set = new Set(missing);
  if (set.has("material") && set.has("dimensions") && set.has("color") && !set.has("price")) {
    return "material_dimensions_finish";
  }
  if (set.has("material") && set.has("dimensions") && missing.length === 2) {
    return "material_dimensions";
  }
  if (set.has("material") && set.has("color") && missing.length === 2) {
    return "material_finish";
  }
  if (set.has("dimensions") && set.has("color") && missing.length === 2) {
    return "dimensions_finish";
  }
  return "multiple_other";
}

export type EligibleEvidenceStats = {
  relevantTotal: number;
  relevantFetchable: number;
  unsupportedMerchant: number;
  provenHardConstraintMismatch: number;
  eligibleForEvidenceEvaluation: number;
  fullyEvidencedOverall: number;
  fullyEvidencedAmongEligible: number;
};

export function summarizeEligibleEvidenceStats(
  candidates: FrozenEvidenceCandidate[]
): EligibleEvidenceStats {
  const relevant = candidates.filter((c) => c.relevantCandidate);
  const unsupportedMerchant = relevant.filter((c) => isUnsupportedMerchantUrl(c.productUrl)).length;
  const fetchable = relevant.filter((c) => isFetchableCandidate(c));
  const provenMismatch = fetchable.filter((c) => hasProvenHardConstraintMismatch(c));
  const eligible = fetchable.filter((c) => !hasProvenHardConstraintMismatch(c));
  return {
    relevantTotal: relevant.length,
    relevantFetchable: fetchable.length,
    unsupportedMerchant,
    provenHardConstraintMismatch: provenMismatch.length,
    eligibleForEvidenceEvaluation: eligible.length,
    fullyEvidencedOverall: relevant.filter((c) => c.fullyQualifyingCandidate).length,
    fullyEvidencedAmongEligible: eligible.filter((c) => c.fullyQualifyingCandidate).length,
  };
}

export function summarizeHardConstraintBreakdown(candidates: FrozenEvidenceCandidate[]): Record<
  HardConstraintKind,
  { proven: number; insufficient: number }
> {
  const kinds: HardConstraintKind[] = [
    "HARD_PRICE",
    "HARD_MATERIAL",
    "HARD_COLOR_FINISH",
    "HARD_WIDTH",
    "HARD_HEIGHT",
    "HARD_DEPTH",
    "HARD_OTHER_DIMENSION",
    "HARD_CATEGORY",
    "HARD_VARIANT",
    "HARD_OTHER",
  ];
  const out = Object.fromEntries(kinds.map((k) => [k, { proven: 0, insufficient: 0 }])) as Record<
    HardConstraintKind,
    { proven: number; insufficient: number }
  >;
  for (const c of candidates) {
    if (!c.relevantCandidate) continue;
    const details = classifyHardConstraintDetails(c);
    const seenKindMode = new Set<string>();
    for (const d of details) {
      const key = `${d.kind}|${d.mode}`;
      if (seenKindMode.has(key)) continue;
      seenKindMode.add(key);
      if (d.mode === "PROVEN_MISMATCH") out[d.kind].proven += 1;
      else out[d.kind].insufficient += 1;
    }
  }
  return out;
}

export function summarizeMissingEvidenceCombos(
  candidates: FrozenEvidenceCandidate[]
): Record<MissingEvidenceCombo, number> {
  const out: Record<MissingEvidenceCombo, number> = {
    material_only: 0,
    dimensions_only: 0,
    color_finish_only: 0,
    price_only: 0,
    material_dimensions: 0,
    material_finish: 0,
    dimensions_finish: 0,
    material_dimensions_finish: 0,
    multiple_other: 0,
  };
  for (const c of candidates) {
    if (!c.relevantCandidate) continue;
    if (c.fullyQualifyingCandidate) continue;
    if (hasProvenHardConstraintMismatch(c)) continue;
    if (!isFetchableCandidate(c) || isUnsupportedMerchantUrl(c.productUrl)) continue;
    const combo = classifyMissingEvidenceCombo(c);
    if (combo) out[combo] += 1;
  }
  return out;
}
