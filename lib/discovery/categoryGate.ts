import type { SearchableRequirement } from "./itemSpecs";
import type { MaterialNeed } from "./itemSpecs";
import { evaluateCandidateHardGate } from "./fidelity/requirementFidelity";
import { resolveProductConcept } from "./locales/concepts";
import { normalizeMatchText, containsAnyToken, containsToken } from "@/lib/text/diacritics";
import { classifyCandidateProductKind } from "./fidelity/productKind";

export type CandidateEvidence = {
  title: string;
  snippet?: string | null;
  url?: string | null;
};

function normalizeEvidence(input: CandidateEvidence | string): CandidateEvidence {
  if (typeof input === "string") return { title: input };
  return input;
}

function evidenceText(evidence: CandidateEvidence): { haystack: string; title: string } {
  const title = normalizeMatchText(evidence.title);
  const haystack = normalizeMatchText(`${evidence.title} ${evidence.snippet ?? ""}`);
  return { haystack, title };
}

const OLIVE_TOKENS = ["olive", "olivn", "olivno"];
const DARK_GREEN_TOKENS = ["dark green", "temno zelen", "temnozelen"];
const GENERIC_GREEN_TOKENS = ["green", "zelen", "zelena", "zeleni"];
const BLACK_TOKENS = ["black", "crn", "crna", "crni"];
const WHITE_TOKENS = ["white", "bel", "bela", "beli"];
const GLOSS_TOKENS = ["gloss", "glossy", "sijaj", "sijajna", "sijajni", "sijajno"];
const MATTE_TOKENS = ["matte", "matt", "mat", "matna", "matni", "matno", "matirana", "matiran"];
const TINTABLE_TOKENS = ["tintable", "niansiran", "odtenek", "color system", "barvni sistem"];

function containsAny(haystack: string, tokens: string[]): boolean {
  return containsAnyToken(haystack, tokens);
}

function matchesAny(haystack: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(haystack));
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

function hueEvidenceSupported(hue: string, haystack: string, title: string): boolean {
  if (titleConflictsWithHue(title, hue)) return false;

  if (hue === "olive-green") {
    if (containsAny(haystack, OLIVE_TOKENS)) return true;
    if (containsAny(haystack, DARK_GREEN_TOKENS)) return false;
    if (containsAny(haystack, GENERIC_GREEN_TOKENS)) return true;
    return false;
  }

  if (hue === "dark-green") {
    if (containsAny(haystack, DARK_GREEN_TOKENS)) return true;
    if (containsAny(haystack, OLIVE_TOKENS)) return false;
    if (containsAny(haystack, GENERIC_GREEN_TOKENS)) return true;
    return false;
  }

  if (hue === "black") {
    if (containsAny(haystack, BLACK_TOKENS)) return true;
    if (containsAny(title, BLACK_TOKENS)) return true;
    return false;
  }

  if (hue === "white" && containsAny(haystack, WHITE_TOKENS)) return true;
  if (hue === "green" && containsAny(haystack, GENERIC_GREEN_TOKENS)) return true;

  const tokens = normalizeMatchText(hue)
    .split(/[\s-]+/)
    .filter((token) => token.length >= 3);
  return tokens.some((token) => haystack.includes(token));
}

function finishEvidenceSupported(finish: string | null, haystack: string, title: string): boolean {
  if (!finish) return true;
  if (finish === "matte") {
    if (/metallic|metalik|metalic/.test(haystack) || /metallic|metalik|metalic/.test(title)) {
      return false;
    }
    if (containsAny(title, GLOSS_TOKENS) || containsAny(haystack, GLOSS_TOKENS)) return false;
    return containsAny(haystack, MATTE_TOKENS) || containsToken(haystack, "mat") || containsAny(title, MATTE_TOKENS);
  }
  if (finish === "gloss") {
    return containsAny(haystack, GLOSS_TOKENS) || containsAny(title, GLOSS_TOKENS);
  }
  if (finish === "metallic") {
    return /metallic|metalik|metalic/.test(haystack);
  }
  return true;
}

function tintableHueSupported(hue: string, haystack: string, title: string): boolean {
  if (!containsAny(haystack, TINTABLE_TOKENS)) return false;
  if (titleConflictsWithHue(title, hue)) return false;
  if (hue === "black") {
    return containsAny(haystack, BLACK_TOKENS);
  }
  if (hue === "olive-green") {
    return containsAny(haystack, OLIVE_TOKENS);
  }
  return hueEvidenceSupported(hue, haystack, title);
}

function matchesWallPaint(requirement: SearchableRequirement, haystack: string, title: string): boolean {
  if (!matchesAny(haystack, [/\bpaint\b/, /\bbarva\b/, /\bpremaz\b/, /\bcoating\b/, /plesk/, /zidna/, /stenska/])) {
    return false;
  }

  const hue = requiredPaintHue(requirement);
  const finish = requiredPaintFinish(requirement);
  if (!hue) return true;

  if (hueEvidenceSupported(hue, haystack, title)) {
    return finishEvidenceSupported(finish, haystack, title);
  }

  if (tintableHueSupported(hue, haystack, title)) {
    return finishEvidenceSupported(finish, haystack, title);
  }

  return false;
}

