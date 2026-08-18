/**
 * Store vs contractor classification and store-domain gate for Places D.
 * D only decides which nearby retail domains are legitimate SERP candidates.
 */

import { isRejectedDomain } from "@/lib/places/domainUtils";
import type { CatalogSignalResult } from "@/lib/places/catalogSignal";
import { PLACES_ERROR_CODES, type PlacesOutcome } from "./errors";
import { isRetailCategoryId } from "./retailTaxonomy";

/** Specific Google types that indicate furniture/home/DIY retail. Generic "store" is not included. */
export const STORE_TYPES = [
  "furniture_store",
  "hardware_store",
  "home_goods_store",
  "lighting_store",
] as const;

const RETAIL_NEGATIVE_TYPES = ["supermarket", "grocery_or_supermarket", "department_store"] as const;

/** Google types that are not home/renovation retail, even if Nearby returned them for a retail query. */
const UNRELATED_BUSINESS_TYPES = [
  "gas_station",
  "supermarket",
  "grocery_or_supermarket",
  "convenience_store",
  "restaurant",
  "cafe",
  "bakery",
  "meal_takeaway",
  "food",
  "pharmacy",
  "bank",
  "atm",
  "hospital",
  "lodging",
] as const;

const UNRELATED_NAME_TERMS = [
  "bakery",
  "pekarna",
  "petrol",
  "gas station",
  "supermarket",
  "grocery",
  "restaurant",
  "restavracija",
  "cafe",
  "pharmacy",
  "lekarna",
  "živila",
  "zivila",
  "mesnica",
];

export const SERVICE_TYPES = [
  "general_contractor",
  "electrician",
  "plumber",
  "painter",
  "roofing_contractor",
  "flooring_contractor",
  "locksmith",
  "carpenter",
  "handyman",
  "moving_company",
  "real_estate_agency",
  "home_builder",
] as const;

const CONTRACTOR_NAME_KEYWORDS_SL = [
  "montaža",
  "montaza",
  "pleskar",
  "električar",
  "elektricar",
  "vodovod",
  "vodovodar",
  "keramičar",
  "keramicar",
  "instalacije",
  "servis",
  "pleskanje",
  "povpraševanje",
  "cenik",
  "storitve",
  "namestitev",
  "popravilo",
  "gradbeništvo",
  "adaptacije",
  "renovacij",
];

const SERVICE_DOMAIN_PATTERNS = [
  "kamnosestvo",
  "pleskar",
  "vodovodar",
  "mizarstvo",
  "storitve",
  "montaza",
  "montaža",
  "instalacije",
  "italko",
  "lesarstvo",
  "keramicar",
  "keramičar",
  "elektricar",
  "električar",
  "inštalacije",
  "obrt",
  "gradbeništvo",
];

/** Category/search terms that indicate home/furniture/DIY/material retail — not store brand names. */
const HOME_RETAIL_TERMS = [
  "pohištvo",
  "pohistvo",
  "furniture",
  "železnina",
  "zeleznina",
  "hardware",
  "home goods",
  "homegoods",
  "diy",
  "gradbeni",
  "keramika",
  "ploščice",
  "ploscice",
  "tile",
  "tiles",
  "laminat",
  "vinil",
  "parket",
  "flooring",
  "talne obloge",
  "barve",
  "paint",
  "premaz",
  "lazura",
  "svetila",
  "lighting",
  "dekoracija",
  "decor",
  "omare",
  "postelje",
  "mattress",
  "sanitarna",
];

const CATALOG_PATH_PATTERNS = [
  "/p/",
  "/product",
  "/izdelek",
  "/shop",
  "/kategorija",
  "cart",
  "cena",
  "/trgovina",
  "/artikel",
];

const SOCIAL_DOMAINS = ["facebook.com", "instagram.com", "tiktok.com", "linkedin.com"];

