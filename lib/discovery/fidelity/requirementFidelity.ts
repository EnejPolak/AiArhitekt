import type { CandidateEvidence } from "../categoryGate";
import type { SearchableRequirement } from "../itemSpecs";
import type { MaterialNeed } from "../itemSpecs";
import { resolveProductConcept } from "../locales/concepts";
import { normalizeMatchText, containsAnyToken, containsToken, containsAnyRootToken } from "@/lib/text/diacritics";
import {
  classifyCandidateProductKind,
  FLOOR_COVERING_KINDS,
  PAINT_CONFLICT_KINDS,
  PAINT_SURFACE_KINDS,
  TILE_INSTALLATION_KINDS,
  titleIsExplicitWallOnlyTile,
  type ProductKind,
} from "./productKind";

export type MatchLevel = "exact" | "compatible" | "lookalike" | "family" | "unknown" | "conflict";

export type RequirementFidelity = {
  score: number;
  confidence: number;
  productKindMatch: MatchLevel;
  hueMatch: MatchLevel;
  finishMatch: MatchLevel;
  materialMatch: MatchLevel;
  positiveSignals: string[];
  conflictingSignals: string[];
  productKind: ProductKind;
};

const OLIVE_TOKENS = ["olive", "olivn", "olivno"];
const DARK_GREEN_TOKENS = ["dark green", "temno zelen", "temnozelen"];
const GENERIC_GREEN_TOKENS = ["green", "zelen", "zelena", "zeleni"];
const BLACK_TOKENS = ["black", "crn", "crna", "crni"];
const WHITE_TOKENS = ["white", "bel", "bela", "beli"];
const GLOSS_TOKENS = ["gloss", "glossy", "sijaj", "sijajna", "sijajni", "sijajno"];
const MATTE_TOKENS = ["matte", "matt", "mat", "matna", "matni", "matno", "matirana", "matiran"];
const MARBLE_TOKENS = ["marmor", "marble"];
const MARBLE_LOOK_TOKENS = ["videz marmor", "marble effect", "marble look", "marble-look"];
const MARBLE_CONFLICT_TOKENS = ["laminat", "laminate", "parket", "hardwood", "oak", "hrast", "vinyl", "wood look", "wood-look"];
const EXPLICIT_FLOOR_TILE_EVIDENCE = /\btalna ploscic|\btalne ploscice|\bfloor tile|\bfloor and wall|\btalna in stenska|\bza tal in stene/;

function surfaceEvidenceText(evidence: CandidateEvidence): string {
  return normalizeMatchText(`${evidence.title} ${evidence.snippet ?? ""}`);
}

function hasExplicitFloorTileEvidence(text: string): boolean {
  return EXPLICIT_FLOOR_TILE_EVIDENCE.test(text);
}

function haystack(evidence: CandidateEvidence): { haystack: string; title: string } {
  const title = normalizeMatchText(evidence.title);
  const combined = normalizeMatchText(`${evidence.title} ${evidence.snippet ?? ""}`);
  return { haystack: combined, title };
}

function containsAny(text: string, tokens: string[]): boolean {
  return containsAnyToken(text, tokens);
}

function requiredPaintHue(requirement: SearchableRequirement): string {
  return (
    requirement.provenance?.paintHue ??
    (requirement.snapshot as MaterialNeed).constraints.find((item) => item.includes("-")) ??
    (requirement.snapshot as MaterialNeed).finishDirection ??
    ""
  )
    .toLowerCase()
    .trim();
}

function requiredPaintFinish(requirement: SearchableRequirement): string | null {
  return requirement.provenance?.paintFinish ?? null;
}

function titleConflictsWithHue(title: string, hue: string): boolean {
  if (hue === "black" || hue === "olive-green" || hue === "dark-green") {
    if (containsAny(title, WHITE_TOKENS)) return true;
  }
  if (hue === "black") {
    if (containsAny(title, GENERIC_GREEN_TOKENS) && !containsAny(title, BLACK_TOKENS)) return true;
  }
  if (hue === "olive-green") {
    if (containsAny(title, ["blue", "modr", "red", "rdec"])) return true;
  }
  return false;
}

