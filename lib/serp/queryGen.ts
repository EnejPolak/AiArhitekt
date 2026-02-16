/**
 * Generate SERP queries from item specs (no store names in item text).
 * Each query is site:domain + keywords; domains come from allowlist only.
 * Items are treated as pure specs: store names and domain tokens are stripped.
 */

import crypto from "crypto";
import { normalizeDomainToRoot } from "./domains";
import { itemSpecToCategory, type TaxonomyCategory } from "./taxonomy";

const MAX_DOMAINS_PER_ITEM = 4;

function stableHash(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex");
}

/** Deterministic order by (item + domain) for retailer diversity. */
function stableShuffleSort(item: string, domains: string[]): string[] {
  return [...domains].sort((a, b) => {
    const ha = stableHash(`${item}::${a}`);
    const hb = stableHash(`${item}::${b}`);
    return ha.localeCompare(hb);
  });
}

/** Split candidates into preferred (in order) and rest. */
function applyPreferredSplit(
  candidates: string[],
  preferred: string[]
): { pref: string[]; rest: string[] } {
  if (!preferred?.length) return { pref: [], rest: candidates };
  const seen = new Set<string>();
  const pref: string[] = [];
  for (const p of preferred) {
    const d = normalizeDomainToRoot(p);
    if (d && candidates.includes(d) && !seen.has(d)) {
      seen.add(d);
      pref.push(d);
    }
  }
  const rest = candidates.filter((d) => !seen.has(d));
  return { pref, rest };
}

/** Store/brand names that must never appear in search keywords (user must not type stores) */
const STORE_NAME_TOKENS = new Set([
  "merkur", "lesnina", "jysk", "obi", "bauhaus", "xxxl", "momax", "harvey", "norman",
  "sam", "termo", "nova", "mega", "keramika", "pevec", "hofer", "lidl", "spar",
  "interspar", "mercator", "tuš", "tus", "bigbang", "eurospin", "dm", "müller",
]);

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

/** Noise tokens that break or drift search (pricing, units, generic). Do not use in queries. */
const NOISE_TOKENS = new Set([
  "max", "min", "eur", "€", "m2", "l", "cm", "mm", "m", "x",
  "eur/m2", "/m2", "10l", "5l", "2l", "1l", "25l", "15l",
]);

/** Color-like tokens to strip for relaxed query (reduce drift to seasonal/other). */
const COLOR_TOKENS = new Set([
  "bela", "bel", "white", "black", "crna", "siva", "gray", "grey",
  "brown", "rjava", "wood", "les", "natural", "naravna",
  "advent", "adventni", "vencki", "venec", "christmas", "seasonal",
]);

/**
 * Slovenian synonym map: key phrase (normalized) -> additional tokens to boost relevance.
 * Applied so paint specs don't drift; bed cover/rug get fallback hits.
 */
const SYNONYM_ADDITIONS: Array<{ pattern: RegExp; extra: string[] }> = [
  { pattern: /stropn|osvetlit|plafon|strop/i, extra: ["stropna svetilka", "plafonjera"] },
  { pattern: /stensk|barv|sten|plesk|paint|wall/i, extra: ["notranja barva", "barva za stene"] },
  { pattern: /keramik|ploscic|tile/i, extra: ["ploščice", "talne ploščice", "stenske ploščice"] },
  { pattern: /sanitar|kopalnic|bathroom/i, extra: ["sanitarna oprema"] },
  { pattern: /tepih|preprog/i, extra: ["preproga", "tepih"] },
  { pattern: /pregrinjal|postelj|odej/i, extra: ["posteljno pregrinjalo", "odeja", "pregrinjalo"] },
  { pattern: /nocn|omaric|nightstand/i, extra: ["nočna omarica", "nightstand"] },
  // Window coverings: "Ogrinjalo za okno" etc. → expand with standard terms so SERP finds curtains
  { pattern: /ogrinjal|zaves|zagrinjal/i, extra: ["zavesa", "zagrinjalo", "ogrinjalo"] },
];

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
 * Strip store names and domain-like tokens from item; return pure spec for search.
 * Used so SERP never uses user-typed store names in queries.
 */
