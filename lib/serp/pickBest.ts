/**
 * Ranking/picking module for SERP results (per item spec).
 */

import { normalizeDomain } from "./domains";

export type SerpOrganicResult = {
  title: string;
  link: string;
  snippet?: string;
  price?: string;
  image?: string;
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
};

export const PICK_SCORE_THRESHOLD = 25;

const GENERIC_TITLE_SNIPPETS = [
  "kuhinjski stoli",
  "jedilni stoli",
  "jedilni stoli za vsak dom",
];

const CATEGORY_PATTERNS = [
  /\/c\//i,
  /-C\d+/i,
  /\?p=\d+/i,
  /\/kategorija\//i,
  /\/category\//i,
  /\/jedilni-stoli/i,
];

const PRODUCT_MARKERS = [
  /\/p\//i,
  /\/product\//i,
  /\/izdelek\//i,
  /\/artikel\//i,
  /\/item\//i,
  /\/\d{8,}(\b|\/|$)/,
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
  const best = scored[0];
  const topCandidates = scored.slice(0, maxCandidates).map((s) => ({
    title: s.result.title,
    url: s.result.link,
    snippet: s.result.snippet,
    score: s.score,
  }));

  if (!best || best.score < PICK_SCORE_THRESHOLD) {
    return { picked: null, topCandidates };
  }

  const confidence = Math.max(0, Math.min(1, best.score / 100));
  return {
    picked: {
      title: best.result.title,
      url: best.result.link,
      snippet: best.result.snippet,
      price: best.result.price,
      image: best.result.image,
      domain: normalizeDomain(best.result.link),
      score: best.score,
      confidence,
      reasons: best.reasons,
    },
    topCandidates,
  };
}