function scoreHue(hue: string, combined: string, title: string): { level: MatchLevel; signals: string[]; conflicts: string[] } {
  const signals: string[] = [];
  const conflicts: string[] = [];

  if (!hue) return { level: "unknown", signals, conflicts };

  if (titleConflictsWithHue(title, hue)) {
    conflicts.push("title-hue-conflict");
    return { level: "conflict", signals, conflicts };
  }

  if (hue === "olive-green") {
    if (containsAny(combined, OLIVE_TOKENS)) {
      signals.push("olive-green");
      return { level: "exact", signals, conflicts };
    }
    if (containsAny(combined, DARK_GREEN_TOKENS)) {
      conflicts.push("dark-green-not-olive");
      return { level: "conflict", signals, conflicts };
    }
    if (containsAny(combined, GENERIC_GREEN_TOKENS)) {
      signals.push("green-family");
      return { level: "family", signals, conflicts };
    }
    if (containsAny(title, WHITE_TOKENS)) {
      conflicts.push("white-not-olive");
      return { level: "conflict", signals, conflicts };
    }
    return { level: "unknown", signals, conflicts };
  }

  if (hue === "dark-green") {
    if (containsAny(combined, DARK_GREEN_TOKENS)) {
      signals.push("dark-green");
      return { level: "exact", signals, conflicts };
    }
    if (containsAny(combined, OLIVE_TOKENS)) {
      conflicts.push("olive-not-dark-green");
      return { level: "conflict", signals, conflicts };
    }
    if (containsAny(combined, GENERIC_GREEN_TOKENS)) {
      signals.push("green-family");
      return { level: "family", signals, conflicts };
    }
    return { level: "unknown", signals, conflicts };
  }

  if (hue === "black") {
    if (containsAny(combined, BLACK_TOKENS)) {
      signals.push("black");
      return { level: "exact", signals, conflicts };
    }
    if (containsAny(title, WHITE_TOKENS) || containsAny(combined, GENERIC_GREEN_TOKENS)) {
      conflicts.push("not-black");
      return { level: "conflict", signals, conflicts };
    }
    return { level: "unknown", signals, conflicts };
  }

  if (hue === "white" && containsAny(combined, WHITE_TOKENS)) {
    signals.push("white");
    return { level: "exact", signals, conflicts };
  }

  if (hue === "green") {
    if (containsAny(combined, OLIVE_TOKENS)) {
      signals.push("olive-green-family");
      return { level: "family", signals, conflicts };
    }
    if (containsAny(combined, DARK_GREEN_TOKENS)) {
      signals.push("dark-green-family");
      return { level: "family", signals, conflicts };
    }
    if (containsAny(combined, GENERIC_GREEN_TOKENS)) {
      signals.push("green");
      return { level: "exact", signals, conflicts };
    }
    return { level: "unknown", signals, conflicts };
  }

  const tokens = normalizeMatchText(hue)
    .split(/[\s-]+/)
    .filter((token) => token.length >= 3);
  if (tokens.some((token) => combined.includes(token))) {
    signals.push(hue);
    return { level: "exact", signals, conflicts };
  }

  return { level: "unknown", signals, conflicts };
}

function scoreFinish(
  finish: string | null,
  combined: string,
  title: string
): { level: MatchLevel; signals: string[]; conflicts: string[] } {
  const signals: string[] = [];
  const conflicts: string[] = [];
  if (!finish) return { level: "unknown", signals, conflicts };

  if (finish === "matte") {
    if (containsAny(combined, GLOSS_TOKENS) || containsAny(title, GLOSS_TOKENS)) {
      conflicts.push("gloss-conflicts-matte");
      return { level: "conflict", signals, conflicts };
    }
    if (containsToken(combined, "mat") || containsAny(combined, MATTE_TOKENS.filter((t) => t !== "mat")) || containsAny(title, MATTE_TOKENS)) {
      signals.push("matte");
      return { level: "exact", signals, conflicts };
    }
    return { level: "unknown", signals, conflicts };
  }

  if (finish === "gloss") {
    if (containsAny(combined, GLOSS_TOKENS)) {
      signals.push("gloss");
      return { level: "exact", signals, conflicts };
    }
    return { level: "unknown", signals, conflicts };
  }

  return { level: "unknown", signals, conflicts };
}

function scoreMaterialMarble(combined: string): { level: MatchLevel; signals: string[]; conflicts: string[] } {
  const signals: string[] = [];
  const conflicts: string[] = [];

  if (containsAny(combined, MARBLE_CONFLICT_TOKENS) && !containsAnyRootToken(combined, MARBLE_TOKENS)) {
    conflicts.push("conflicting-floor-material");
    return { level: "conflict", signals, conflicts };
  }
  if (containsAnyRootToken(combined, MARBLE_TOKENS)) {
    signals.push("marble");
    return { level: "exact", signals, conflicts };
  }
  if (containsAny(combined, MARBLE_LOOK_TOKENS)) {
    signals.push("marble-look");
    return { level: "lookalike", signals, conflicts };
  }
  return { level: "unknown", signals, conflicts };
}

