/**
 * Ranking/picking module for SERP results (per item spec).
 */

import { normalizeDomainToRoot } from "./domains";

export type SerpOrganicResult = {
  title: string;
  link: string;
  snippet?: string;
  price?: string;
  image?: string;
  /** From SerpAPI rich_snippet or other fields */
  richSnippetPrice?: string;
};

/** Normalized price for API response (unit from enrich: item | m2 | from | set) */
export type PriceValue = { value: number; currency: "EUR"; unit?: "item" | "m2" | "from" | "set" };

/** Flags for GPT pick: avoid tool mirrors for home items */
export type CandidateFlags = {
  isProductLikeUrl: boolean;
  isCategoryLikeUrl: boolean;
  hasToolIntent: boolean;
  hasHomeIntent: boolean;
};

/** One candidate in topCandidates list (for SERP response + GPT pick) */
export type TopCandidateWithFlags = {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  price?: PriceValue | null;
  image?: string | null;
  score: number;
  flags: CandidateFlags;
};

export type PickedResult = {
  title: string;
  url: string;
  snippet?: string;
  price?: string;
  image?: string;
  domain: string;
  score: number;
  confidence: number;
  reasons: string[];
};

export type RankedCandidate = {
  title: string;
  url: string;
  snippet?: string;
  score: number;
  reasons?: string[];
};

export const PICK_SCORE_THRESHOLD = 25;

const GENERIC_TITLE_SNIPPETS = [
  "kuhinjski stoli",
  "jedilni stoli",
  "jedilni stoli za vsak dom",
  "kuhinjske pipe",
  "jedilni stoli",
  "kategorij",
  "izberi",
  "pregled",
];

const CATEGORY_PATTERNS = [
  /\/c\//i,
  /\/search/i,
  /\/isci/i,
  /-C\d+/i,
  /\?p=\d+/i,
  /\?.*(search|q=|query=)/i,
  /\/kategorija\//i,
  /\/category\//i,
  /\/jedilni-stoli/i,
  /\/kuhinjske-pipe/i,
];

const PRODUCT_MARKERS = [
  /\/p\//i,
  /\/product\//i,
  /\/productdetail\//i,
  /\/izdelek\//i,
  /\/artikel\//i,
  /\/item\//i,
  /\/sku\//i,
  /\/shop\//i,
  /\/prodaja\//i,
  /\/\d{8,}(\b|\/|$)/,
  /[?&]id=\d{6,}/i,
  /-\d{6,}(\.html|\/|$)/i,
];

const diacriticsMap: Record<string, string> = {
  č: "c",
  ć: "c",
  đ: "d",
  š: "s",
  ž: "z",
  Č: "c",
  Ć: "c",
  Đ: "d",
  Š: "s",
  Ž: "z",
};

function normalizeText(text: string): string {
  let normalized = text.toLowerCase();
  for (const [diacritic, replacement] of Object.entries(diacriticsMap)) {
    normalized = normalized.replace(new RegExp(diacritic, "g"), replacement);
  }
  return normalized;
}

function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  return normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function hasCategorySignals(url: string): boolean {
  return CATEGORY_PATTERNS.some((pattern) => pattern.test(url));
}

function hasProductSignals(url: string): boolean {
  return PRODUCT_MARKERS.some((pattern) => pattern.test(url));
}

/** URL/title/snippet patterns that indicate TOOL intent (telescopic mirror, magnet, etc.) — reject for home mirror/decor. */
const TOOL_INTENT_PATTERNS = [
  /teleskop/i,
  /telescopic/i,
  /magnet/i,
  /orodje/i,
  /tools?\//i,
  /\/orodje\//i,
  /inspection\s*mirror/i,
  /mechanic/i,
  /avto\s*servis/i,
  /garage/i,
];

/** Title/snippet patterns that indicate HOME intent (bathroom mirror, wall, LED). */
const HOME_INTENT_PATTERNS = [
  /kopal/i,
  /stensk/i,
  /umival/i,
  /led\b/i,
  /bathroom/i,
  /wall\s*mirror/i,
  /ogledal/i,
  /dekor/i,
  /pohištv/i,
  /furniture/i,
];

function hasToolIntent(url: string, title: string, snippet: string): boolean {
  const combined = `${url} ${title} ${snippet}`.toLowerCase();
  return TOOL_INTENT_PATTERNS.some((p) => p.test(combined));
}

function hasHomeIntent(title: string, snippet: string): boolean {
  const combined = `${title} ${snippet}`.toLowerCase();
  return HOME_INTENT_PATTERNS.some((p) => p.test(combined));
}

function hasPriceSignals(text: string): boolean {
  return /(€|EUR)\s*\d+[,.]?\d*/i.test(text) || /\d+[,.]\d{2}\s*(€|EUR)/i.test(text);
}

function isGenericTitle(title: string): boolean {
  const normalized = normalizeText(title);
  return GENERIC_TITLE_SNIPPETS.some((snippet) => normalized.includes(snippet));
}