const DIRECTORY_AGGREGATOR_DOMAINS = [
  "yelp.com",
  "foursquare.com",
  "tripadvisor.com",
  "bizi.si",
  "najdi.si",
  "rumene-strani.si",
  "cylex.si",
  "biznis.si",
  "cylex.at",
  "cylex.de",
  "slovenskenovice.si",
  "gorenjski.si",
  "podjetnik.com",
  "zrs.si",
  "mojepodjetje.si",
  "pg.si",
  "find-open.co.uk",
  "hotfrog.",
  "brownbook.net",
  "tuugo.",
  "expressen.se",
  "eniro.",
  "11880.com",
  "dasoertliche.",
  "goldenpages.",
  "yell.com",
  "thomsonlocal.com",
];

const GENERIC_NAME_TOKENS = new Set([
  "trgovski",
  "dipo",
  "d.o.o.",
  "s.p",
  "sp",
  "storitve",
  "slovenija",
  "ljubljana",
  "celje",
  "maribor",
  "kranj",
  "koper",
  "novo",
  "mesto",
  "group",
  "plus",
]);

export type ClassifyPlaceContext = {
  sourceKeywords?: string[];
  categoriesMatched?: string[];
  catalogSignal?: CatalogSignalResult | null;
};

export type StoreDomainGateInput = {
  name: string;
  types: string[];
  website?: string | null;
  websiteDomain?: string | null;
  storeScore: number;
  sourceKeywords?: string[];
  categoriesMatched?: string[];
  catalogSignal?: CatalogSignalResult | null;
};

export type StoreDomainGateResult = {
  accept: boolean;
  reason: string | null;
  officialDomain: boolean;
  websiteQuality: "social" | "directory" | "official";
  catalogPath: boolean;
  strongStoreType: boolean;
  genericStore: boolean;
  homeRetailRelevance: boolean;
};

function containsHomeRetailTerm(value: string): boolean {
  const n = value.toLowerCase();
  return HOME_RETAIL_TERMS.some((term) => n.includes(term));
}

export function hasStrongStoreType(types: string[]): boolean {
  const t = types.map((x) => x.toLowerCase());
  return t.some((x) => (STORE_TYPES as readonly string[]).includes(x));
}

export function isGenericStoreType(types: string[]): boolean {
  const t = types.map((x) => x.toLowerCase());
  return t.includes("store") && !hasStrongStoreType(t);
}

function isUnrelatedBusiness(types: string[], name?: string | null): boolean {
  const t = types.map((x) => x.toLowerCase());
  if (t.some((x) => (UNRELATED_BUSINESS_TYPES as readonly string[]).includes(x))) return true;
  const n = (name ?? "").toLowerCase();
  return UNRELATED_NAME_TERMS.some((term) => n.includes(term));
}

export function hasHomeRetailRelevance(input: {
  types?: string[];
  name?: string | null;
  sourceKeywords?: string[];
  categoriesMatched?: string[];
  catalogSignal?: CatalogSignalResult | null;
}): boolean {
  if (isUnrelatedBusiness(input.types ?? [], input.name) && !hasStrongStoreType(input.types ?? [])) {
    return false;
  }
  if (hasStrongStoreType(input.types ?? [])) return true;
  if ((input.categoriesMatched ?? []).some((c) => isRetailCategoryId(c) || hasStrongStoreType([c]) || containsHomeRetailTerm(c))) {
    return true;
  }
  if ((input.sourceKeywords ?? []).some((k) => containsHomeRetailTerm(k))) return true;
  if (input.name && containsHomeRetailTerm(input.name)) return true;
  if (input.catalogSignal === true) return true;
  return false;
}

export function isServiceDomainByHeuristic(websiteDomain: string): boolean {
  if (!websiteDomain || !String(websiteDomain).trim()) return false;
  const d = String(websiteDomain).toLowerCase().replace(/^www\./, "").trim();
  return SERVICE_DOMAIN_PATTERNS.some((p) => d.includes(p));
}