function matchLevelScore(level: MatchLevel): number {
  switch (level) {
    case "exact":
      return 1;
    case "lookalike":
      return 0.75;
    case "compatible":
      return 0.7;
    case "family":
      return 0.45;
    case "unknown":
      return 0.2;
    case "conflict":
      return 0;
  }
}

function aggregateScore(parts: MatchLevel[]): number {
  if (parts.some((part) => part === "conflict")) return 0;
  const weights = parts.map(matchLevelScore);
  if (weights.length === 0) return 0.2;
  return weights.reduce((sum, value) => sum + value, 0) / weights.length;
}

export function scoreRequirementFidelity(
  requirement: SearchableRequirement,
  evidence: CandidateEvidence
): RequirementFidelity {
  const concept = resolveProductConcept(requirement);
  const { haystack: combined, title } = haystack(evidence);
  const productKind = classifyCandidateProductKind(evidence);
  const positiveSignals: string[] = [];
  const conflictingSignals: string[] = [];

  let productKindMatch: MatchLevel = "unknown";
  let hueMatch: MatchLevel = "unknown";
  let finishMatch: MatchLevel = "unknown";
  let materialMatch: MatchLevel = "unknown";

  if (concept === "marble" || concept === "tiles" || concept === "flooring" || concept === "hardwood" || concept === "laminate") {
    if (TILE_INSTALLATION_KINDS.has(productKind)) {
      productKindMatch = "conflict";
      conflictingSignals.push(productKind);
    } else if (productKind === "wall_tile") {
      productKindMatch = "conflict";
      conflictingSignals.push("wall-only-tile");
    } else if (FLOOR_COVERING_KINDS.has(productKind)) {
      productKindMatch = "exact";
      positiveSignals.push(productKind);
    } else if (productKind === "category_listing") {
      productKindMatch = "conflict";
      conflictingSignals.push("category_listing");
    } else if (productKind === "unknown") {
      if (
        (concept === "marble" || concept === "tiles" || concept === "flooring") &&
        hasExplicitFloorTileEvidence(combined)
      ) {
        productKindMatch = "compatible";
      } else if (
        concept !== "marble" &&
        concept !== "tiles" &&
        concept !== "flooring" &&
        /\btaln|floor|ploscic|oblog/.test(combined)
      ) {
        productKindMatch = "compatible";
      } else {
        productKindMatch = "unknown";
      }
    } else {
      productKindMatch = "unknown";
    }

    if (concept === "marble") {
      const material = scoreMaterialMarble(combined);
      materialMatch = material.level;
      positiveSignals.push(...material.signals);
      conflictingSignals.push(...material.conflicts);
    }
  }

  if (concept === "wall_paint") {
    if (PAINT_CONFLICT_KINDS.has(productKind)) {
      productKindMatch = "conflict";
      conflictingSignals.push(productKind);
    } else if (PAINT_SURFACE_KINDS.has(productKind)) {
      productKindMatch = "exact";
      positiveSignals.push("interior_wall_paint");
    } else if (productKind === "unknown" && /\bbarva\b|\bpaint\b/.test(combined)) {
      productKindMatch = "compatible";
    }

    const hue = requiredPaintHue(requirement);
    const finish = requiredPaintFinish(requirement);
    const hueResult = scoreHue(hue, combined, title);
    const finishResult = scoreFinish(finish, combined, title);
    hueMatch = hueResult.level;
    finishMatch = finishResult.level;
    positiveSignals.push(...hueResult.signals, ...finishResult.signals);
    conflictingSignals.push(...hueResult.conflicts, ...finishResult.conflicts);

    if (productKind === "decorative_effect_paint" && (hue || finish)) {
      if (hueMatch !== "exact" || finishMatch !== "exact") {
        productKindMatch = "conflict";
        conflictingSignals.push("decorative-effect-without-explicit-hue-finish");
      }
    }
  }

  const scoreParts = [productKindMatch, hueMatch, finishMatch, materialMatch].filter(
    (part) => part !== "unknown"
  );
  const score = aggregateScore(scoreParts.length > 0 ? scoreParts : ["unknown"]);
  const confidence =
    positiveSignals.length > 0 ? Math.min(1, 0.4 + positiveSignals.length * 0.15) : 0.25;

  return {
    score,
    confidence,
    productKindMatch,
    hueMatch,
    finishMatch,
    materialMatch,
    positiveSignals,
    conflictingSignals,
    productKind,
  };
}

export type HardGateResult = {
  hardValid: boolean;
  hardGateReasons: string[];
  fidelity: RequirementFidelity;
};