function getTokenOverlapScore(
  tokens: string[],
  haystack: string
): { score: number; matched: number } {
  if (tokens.length === 0) return { score: 0, matched: 0 };
  const normalizedHaystack = normalizeText(haystack);
  let matched = 0;
  for (const token of tokens) {
    if (normalizedHaystack.includes(token)) matched++;
  }
  const ratio = matched / tokens.length;
  const score = Math.round(ratio * 25);
  return { score, matched };
}

export function rankCandidates(
  itemTokens: string[],
  results: SerpOrganicResult[]
): Array<{ result: SerpOrganicResult; score: number; reasons: string[] }> {
  const scored: Array<{ result: SerpOrganicResult; score: number; reasons: string[] }> = [];

  for (const result of results) {
    const url = result.link || "";
    const title = result.title || "";
    const snippet = result.snippet || "";
    const combined = `${title} ${snippet}`.trim();

    let score = 0;
    const reasons: string[] = [];

    if (hasProductSignals(url)) {
      score += 40;
      reasons.push("+40: URL product marker");
    }
    if (hasCategorySignals(url)) {
      score -= 30;
      reasons.push("-30: URL category/listing marker");
    }
    if (hasPriceSignals(combined)) {
      score += 10;
      reasons.push("+10: Title/snippet contains price");
    }

    const overlap = getTokenOverlapScore(itemTokens, combined);
    if (overlap.score > 0) {
      score += overlap.score;
      reasons.push(`+${overlap.score}: Token overlap (${overlap.matched}/${itemTokens.length})`);
    }

    if (isGenericTitle(title)) {
      score -= 15;
      reasons.push("-15: Generic title");
    }

    scored.push({ result, score, reasons });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function pickBestCandidate(
  itemTokens: string[],
  results: SerpOrganicResult[],
  maxCandidates: number
): { picked: PickedResult | null; topCandidates: RankedCandidate[] } {
  if (!results || results.length === 0) {
    return { picked: null, topCandidates: [] };
  }

  const scored = rankCandidates(itemTokens, results);
  const topCandidates = scored.slice(0, Math.max(maxCandidates, 5)).map((s) => ({
    title: s.result.title,
    url: s.result.link,
    snippet: s.result.snippet,
    score: s.score,
    reasons: s.reasons,
  }));

  const best = scored[0];
  if (!best) return { picked: null, topCandidates };

  const productLike = scored.filter((s) => hasProductSignals(s.result.link));
  const bestProduct = productLike[0];

  if (bestProduct && bestProduct.score >= PICK_SCORE_THRESHOLD) {
    const confidence = Math.max(0, Math.min(1, bestProduct.score / 100));
    return {
      picked: {
        title: bestProduct.result.title,
        url: bestProduct.result.link,
        snippet: bestProduct.result.snippet,
        price: bestProduct.result.price,
        image: bestProduct.result.image,
        domain: normalizeDomainToRoot(bestProduct.result.link),
        score: bestProduct.score,
        confidence,
        reasons: bestProduct.reasons,
      },
      topCandidates,
    };
  }

  // Always return best candidate as fallback (link better than null for debug).
  const reasons = [...best.reasons, "fallback_non_product_page"];
  return {
    picked: {
      title: best.result.title,
      url: best.result.link,
      snippet: best.result.snippet,
      price: best.result.price,
      image: best.result.image,
      domain: normalizeDomainToRoot(best.result.link),
      score: best.score,
      confidence: 0.2,
      reasons,
    },
    topCandidates,
  };
}

/** Get flags for one candidate (for GPT pick: reject tool-intent for home items). */
export function getCandidateFlags(result: SerpOrganicResult): CandidateFlags {
  const url = result.link || "";
  const title = result.title || "";
  const snippet = result.snippet || "";
  return {
    isProductLikeUrl: hasProductSignals(url),
    isCategoryLikeUrl: hasCategorySignals(url),
    hasToolIntent: hasToolIntent(url, title, snippet),
    hasHomeIntent: hasHomeIntent(title, snippet),
  };
}

/** Return top N candidates with score and flags (price filled by caller). Max 2 per domain for diversity. */
export function getTopCandidatesWithFlags(
  itemTokens: string[],
  results: SerpOrganicResult[],
  maxCount: number,
  priceFn: (r: SerpOrganicResult) => { value: number; currency: "EUR"; unit?: "item" | "m2" | "from" | "set" } | null
): TopCandidateWithFlags[] {
  if (!results?.length) return [];
  const scored = rankCandidates(itemTokens, results);
  const byDomain = new Map<string, typeof scored>();
  for (const s of scored) {
    const d = normalizeDomainToRoot(s.result.link) || "_";
    const list = byDomain.get(d) ?? [];
    if (list.length < 2) list.push(s);
    byDomain.set(d, list);
  }
  const diversified: typeof scored = [];
  for (const [, list] of byDomain) {
    diversified.push(...list);
  }
  diversified.sort((a, b) => b.score - a.score);
  const top = diversified.slice(0, maxCount);
  return top.map((s) => {
    const domain = normalizeDomainToRoot(s.result.link);
    const price = priceFn(s.result);
    return {
      title: s.result.title,
      url: s.result.link,
      domain: domain || "",
      snippet: s.result.snippet,
      price: price ?? null,
      image: s.result.image ?? null,
      score: s.score,
      flags: getCandidateFlags(s.result),
    };
  });
}