export function classifyWebsiteQuality(domain: string): "social" | "directory" | "official" {
  if (!domain || !domain.trim()) return "official";
  const d = domain.toLowerCase().replace(/^www\./, "").trim();
  if (SOCIAL_DOMAINS.some((s) => d === s || d.endsWith("." + s))) return "social";
  if (DIRECTORY_AGGREGATOR_DOMAINS.some((s) => d === s || d.includes(s))) return "directory";
  return "official";
}

export function isOfficialDomain(domain: string, businessName: string): boolean {
  if (!domain || !businessName) return false;
  const d = domain.toLowerCase().replace(/^www\./, "");
  const tokens = businessName
    .toLowerCase()
    .replace(/[^\w\sčćžšđ]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !GENERIC_NAME_TOKENS.has(t));
  if (tokens.length === 0) return false;
  const brandLike = tokens.filter((t) => t.length >= 4);
  const toMatch = brandLike.length > 0 ? brandLike : tokens;
  return toMatch.some((t) => d.includes(t));
}

export function hasCatalogPathSignal(url: string): boolean {
  try {
    const path = new URL(url.startsWith("http") ? url : `https://${url}`).pathname.toLowerCase();
    return CATALOG_PATH_PATTERNS.some((p) => path.includes(p) || url.toLowerCase().includes(p));
  } catch {
    return false;
  }
}

export function computeStoreScore(
  types: string[],
  rating?: number,
  user_ratings_total?: number
): number {
  const t = types.map((x) => x.toLowerCase());
  let score = 0;

  if (t.some((x) => (STORE_TYPES as readonly string[]).includes(x))) score += 0.7;
  if (t.includes("store")) score += 0.15;
  if (t.includes("shopping_mall")) score += 0.1;
  if (t.some((x) => (RETAIL_NEGATIVE_TYPES as readonly string[]).includes(x))) score -= 0.9;
  if (t.includes("shopping_mall") && !t.some((x) => (STORE_TYPES as readonly string[]).includes(x))) {
    score -= 0.2;
  }

  const reviews = user_ratings_total ?? 0;
  if (reviews > 0) score += Math.min(0.2, Math.log10(reviews + 1) / 15);
  const r = rating ?? 0;
  if (r >= 4) score += 0.1;

  return Math.max(0, Math.min(1, score));
}

/**
 * Classify a place into store, contractor, or null (ambiguous).
 * Generic Google type "store" is not enough; it may become store only with
 * home/furniture/DIY/material retail signals.
 */
export function classifyPlaceBucket(
  types: string[],
  name: string,
  websiteDomain?: string | null,
  context?: ClassifyPlaceContext
): "store" | "contractor" | null {
  const t = types.map((x) => x.toLowerCase());
  const n = (name ?? "").toLowerCase();
  const hasStoreType = hasStrongStoreType(t);
  const hasServiceType = t.some((x) => (SERVICE_TYPES as readonly string[]).includes(x));
  const nameMatchesContractor = CONTRACTOR_NAME_KEYWORDS_SL.some((kw) => n.includes(kw.toLowerCase()));
  const domainMatchesService = websiteDomain ? isServiceDomainByHeuristic(websiteDomain) : false;

  if (domainMatchesService || hasServiceType) {
    return "contractor";
  }
  if (hasStoreType) {
    return "store";
  }
  if (isUnrelatedBusiness(t, name)) {
    return null;
  }
  if (nameMatchesContractor) {
    return "contractor";
  }

  const genericStore = t.includes("store");
  if (
    genericStore &&
    hasHomeRetailRelevance({
      types,
      name,
      sourceKeywords: context?.sourceKeywords,
      categoriesMatched: context?.categoriesMatched,
      catalogSignal: context?.catalogSignal,
    })
  ) {
    return "store";
  }

  return null;
}

