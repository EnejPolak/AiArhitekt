/**
 * Generate SERP queries from item specs (no store names in item text).
 * Each query is site:domain + keywords; domains come from allowlist only.
 */

import { normalizeDomain } from "./domains";

const STOPWORDS = new Set([
  "in",
  "ali",
  "za",
  "na",
  "v",
  "z",
  "pri",
  "od",
  "do",
  "the",
  "and",
  "or",
  "a",
  "an",
  "for",
  "with",
  "max",
  "min",
  "to",
]);

const diacriticsMap: Record<string, string> = {
  č: "c", ć: "c", đ: "d", š: "s", ž: "z",
  Č: "c", Ć: "c", Đ: "d", Š: "s", Ž: "z",
};

function normalizeText(text: string): string {
  let s = text.toLowerCase().trim();
  for (const [d, r] of Object.entries(diacriticsMap)) {
    s = s.replace(new RegExp(d, "g"), r);
  }
  s = s.replace(/[^\w\s.x€]/g, " ");
  return s;
}

/**
 * Normalize item spec to search keywords: lowercase, remove stopwords,
 * keep sizes (120x160, 60 cm), numbers, and meaningful tokens.
 */
export function itemSpecToKeywords(item: string, allowlistDomains: string[] = []): string {
  const normalized = normalizeText(item);
  const tokens: string[] = [];
  const parts = normalized.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const domainTokens = new Set(
    allowlistDomains
      .map(normalizeDomain)
      .filter(Boolean)
      .flatMap((d) => [d, d.split(".")[0]])
  );

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    if (!raw) continue;
    const t = raw.replace(/[^\w.x]/g, "");
    if (!t) continue;
    if (domainTokens.has(t)) continue;
    if (STOPWORDS.has(t)) continue;
    if (t.length === 1 && !/^\d$/.test(t)) continue;

    const next = parts[i + 1]?.replace(/[^\w]/g, "") ?? "";
    if (/^\d+[,.]?\d*$/.test(t) && /^(cm|mm|m)$/i.test(next)) {
      tokens.push(t.replace(",", "."));
      tokens.push(next.toLowerCase());
      i += 1;
      continue;
    }

    if (/^\d+[,.]?\d*$/.test(t)) {
      tokens.push(t.replace(",", "."));
      continue;
    }
    if (/^\d+x\d+$/i.test(t)) {
      tokens.push(t.toLowerCase());
      continue;
    }
    if (t.length >= 2) tokens.push(t);
  }

  return tokens.join(" ");
}

export type PlannedItemQueries = { item: string; queries: string[] };

/**
 * Build planned queries per item: site:domain + keywords for each domain.
 * Budget: totalRequests = min(maxRequests, items.length * min(domains.length, 2)).
 * Uses up to 2 domains per item; flattens to a list of (item, query) to execute.
 */
export function buildPlannedQueries(
  items: string[],
  allowlistDomains: string[]
): { planned: PlannedItemQueries[]; flat: Array<{ item: string; query: string }> } {
  const domains = [...new Set(allowlistDomains.map(normalizeDomain).filter(Boolean))];
  const maxDomainsPerItem = Math.min(domains.length, 2);
  const planned: PlannedItemQueries[] = [];
  const flat: Array<{ item: string; query: string }> = [];

  for (const item of items) {
    const keywords = itemSpecToKeywords(item, domains);
    if (!keywords) {
      planned.push({ item, queries: [] });
      continue;
    }
    const itemQueries: string[] = [];
    for (let i = 0; i < maxDomainsPerItem && i < domains.length; i++) {
      const q = `site:${domains[i]} ${keywords}`;
      itemQueries.push(q);
      flat.push({ item, query: q });
    }
    planned.push({ item, queries: itemQueries });
  }

  return {
    planned,
    flat,
  };
}