export function stripStoreNamesAndDomainsFromItem(item: string, allowlistDomains: string[] = []): string {
  const normalized = normalizeText(item);
  const domainTokens = new Set(
    allowlistDomains
      .map(normalizeDomainToRoot)
      .filter(Boolean)
      .flatMap((d) => [d, d.split(".")[0]])
  );
  const parts = normalized.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const raw of parts) {
    const t = raw.replace(/[^\w.x]/g, "");
    if (!t) continue;
    if (domainTokens.has(t)) continue;
    if (STORE_NAME_TOKENS.has(t)) continue;
    kept.push(raw);
  }
  return kept.join(" ").trim();
}

/** Returns true if token looks like price/unit noise (e.g. 120, 10L). Keep size context: 60 x, 60 cm. */
function isNoiseToken(t: string, next: string): boolean {
  const lower = t.toLowerCase();
  if (NOISE_TOKENS.has(lower)) return true;
  if (/^\d+l$/i.test(t) || /^\d+\.?\d*l$/i.test(t)) return true;
  if (lower === "x" && !/^\d+$/.test(next)) return true;
  if (/^\d+[,.]?\d*$/.test(t)) {
    if (/^(x|cm|mm|m)$/i.test(next)) return false;
    return true;
  }
  return false;
}

/**
 * Normalize item spec to search keywords: lowercase, remove stopwords, store/domain tokens, and noise (max, €, m2, units).
 * Keeps meaningful nouns/adjectives and size only when unambiguous (e.g. 60x60, 60 cm).
 */
export function itemSpecToKeywords(item: string, allowlistDomains: string[] = []): string {
  const spec = stripStoreNamesAndDomainsFromItem(item, allowlistDomains);
  const normalized = normalizeText(spec);
  const tokens: string[] = [];
  const parts = normalized.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const domainTokens = new Set(
    allowlistDomains
      .map(normalizeDomainToRoot)
      .filter(Boolean)
      .flatMap((d) => [d, d.split(".")[0]])
  );

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    if (!raw) continue;
    const t = raw.replace(/[^\w.x]/g, "");
    if (!t) continue;
    const next = parts[i + 1]?.replace(/[^\w]/g, "") ?? "";
    if (domainTokens.has(t)) continue;
    if (STORE_NAME_TOKENS.has(t)) continue;
    if (STOPWORDS.has(t)) continue;
    if (NOISE_TOKENS.has(t.toLowerCase())) continue;
    if (isNoiseToken(t, next)) continue;
    if (t.length === 1 && !/^\d$/.test(t)) continue;

    if (/^\d+[,.]?\d*$/.test(t) && /^(cm|mm|m)$/i.test(next)) {
      tokens.push(t.replace(",", "."));
      tokens.push(next.toLowerCase());
      i += 1;
      continue;
    }
    if (/^\d+[,.]?\d*$/.test(t) && next === "x" && parts[i + 2] && /^\d+[,.]?\d*$/.test(parts[i + 2].replace(/[^\w.]/g, ""))) {
      tokens.push(`${t}x${parts[i + 2].replace(",", ".")}`.toLowerCase());
      i += 2;
      continue;
    }
    if (/^\d+[,.]?\d*$/.test(t)) continue;
    if (/^\d+x\d+$/i.test(t)) {
      tokens.push(t.toLowerCase());
      continue;
    }
    if (t.length >= 2) tokens.push(t);
  }

  return tokens.join(" ");
}

/**
 * Relaxed keywords: strip color and price/unit tokens to reduce drift (e.g. paint spec -> adventni venčki).
 */