/**
 * Whether a classified store may contribute its website domain to the SERP allowlist.
 * Does not require a catalog-looking path on the Places homepage.
 */
export function evaluateStoreDomainGate(input: StoreDomainGateInput): StoreDomainGateResult {
  const types = input.types ?? [];
  const website = (input.website ?? "").trim();
  const websiteDomain = (input.websiteDomain ?? "").trim().toLowerCase().replace(/^www\./, "");
  const strongStoreType = hasStrongStoreType(types);
  const genericStore = isGenericStoreType(types);
  const homeRetailRelevance = hasHomeRetailRelevance({
    types,
    name: input.name,
    sourceKeywords: input.sourceKeywords,
    categoriesMatched: input.categoriesMatched,
    catalogSignal: input.catalogSignal,
  });
  const catalogPath = website ? hasCatalogPathSignal(website) : false;
  const officialDomain = websiteDomain ? isOfficialDomain(websiteDomain, input.name) : false;
  const websiteQuality = websiteDomain ? classifyWebsiteQuality(websiteDomain) : "official";

  const base = {
    officialDomain,
    websiteQuality,
    catalogPath,
    strongStoreType,
    genericStore,
    homeRetailRelevance,
  };

  if (!website || !websiteDomain) {
    return { accept: false, reason: "no_website", ...base };
  }
  if (isRejectedDomain(websiteDomain) || websiteQuality === "social" || websiteQuality === "directory") {
    return { accept: false, reason: "social_or_directory_website", ...base };
  }
  if (isUnrelatedBusiness(types, input.name) && !strongStoreType) {
    return { accept: false, reason: "generic_store_unrelated", ...base };
  }

  if (genericStore && !homeRetailRelevance) {
    return { accept: false, reason: "generic_store_unrelated", ...base };
  }

  const catalogEvidence = input.catalogSignal === true;
  const nameRetail = containsHomeRetailTerm(input.name);
  const fromRetailQuery = (input.categoriesMatched ?? []).some((c) => isRetailCategoryId(c));
  const strongRetail = strongStoreType || (genericStore && (nameRetail || catalogEvidence || fromRetailQuery));

  if (!strongRetail) {
    return { accept: false, reason: "insufficient_retail_evidence", ...base };
  }

  // Strong furniture/home/DIY type + official-quality homepage is enough.
  // Do not require "/shop" or another catalog path.
  if (strongStoreType && websiteQuality === "official") {
    return { accept: true, reason: null, ...base };
  }

  // Generic store: query source alone is not enough (food shops can appear as type=store).
  // Accept when the official-quality website has catalog/name evidence, or the domain matches the business.
  if (
    genericStore &&
    websiteQuality === "official" &&
    (catalogEvidence || nameRetail || catalogPath || (fromRetailQuery && officialDomain))
  ) {
    return { accept: true, reason: null, ...base };
  }

  if (officialDomain && (catalogEvidence || catalogPath || input.storeScore >= 0.7 || strongStoreType)) {
    return { accept: true, reason: null, ...base };
  }

  if (!officialDomain) {
    return { accept: false, reason: "domain_not_official", ...base };
  }
  return { accept: false, reason: "insufficient_retail_evidence", ...base };
}

export function placesOutcomeFromCounts(input: {
  rawCandidates: number;
  afterRadius: number;
  storeBucketCount: number;
  storesWithWebsite: number;
  validStoreDomains: number;
}): PlacesOutcome {
  if (input.rawCandidates <= 0 || input.afterRadius <= 0) {
    return PLACES_ERROR_CODES.NO_PLACES_CANDIDATES;
  }
  if (input.validStoreDomains > 0) return "OK";
  if (input.storeBucketCount <= 0 || input.storesWithWebsite <= 0) {
    return PLACES_ERROR_CODES.STORES_FOUND_BUT_FILTERED;
  }
  return PLACES_ERROR_CODES.NO_VALID_STORE_DOMAINS;
}