function furnitureMatches(
  concept: ReturnType<typeof resolveProductConcept>,
  haystack: string,
  evidence: CandidateEvidence
): boolean {
  const productKind = classifyCandidateProductKind(evidence);
  switch (concept) {
    case "gaming_chair":
      if (
        matchesAny(haystack, [
          /palicic/,
          /chopstick/,
          /sedezn/,
          /\bsofa\b/,
          /\bcouch\b/,
          /\bdesk\b/,
          /\bmiza\b/,
          /pisarnisk/,
          /jediln/,
          /barsk/,
          /\bomara\b/,
          /wardrobe/,
          /garderob/,
          /kopalnisk/,
          /\bcabinet\b/,
          /\bskatl/,
          /kapsul/,
          /\bkavo\b/,
          /\bcoffee\b/,
        ])
      ) {
        return false;
      }
      if (productKind === "gaming_chair") return true;
      if (productKind !== "unknown") return false;
      return (
        /gaming\s+stol|gaming\s+chair|igricarsk|igralni\s+stol/.test(haystack) ||
        ((/\bstol\b|\bchair\b|sedez/.test(haystack) || /ergonom/.test(haystack)) &&
          /gaming|igric|igraln|gamer/.test(haystack))
      );
    case "desk":
      if (
        matchesAny(haystack, [
          /\bstol\b/,
          /\bchair\b/,
          /sedezn/,
          /\bkavc\b/,
          /\bsofa\b/,
          /\bcouch\b/,
          /postelj/,
          /\bbed\b/,
          /\bomara\b/,
          /kopalnisk/,
          /\bskatl/,
          /kapsul/,
          /\bkavo\b/,
        ]) &&
        !matchesAny(haystack, [/\bdesk\b/, /workstation/, /pisalna miza/, /racunalniska miza/, /\bmiza\b/, /gaming miza/])
      ) {
        return false;
      }
      if (productKind === "desk") return true;
      if (productKind !== "unknown" && productKind !== "gaming_chair") return false;
      return matchesAny(haystack, [
        /\bdesk\b/,
        /workstation/,
        /pisalna miza/,
        /racunalniska miza/,
        /gaming miza/,
        /\bmiza\b/,
      ]);
    case "office_chair":
      if (
        matchesAny(haystack, [/palicic/, /chopstick/, /sedezn/, /\bkavc\b/, /\bsofa\b/, /\bcouch\b/, /\bdesk\b/, /workstation/, /gaming/])
      ) {
        return false;
      }
      if (/\bmiza\b/.test(haystack) && !/\bstol\b|\bchair\b/.test(haystack)) return false;
      return (
        /office chair/.test(haystack) ||
        /pisarnisk/.test(haystack) ||
        (/racunalnisk/.test(haystack) && /\bstol\b|\bchair\b/.test(haystack)) ||
        (/ergonom/.test(haystack) && /\bstol\b|\bchair\b/.test(haystack)) ||
        (/\bstol\b|\bchair\b/.test(haystack) && /pisarn|office|racunal/.test(haystack))
      );
    case "chair":
      if (matchesAny(haystack, [/palicic/, /chopstick/, /sedezn/, /\bsofa\b/, /\bdesk\b/, /\bmiza\b/, /gaming/])) {
        return false;
      }
      return /\bstol\b|\bchair\b/.test(haystack);
    case "sofa":
      return matchesAny(haystack, [/\bsofa\b/, /\bcouch\b/, /sedezn/, /\bkavc\b/]);
    case "coffee_table":
      return /coffee table|klubsk/.test(haystack) || (/\bmiza\b/.test(haystack) && /klubsk|coffee/.test(haystack));
    case "bed":
      return /\bbed\b|postelj/.test(haystack);
    case "wardrobe":
      return /wardrobe|storage|garderob|omara/.test(haystack);
    case "lighting":
      return /lamp|\blight|svetil|\bluc\b/.test(haystack);
    case "reading_chair":
      return /reading\s+chair|naslanjac|\bchair\b|\bstol\b/.test(haystack) && !/\bsofa\b|\bdesk\b/.test(haystack);
    case "dining_chair":
      return /dining\s+chair|jediln/.test(haystack) || (/\bchair\b|\bstol\b/.test(haystack) && /dining|jediln/.test(haystack));
    case "dining_table":
      return /dining\s+table|jediln\w*\s+miz/.test(haystack);
    case "bedside":
      return /bedside|nightstand|nocn/.test(haystack);
    case "storage":
      return /storage|predalnik|sideboard|komod/.test(haystack);
    case "tv_console":
      return /tv\s+(?:unit|console|stand|cabinet)|media\s+unit/.test(haystack);
    case "rug":
      return /\brug\b|\bcarpet\b|preproga/.test(haystack);
    case "window_treatment":
      return /curtain|drape|zaves|window\s+treatment/.test(haystack);
    default:
      return true;
  }
}

function materialMatchesLegacy(
  concept: ReturnType<typeof resolveProductConcept>,
  requirement: SearchableRequirement,
  evidence: CandidateEvidence
): boolean {
  const { haystack, title } = evidenceText(evidence);
  if (concept === "wall_paint") {
    if (!matchesWallPaint(requirement, haystack, title)) return false;
  }
  return evaluateCandidateHardGate(requirement, evidence).hardValid;
}

export { evaluateCandidateHardGate } from "./fidelity/requirementFidelity";
export { classifyCandidateProductKind } from "./fidelity/productKind";
export type { RequirementFidelity, HardGateResult } from "./fidelity/requirementFidelity";

export function candidateMatchesRequirement(
  requirement: SearchableRequirement,
  evidenceInput: CandidateEvidence | string
): boolean {
  const evidence = normalizeEvidence(evidenceInput);
  const { haystack, title } = evidenceText(evidence);
  if (!haystack && !title) return false;
  const concept = resolveProductConcept(requirement);
  if (requirement.requirementType === "furniture") {
    return furnitureMatches(concept, haystack, evidence);
  }
  return materialMatchesLegacy(concept, requirement, evidence);
}