export function itemSpecToRelaxedKeywords(item: string, allowlistDomains: string[] = []): string {
  const full = itemSpecToKeywords(item, allowlistDomains);
  const tokens = full.split(/\s+/).filter((t) => {
    const lower = t.toLowerCase();
    if (COLOR_TOKENS.has(lower)) return false;
    if (NOISE_TOKENS.has(lower)) return false;
    if (/^\d+[,.]?\d*$/.test(t) || /^\d+x\d+$/.test(t)) return false;
    return t.length >= 2;
  });
  return tokens.join(" ").trim();
}

/**
 * Synonym-expanded keywords for fallback queries (e.g. stenska barva -> notranja barva za stene).
 */
export function itemSpecToSynonymKeywords(item: string, allowlistDomains: string[] = []): string {
  const base = itemSpecToKeywords(item, allowlistDomains);
  const added = new Set<string>(base.split(/\s+/).filter(Boolean));
  for (const { pattern, extra } of SYNONYM_ADDITIONS) {
    if (pattern.test(base)) {
      extra.forEach((e) => e.split(/\s+/).forEach((t) => added.add(t)));
    }
  }
  return [...added].join(" ");
}

/** Extract key phrase (first meaningful words) and size tokens (dimensions, cm, etc.) from spec */
function extractKeyPhraseAndSize(specKeywords: string): { keyPhrase: string; sizeTokens: string } {
  const tokens = specKeywords.split(/\s+/).filter(Boolean);
  const sizePattern = /^\d+[,.]?\d*$|^\d+x\d+$|^(cm|mm|m)$/i;
  const sizeTokens: string[] = [];
  const rest: string[] = [];
  for (const t of tokens) {
    if (sizePattern.test(t)) sizeTokens.push(t);
    else rest.push(t);
  }
  const keyPhrase = rest.slice(0, 4).join(" ");
  return { keyPhrase, sizeTokens: sizeTokens.join(" ") };
}

export type PlannedItemQueries = { item: string; queries: string[] };

/**
 * Resolve which allowlist domains to use for an item (category-based routing).
 * Empty/missing categories = UNKNOWN; unknown domains only used at Step 3.
 * Returns up to MAX_DOMAINS_PER_ITEM domains.
 */
export function resolveDomainsForItem(
  itemCategory: TaxonomyCategory,
  allowlistDomains: string[],
  domainCategoryMap: Record<string, string[]>
): string[] {
  const domains = [...new Set(allowlistDomains.map(normalizeDomainToRoot).filter(Boolean))];
  if (domains.length === 0) return [];

  // Step 1 STRICT: domains whose categories include itemCat (exclude unknown: missing or [])
  let chosen = domains.filter((d) => {
    const cats = domainCategoryMap[d];
    return Array.isArray(cats) && cats.length > 0 && cats.includes(itemCategory);
  });
  if (chosen.length > 0) return chosen.slice(0, MAX_DOMAINS_PER_ITEM);

  // Step 2 RELAXED: categories include itemCat OR diy_hardware (still exclude unknown)
  chosen = domains.filter((d) => {
    const cats = domainCategoryMap[d];
    if (!Array.isArray(cats) || cats.length === 0) return false;
    return cats.includes(itemCategory) || cats.includes("diy_hardware");
  });
  if (chosen.length > 0) return chosen.slice(0, MAX_DOMAINS_PER_ITEM);

  // Step 3 UNKNOWN: domains missing from map or with empty categories
  chosen = domains.filter((d) => {
    const cats = domainCategoryMap[d];
    return !Array.isArray(cats) || cats.length === 0;
  });
  if (chosen.length > 0) return chosen.slice(0, MAX_DOMAINS_PER_ITEM);

  // Step 4 LAST RESORT: all allowlist
  return domains.slice(0, MAX_DOMAINS_PER_ITEM);
}

const MAX_QUERY_VARIANTS_PER_DOMAIN = 3;

export interface BuildPlannedQueriesOptions {
  /** Max domains per item (default MAX_DOMAINS_PER_ITEM). Use 2 for fast mode. */
  domainsPerItem?: number;
  /** Max query variants per domain: 2 = strict + relaxed only; 3 = + synonym. */
  queryVariantsPerDomain?: number;
}

