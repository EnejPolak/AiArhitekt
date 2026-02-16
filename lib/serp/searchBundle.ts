/**
 * Production autopilot: SearchBundle per item (deterministic rules first, optional LLM enhance, validate).
 * No user toggles; always-on.
 */

import { itemSpecToCategory, type TaxonomyCategory } from "./taxonomy";
import {
  itemSpecToKeywords,
  itemSpecToSynonymKeywords,
  itemSpecToRelaxedKeywords,
  stripStoreNamesAndDomainsFromItem,
} from "./queryGen";
import { normalizeDomainToRoot } from "./domains";

/** One search bundle per item: category, keywords, synonyms, negativeKeywords, mustTokens, budget. */
export type SearchBundle = {
  item: string;
  category: TaxonomyCategory;
  keywords: string;
  synonyms: string;
  negativeKeywords: string[];
  mustTokens: string[];
  budget?: number;
};

const HOME_CATEGORIES = new Set<TaxonomyCategory>([
  "bathroom_plumbing",
  "furniture",
  "decor_textiles",
  "lighting",
  "flooring",
  "paint_walls",
]);

/** Negative keywords for home items: exclude tool/mechanic results (mirror -> ceiling light, etc.). */
const NEGATIVE_TOOL_TERMS = [
  "teleskop",
  "telescopic",
  "magnet",
  "orodje",
  "tool",
  "inspection",
  "mechanic",
  "avto",
  "garage",
  "servis",
];

/** Must-hit token rules: if item matches, candidate must contain at least one token. */
const MUST_HIT_RULES: Array<{ pattern: RegExp; tokens: string[] }> = [
  { pattern: /ogledal|mirror/i, tokens: ["ogledal", "mirror", "ogledalo"] },
  { pattern: /preprog|tepih|rug/i, tokens: ["preprog", "tepih", "preproga", "rug"] },
  { pattern: /zaves|zagrinjal|ogrinjal|curtain/i, tokens: ["zaves", "zagrinjal", "ogrinjal", "zavesa", "curtain"] },
];

function getMustTokensForItem(itemSpec: string): string[] {
  const lower = (itemSpec ?? "").toLowerCase();
  for (const { pattern, tokens } of MUST_HIT_RULES) {
    if (pattern.test(lower)) return tokens;
  }
  return [];
}

function getNegativeKeywordsForItem(itemSpec: string, category: TaxonomyCategory): string[] {
  const out: string[] = [];
  const lower = (itemSpec ?? "").toLowerCase();
  const isHome = HOME_CATEGORIES.has(category);
  const hasHomeContext =
    /ogledal|preprog|tepih|zaves|zagrinjal|ogrinjal|kopal|umival|dekor|mirror|rug|curtain/i.test(lower);
  if (isHome && hasHomeContext) {
    out.push(...NEGATIVE_TOOL_TERMS);
  }
  return out;
}

/** Extract budget (max EUR) from spec: "max 50 eur", "do 100 €", "budget 200". */
export function extractBudgetFromSpec(itemSpec: string): number | undefined {
  const lower = (itemSpec ?? "").toLowerCase();
  const maxMatch = /(?:max|do|do\s+\d+)\s*(\d+)\s*(?:eur|€|euro)?/i.exec(lower)
    ?? /(?:budget|max)\s*(\d+)/i.exec(lower)
    ?? /(\d+)\s*(?:eur|€)\s*(?:max|max\.)/i.exec(lower);
  if (maxMatch?.[1]) {
    const n = parseInt(maxMatch[1], 10);
    if (!Number.isNaN(n) && n > 0 && n < 1_000_000) return n;
  }
  return undefined;
}

/**
 * Build SearchBundle from item spec (fast, deterministic). Always run first.
 */
export function rulesBundle(item: string, allowlistDomains: string[] = []): SearchBundle {
  const domainList = allowlistDomains.map(normalizeDomainToRoot).filter(Boolean);
  const category = itemSpecToCategory(item);
  const keywords = itemSpecToKeywords(item, domainList);
  const synonyms = itemSpecToSynonymKeywords(item, domainList);
  const relaxed = itemSpecToRelaxedKeywords(item, domainList);
  const effectiveKeywords = keywords || stripStoreNamesAndDomainsFromItem(item, domainList) || "";
  const effectiveSynonyms = synonyms || relaxed || effectiveKeywords;
  const negativeKeywords = getNegativeKeywordsForItem(item, category);
  const mustTokens = getMustTokensForItem(item);
  const budget = extractBudgetFromSpec(item);

  return {
    item,
    category,
    keywords: effectiveKeywords,
    synonyms: effectiveSynonyms,
    negativeKeywords,
    mustTokens,
    budget,
  };
}

/**
 * Optional LLM enhance: one batch call over bundles. Returns enhanced bundles;
 * caller must run validateBundle() after so hard rules (category, mustTokens) are enforced.
 * Stub: returns bundles as-is when OPENAI not used.
 */
export async function llmEnhanceBundles(bundles: SearchBundle[]): Promise<SearchBundle[]> {
  if (!bundles?.length) return [];
  return bundles;
}

/**
 * Validate bundle: hard-rule override + sanity checks. LLM cannot override rules.
 * Returns validated bundle (category/mustTokens from rules; keywords/synonyms trimmed).
 */
export function validateBundle(
  bundle: Partial<SearchBundle> & { item: string },
  allowlistDomains: string[] = []
): SearchBundle {
  const fromRules = rulesBundle(bundle.item, allowlistDomains);
  const category = fromRules.category;
  const mustTokens = fromRules.mustTokens.length > 0 ? fromRules.mustTokens : (bundle.mustTokens ?? []);
  const keywords =
    typeof bundle.keywords === "string" && bundle.keywords.trim().length > 0
      ? bundle.keywords.trim().slice(0, 500)
      : fromRules.keywords;
  const synonyms =
    typeof bundle.synonyms === "string" && bundle.synonyms.trim().length > 0
      ? bundle.synonyms.trim().slice(0, 500)
      : fromRules.synonyms;
  const negativeKeywords = Array.isArray(bundle.negativeKeywords)
    ? [...new Set([...fromRules.negativeKeywords, ...bundle.negativeKeywords])].slice(0, 20)
    : fromRules.negativeKeywords;
  const budget =
    typeof bundle.budget === "number" && bundle.budget > 0 && bundle.budget < 1_000_000
      ? bundle.budget
      : fromRules.budget;

  return {
    item: bundle.item,
    category,
    keywords,
    synonyms,
    negativeKeywords,
    mustTokens,
    budget,
  };
}