export function evaluateCandidateHardGate(
  requirement: SearchableRequirement,
  evidence: CandidateEvidence
): HardGateResult {
  const fidelity = scoreRequirementFidelity(requirement, evidence);
  const reasons: string[] = [];

  if (fidelity.productKindMatch === "conflict") {
    reasons.push(...fidelity.conflictingSignals);
  }
  if (fidelity.hueMatch === "conflict") {
    reasons.push(...fidelity.conflictingSignals.filter((s) => s.includes("green") || s.includes("black") || s.includes("olive")));
  }
  if (fidelity.finishMatch === "conflict") {
    reasons.push("finish_conflict");
  }
  if (fidelity.materialMatch === "conflict") {
    reasons.push(...fidelity.conflictingSignals.filter((s) => s.includes("material") || s.includes("floor")));
  }

  const concept = resolveProductConcept(requirement);

  if (concept === "marble" || concept === "tiles" || concept === "flooring") {
    if (TILE_INSTALLATION_KINDS.has(fidelity.productKind)) {
      reasons.push(fidelity.productKind, "not_floor_covering");
    }
    if (fidelity.productKind === "wall_tile") {
      reasons.push("wall_tile", "wall-only-tile", "not_floor_covering");
    }
    if (titleIsExplicitWallOnlyTile(evidence.title)) {
      reasons.push("wall_tile", "wall-only-tile", "not_floor_covering");
    }
    if (concept === "marble") {
      if (fidelity.materialMatch === "conflict") {
        reasons.push("material_conflict");
      }
      const surfaceText = surfaceEvidenceText(evidence);
      const hasMarble =
        containsAnyRootToken(surfaceText, MARBLE_TOKENS) || containsAny(surfaceText, MARBLE_LOOK_TOKENS);
      const wallOnlyEvidence =
        fidelity.productKind === "wall_tile" ||
        titleIsExplicitWallOnlyTile(evidence.title) ||
        /\bstenska ploscic|\bwall tile|\bwall tiles/.test(surfaceText);
      const hasFloorCovering =
        FLOOR_COVERING_KINDS.has(fidelity.productKind) ||
        (!wallOnlyEvidence && hasExplicitFloorTileEvidence(surfaceText));
      if (!hasMarble) {
        reasons.push("missing_marble_evidence");
      }
      if (!hasFloorCovering) {
        reasons.push("not_floor_covering");
      }
    }
  }

  if (concept === "wall_paint") {
    if (PAINT_CONFLICT_KINDS.has(fidelity.productKind)) {
      reasons.push(fidelity.productKind);
    }
    if (fidelity.productKind === "category_listing") {
      reasons.push("category_listing");
    }
    const hue = requiredPaintHue(requirement);
    const finish = requiredPaintFinish(requirement);
    if (hue && fidelity.hueMatch === "conflict") {
      reasons.push("hue_conflict");
    }
    if (hue && fidelity.hueMatch === "unknown" && fidelity.productKind !== "interior_wall_paint") {
      reasons.push("insufficient_hue_evidence");
    }
    if (finish === "matte" && fidelity.finishMatch === "conflict") {
      reasons.push("matte_conflict");
    }
    if (fidelity.productKind === "decorative_effect_paint") {
      const hasExactHue = hue ? fidelity.hueMatch === "exact" : true;
      const hasExactFinish = finish ? fidelity.finishMatch === "exact" : true;
      if (!hasExactHue || !hasExactFinish) {
        reasons.push("decorative_effect_insufficient_fidelity");
      }
    }
  }

  const uniqueReasons = [...new Set(reasons.filter(Boolean))];
  let hardValid = uniqueReasons.length === 0;

  if (concept === "wall_paint") {
    hardValid = hardValid && fidelity.productKindMatch !== "conflict" && fidelity.hueMatch !== "conflict" && fidelity.finishMatch !== "conflict";
  }

  if (concept === "marble") {
    const surfaceText = surfaceEvidenceText(evidence);
    hardValid =
      hardValid &&
      fidelity.materialMatch !== "conflict" &&
      !TILE_INSTALLATION_KINDS.has(fidelity.productKind) &&
      fidelity.productKind !== "wall_tile" &&
      !titleIsExplicitWallOnlyTile(evidence.title) &&
      (FLOOR_COVERING_KINDS.has(fidelity.productKind) || hasExplicitFloorTileEvidence(surfaceText));
  }

  if (!hardValid && uniqueReasons.length === 0) {
    uniqueReasons.push("insufficient_fidelity");
  }

  return { hardValid, hardGateReasons: uniqueReasons, fidelity };
}