/**
 * Build planned queries: site:{domain} + variants (strict, relaxed, synonym) for robust fallback.
 * When domainCategoryMap is provided, resolveDomainsForItem is used; otherwise all domains (legacy).
 */
export function buildPlannedQueries(
  items: string[],
  allowlistDomains: string[],
  domainCategoryMap?: Record<string, string[]>,
  preferredDomains?: string[],
  options?: BuildPlannedQueriesOptions
): { planned: Record<string, string[]>; flat: Array<{ item: string; query: string }> } {
  const domains = [...new Set(allowlistDomains.map(normalizeDomainToRoot).filter(Boolean))];
  const domainsPerItem = options?.domainsPerItem ?? MAX_DOMAINS_PER_ITEM;
  const variantsCap = options?.queryVariantsPerDomain ?? MAX_QUERY_VARIANTS_PER_DOMAIN;
  const planned: Record<string, string[]> = {};
  const flat: Array<{ item: string; query: string }> = [];

  for (const item of items) {
    const sanitized = stripStoreNamesAndDomainsFromItem(item, domains);
    const keywords = itemSpecToKeywords(item, domains);
    if (!keywords && !sanitized) {
      planned[item] = [];
      continue;
    }
    const searchSpec = keywords || sanitized;
    const relaxedSpec = itemSpecToRelaxedKeywords(item, domains);
    const synonymSpec = variantsCap >= 3 ? itemSpecToSynonymKeywords(item, domains) : "";
    const { keyPhrase, sizeTokens } = extractKeyPhraseAndSize(searchSpec);
    const itemCategory = itemSpecToCategory(item);

    let domainsForItem: string[];
    if (domainCategoryMap && Object.keys(domainCategoryMap).length > 0) {
      domainsForItem = resolveDomainsForItem(itemCategory, domains, domainCategoryMap).slice(0, domainsPerItem);
    } else {
      const { pref, rest } = preferredDomains?.length ? applyPreferredSplit(domains, preferredDomains) : { pref: [], rest: domains };
      const ordered = [...pref, ...stableShuffleSort(item, rest)];
      domainsForItem = ordered.slice(0, domainsPerItem);
    }

    if (domainsForItem.length === 0) {
      planned[item] = [];
      continue;
    }
    const itemQueries: string[] = [];
    const seenQueries = new Set<string>();
    for (const domain of domainsForItem) {
      const domainVariants: string[] = [];
      const q1 = `site:${domain} ${searchSpec}`;
      domainVariants.push(q1);
      if (variantsCap >= 3 && keyPhrase && keyPhrase !== searchSpec) {
        const qKey = sizeTokens
          ? `site:${domain} "${keyPhrase}" ${sizeTokens}`.trim()
          : `site:${domain} "${keyPhrase}"`.trim();
        domainVariants.push(qKey);
      }
      if (relaxedSpec && relaxedSpec !== searchSpec && relaxedSpec.length >= 3) {
        domainVariants.push(`site:${domain} ${relaxedSpec}`);
      }
      if (variantsCap >= 3 && synonymSpec && synonymSpec !== searchSpec && synonymSpec.length >= 3) {
        domainVariants.push(`site:${domain} ${synonymSpec}`);
      }
      for (const q of domainVariants.slice(0, variantsCap)) {
        if (seenQueries.has(q)) continue;
        seenQueries.add(q);
        itemQueries.push(q);
        flat.push({ item, query: q });
      }
    }
    planned[item] = itemQueries;
  }

  return { planned, flat };
}

/** Append negative keywords to query (Google: -term excludes term). */
function appendNegativeKeywords(query: string, negativeKeywords: string[]): string {
  if (!negativeKeywords?.length) return query;
  const neg = negativeKeywords
    .slice(0, 10)
    .filter((t) => t.trim().length > 0)
    .map((t) => `-${t.trim()}`)
    .join(" ");
  return neg ? `${query} ${neg}`.trim() : query;
}

