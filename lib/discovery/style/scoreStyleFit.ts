import { normalizeMatchText, containsToken } from "@/lib/text/diacritics";
import type { ProductConcept } from "../locales/types";
import type { SearchLocale } from "../locales/types";
import { STYLE_NEUTRAL_SCORE } from "./constants";
import { STYLE_PROFILES } from "./profiles";
import type { CanonicalStyleId, StyleFitResult, StyleProfile, StyleRankingInput, StyleSignalGroup } from "./types";

const GROUP_WEIGHTS = {
  positive: 0.28,
  materials: 0.18,
  colors: 0.12,
  forms: 0.18,
  negative: 0.35,
} as const;

function groupApplies(group: StyleSignalGroup, concept: ProductConcept): boolean {
  if (!group.concepts || group.concepts.length === 0) return true;
  return group.concepts.includes(concept);
}

function termsForLocale(group: StyleSignalGroup, locale: SearchLocale): string[] {
  const sl = group.terms.sl;
  const en = group.terms.en;
  return locale === "sl" ? [...sl, ...en] : [...en, ...sl];
}

function matchTerms(haystack: string, terms: string[]): string[] {
  const matched: string[] = [];
  for (const term of terms) {
    const folded = normalizeMatchText(term);
    if (!folded || folded.length < 2) continue;
    if (containsToken(haystack, folded)) matched.push(term);
  }
  return matched;
}

function scoreOneStyle(
  haystack: string,
  styleId: CanonicalStyleId,
  locale: SearchLocale,
  concept: ProductConcept
): { partial: number; matched: string[]; conflicts: string[] } {
  const profile: StyleProfile = STYLE_PROFILES[styleId];
  const matched: string[] = [];
  const conflicts: string[] = [];

  let score = 0;
  const groups: Array<keyof Pick<StyleProfile, "positive" | "materials" | "colors" | "forms" | "negative">> = [
    "positive",
    "materials",
    "colors",
    "forms",
    "negative",
  ];

  for (const groupName of groups) {
    const group = profile[groupName];
    if (!groupApplies(group, concept)) continue;
    const hits = matchTerms(haystack, termsForLocale(group, locale));
    if (hits.length === 0) continue;
    if (groupName === "negative") {
      conflicts.push(...hits);
      score -= Math.min(0.55, GROUP_WEIGHTS.negative * hits.length);
    } else {
      matched.push(...hits);
      score += Math.min(0.45, GROUP_WEIGHTS[groupName] * hits.length);
    }
  }

  return {
    partial: Math.max(0, Math.min(1, score)),
    matched,
    conflicts,
  };
}

export function buildStyleEvidenceText(input: StyleRankingInput["evidence"]): string {
  let slug = "";
  if (input.url) {
    try {
      slug = new URL(input.url).pathname.replace(/[-_/]+/g, " ");
    } catch {
      slug = "";
    }
  }
  return normalizeMatchText(`${input.title} ${input.snippet ?? ""} ${slug}`);
}

export function scoreStyleFit(input: StyleRankingInput): StyleFitResult {
  const { selectedStyles, locale, concept, requirementType, evidence } = input;
  if (requirementType !== "furniture" || selectedStyles.length === 0) {
    return {
      selectedStyles: [],
      score: STYLE_NEUTRAL_SCORE,
      matchedSignals: [],
      conflictingSignals: [],
      neutral: true,
    };
  }

  const haystack = buildStyleEvidenceText(evidence);
  const perStyle = selectedStyles.map((styleId) => scoreOneStyle(haystack, styleId, locale, concept));
  const matchedSignals = [...new Set(perStyle.flatMap((item) => item.matched))];
  const conflictingSignals = [...new Set(perStyle.flatMap((item) => item.conflicts))];

  if (matchedSignals.length === 0 && conflictingSignals.length === 0) {
    return {
      selectedStyles,
      score: STYLE_NEUTRAL_SCORE,
      matchedSignals: [],
      conflictingSignals: [],
      neutral: true,
    };
  }

  const avgPartial =
    perStyle.reduce((sum, item) => sum + item.partial, 0) / Math.max(1, perStyle.length);
  const alignedStyles = perStyle.filter((item) => item.partial >= 0.22).length;
  const multiStyleBonus = selectedStyles.length > 1 && alignedStyles >= 2 ? 0.12 : 0;
  const conflictPenalty = Math.min(0.45, conflictingSignals.length * 0.12);
  const raw = avgPartial + multiStyleBonus - conflictPenalty;
  const score = Math.max(0, Math.min(1, raw));

  return {
    selectedStyles,
    score,
    matchedSignals,
    conflictingSignals,
    neutral: false,
  };
}