/** Minimal bundle shape for building queries (avoids circular dependency with searchBundle). */
export type QueryBundle = {
  item: string;
  category: TaxonomyCategory;
  keywords: string;
  synonyms: string;
  negativeKeywords: string[];
};

/**
 * Build planned queries from bundles (autopilot). Uses bundle keywords/synonyms and includes negativeKeywords.
 */
export function buildPlannedQueriesFromBundles(
  bundles: QueryBundle[],
  allowlistDomains: string[],
  domainCategoryMap?: Record<string, string[]>,
  preferredDomains?: string[],
  options?: BuildPlannedQueriesOptions
): { planned: Record<string, string[]>; flat: Array<{ item: string; query: string }> } {
  const domains = [...new Set(allowlistDomains.map(normalizeDomainToRoot).filter(Boolean))];
  const domainsPerItem = options?.domainsPerItem ?? MAX_DOMAINS_PER_ITEM;
  const variantsCap = options?.queryVariantsPerDomain ?? MAX_QUERY_VARIANTS_PER_DOMAIN;
  const planned: Record<string, string[]> = {};
  const flat: Array<{ item: string; query: string }> = [];

  for (const bundle of bundles) {
    const { item, keywords: searchSpec, synonyms: synonymSpec, negativeKeywords } = bundle;
    const relaxedSpec = itemSpecToRelaxedKeywords(item, domains);
    if (!searchSpec?.trim() && !relaxedSpec?.trim()) {
      planned[item] = [];
      continue;
    }
    const spec = searchSpec?.trim() || relaxedSpec;
    const { keyPhrase, sizeTokens } = extractKeyPhraseAndSize(spec);
    const itemCategory = bundle.category;

    let domainsForItem: string[];
    if (domainCategoryMap && Object.keys(domainCategoryMap).length > 0) {
      domainsForItem = resolveDomainsForItem(itemCategory, domains, domainCategoryMap).slice(0, domainsPerItem);
    } else {
      const { pref, rest } = preferredDomains?.length ? applyPreferredSplit(domains, preferredDomains) : { pref: [], rest: domains };
      const ordered = [...pref, ...stableShuffleSort(item, rest)];
      domainsForItem = ordered.slice(0, domainsPerItem);
    }

    if (domainsForItem.length === 0) {
      planned[item] = [];
      continue;
    }
    const itemQueries: string[] = [];
    const seenQueries = new Set<string>();
    for (const domain of domainsForItem) {
      const domainVariants: string[] = [];
      const base1 = `site:${domain} ${spec}`;
      domainVariants.push(appendNegativeKeywords(base1, negativeKeywords ?? []));
      if (variantsCap >= 3 && keyPhrase && keyPhrase !== spec) {
        const baseKey = sizeTokens ? `site:${domain} "${keyPhrase}" ${sizeTokens}`.trim() : `site:${domain} "${keyPhrase}"`.trim();
        domainVariants.push(appendNegativeKeywords(baseKey, negativeKeywords ?? []));
      }
      if (relaxedSpec && relaxedSpec !== spec && relaxedSpec.length >= 3) {
        domainVariants.push(appendNegativeKeywords(`site:${domain} ${relaxedSpec}`, negativeKeywords ?? []));
      }
      if (variantsCap >= 3 && synonymSpec?.trim() && synonymSpec !== spec && synonymSpec.length >= 3) {
        domainVariants.push(appendNegativeKeywords(`site:${domain} ${synonymSpec}`, negativeKeywords ?? []));
      }
      for (const q of domainVariants.slice(0, variantsCap)) {
        if (seenQueries.has(q)) continue;
        seenQueries.add(q);
        itemQueries.push(q);
        flat.push({ item, query: q });
      }
    }
    planned[item] = itemQueries;
  }

  return { planned, flat };
}
