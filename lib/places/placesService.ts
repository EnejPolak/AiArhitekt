/**
 * Cost-controlled Google Places search service
 * Minimizes API usage while maintaining good coverage
 */

import { TTLCache } from "@/lib/cache";
import { haversineDistanceMeters } from "@/lib/geo/haversine";
import { checkProductCatalogSignal, type CatalogProbe, type CatalogCheckResult, type CatalogSignalResult } from "@/lib/places/catalogSignal";

// Types
export interface Place {
  place_id: string;
  name: string;
  types: string[];
  vicinity?: string;
  formatted_address?: string;
  location: {
    lat: number;
    lng: number;
  };
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: {
    open_now?: boolean;
  };
  googleMapsUrl: string;
  sourceKeywords: string[];
  categoriesMatched: string[];
  distanceMeters?: number;
  distanceKm?: number;
  /** Set when details were fetched and place has a website */
  website?: string;
  websiteDomain?: string;
}

export interface PlaceDetails extends Place {
  formatted_phone_number?: string;
  website?: string;
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
  };
  url?: string;
}

export interface SearchParams {
  lat: number;
  lng: number;
  radiusKm: number;
  mode?: "category" | "brand";
  brandKeywords?: string[];
  dryRun?: boolean;
  /** If true (default), fetch details and return only places that have a website */
  onlyWithWebsite?: boolean;
  /** If true, include debug.candidates and debug.discarded in response */
  debug?: boolean;
}

export interface SearchMeta {
  radiusMeters: number;
  requestsMade: number;
  cacheHits: number;
  fallbacksUsed: number;
  plannedQueries: string[];
  executionNotes?: string[];
  usedLocation?: { lat: number; lng: number };
  filteredOutCount?: number;
  /** Candidates after merge + distance filter (before details) */
  candidatesFound?: number;
  /** Place Details API calls made */
  detailsFetched?: number;
  /** Out-of-radius discarded */
  discardedOutOfRadius?: number;
  /** Store candidates discarded: no website */
  discardedNoWebsiteStores?: number;
  /** Store candidates discarded: domain not official */
  discardedDomainNotOfficialStores?: number;
  /** Discarded: store score < 0.70 */
  discardedLowStoreScore?: number;
  /** Discarded: service score < 0.55 */
  discardedLowServiceScore?: number;
  /** Reclassified from store buckets to services (serviceHintScore >= 0.70) */
  reclassifiedToServices?: number;
  debugVersion?: string;
  /** API debug label: exactly "D)" */
  debugVersionLabel?: string;
  debugDistances?: Array<{ name: string; distanceKm: number }>;
}

/** Place with store/service scoring and website quality (for output) */
export interface StoreOrServicePlace extends Place {
  formatted_phone_number?: string;
  storeScore?: number;
  serviceScore?: number;
  serviceHintScore?: number;
  websiteQuality?: "social" | "directory" | "official";
  /** true = catalog detected, false = no catalog, "unknown" = fetch failed */
  catalogSignal?: CatalogSignalResult;
  /** Present when debug=true and catalog was probed */
  catalogProbe?: CatalogProbe;
  /** Final bucket: "store" | "store_secondary" | "service" (only when debug) */
  bucket?: "store" | "store_secondary" | "service";
  /** Reasons for service hint boost (only when debug) */
  serviceHintReasons?: string[];
  /** Reasons for store classification (only when debug) */
  storeReasons?: string[];
  /** Reasons for service classification (only when debug) */
  serviceReasons?: string[];
}

/** Discarded item with reason (when debug=true) */
export interface DiscardedPlace {
  place: StoreOrServicePlace;
  reason: string;
}

/** Quality flags for a business (store or contractor). */
export interface QualityFlags {
  officialSite: boolean;
  hasCatalogSignal: boolean;
  isDirectoryOrSocial: boolean;
  isAggregator: boolean;
}

/** Single business in D) output – retail store or contractor only. */
export interface PlaceResult {
  name: string;
  place_id: string;
  rating: number | undefined;
  user_ratings_total: number | undefined;
  distanceKm: number;
  website: string;
  websiteDomain: string;
  categoryBucket: "store" | "contractor";
  types: string[];
  qualityFlags: QualityFlags;
}

export interface SearchResult {
  meta: SearchMeta;
  places: Place[];
  /** Retail businesses only (product sellers). */
  stores: PlaceResult[];
  /** Service providers only (contractors/trades). */
  contractors: PlaceResult[];
  /** Unique normalized domains from stores only – for C) product SERP. */
  allowlistDomainsStores: string[];
  /** Unique normalized domains from contractors only – for C) service SERP. */
  allowlistDomainsContractors: string[];
  status: number;
  /** Only when debug=true: rejection reasons and classification signals. */
  debug?: {
    rejectionReasons: Array<{ name: string; place_id?: string; reason: string }>;
    classificationSignals?: Array<{ name: string; storeScore: number; contractorScore: number; serviceHintScore: number; bucket?: string; rejected?: boolean }>;
    candidates?: StoreOrServicePlace[];
    discarded?: DiscardedPlace[];
  };
}

// Constants
const MAX_REQUESTS_PER_SEARCH = 6;
const MAX_CONCURRENCY = 2;
const REQUESTS_PER_SECOND = 3;
const REQUEST_TIMEOUT_MS = 6000;
const CACHE_TTL_SEARCH = 14 * 24 * 60 * 60 * 1000; // 14 days
const CACHE_TTL_DETAILS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_PLACES = 40;
const MAX_DETAILS_PER_SEARCH = 60;
const DETAILS_CONCURRENCY = 3;

// Category keywords (Slovenian-first)
const CATEGORY_KEYWORDS = {
  furniture: { sl: "pohištvo", en: "furniture store" },
  tiles_bathroom: { sl: "keramika", en: "tile store" },
  hardware: { sl: "železnina", en: "hardware store" },
};

// Brand keywords (examples)
const BRAND_KEYWORDS = [
  "Merkur",
  "Lesnina",
  "XXXL Lesnina",
  "Harvey Norman",
  "JYSK",
  "OBI",
  "Jager",
  "Topdom",
  "SAM",
  "Termonova",
  "Mega Keramika",
  "Italko",
];

// === GLOBAL STORE/SERVICE CLASSIFIER (language/country agnostic) ===

/** Google Place types that indicate a retail store (SERP-friendly) */
const STORE_TYPES = [
  "furniture_store",
  "hardware_store",
  "home_goods_store",
  "store",
  "lighting_store",
  "shopping_mall",
] as const;

/** Types that indicate non-store retail (supermarkets, department stores) */
const RETAIL_NEGATIVE_TYPES = [
  "supermarket",
  "grocery_or_supermarket",
  "department_store",
] as const;

/** Google Place types for contractors/trades (services) */
const SERVICE_TYPES = [
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

/** Social domains – not official store sites */
const SOCIAL_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "linkedin.com",
];

/** Directory/aggregator domains – not official store or contractor sites */
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

/** Domains that are always rejected (social + directory/aggregator). */
function isRejectedDomain(domain: string): boolean {
  if (!domain || !domain.trim()) return true;
  const d = domain.toLowerCase().replace(/^www\./, "").trim();
  if (SOCIAL_DOMAINS.some((s) => d === s || d.endsWith("." + s))) return true;
  if (DIRECTORY_AGGREGATOR_DOMAINS.some((s) => d === s || d.includes(s))) return true;
  return false;
}

/**
 * Classify website domain quality (global list).
 * Returns "official" for real store/service sites; "social" or "directory" otherwise.
 */
export function classifyWebsiteQuality(domain: string): "social" | "directory" | "official" {
  if (!domain || !domain.trim()) return "official";
  const d = domain.toLowerCase().replace(/^www\./, "").trim();
  if (SOCIAL_DOMAINS.some((s) => d === s || d.endsWith("." + s))) return "social";
  if (DIRECTORY_AGGREGATOR_DOMAINS.some((s) => d === s || d.includes(s))) return "directory";
  return "official";
}

/**
 * Compute store score ∈ [0..1] from Google types + rating/reviews (global, no keywords).
 */
export function computeStoreScore(
  types: string[],
  rating?: number,
  user_ratings_total?: number
): number {
  const t = types.map((x) => x.toLowerCase());
  let score = 0;

  if (t.some((x) => STORE_TYPES.includes(x as any))) score += 0.7;
  if (t.some((x) => RETAIL_NEGATIVE_TYPES.includes(x as any))) score -= 0.9;
  if (t.includes("shopping_mall") && !t.some((x) => STORE_TYPES.includes(x as any))) score -= 0.3;

  const reviews = user_ratings_total ?? 0;
  if (reviews > 0) score += Math.min(0.2, Math.log10(reviews + 1) / 15);
  const r = rating ?? 0;
  if (r >= 4) score += 0.1;

  return Math.max(0, Math.min(1, score));
}

/**
 * Compute service score ∈ [0..1] from Google types + phone/opening_hours (global).
 */
export function computeServiceScore(
  types: string[],
  phone?: string | null,
  opening_hours?: { open_now?: boolean; weekday_text?: string[] } | null
): number {
  const t = types.map((x) => x.toLowerCase());
  let score = 0;

  if (t.some((x) => SERVICE_TYPES.includes(x as any))) score += 0.8;
  if (phone && String(phone).trim().length > 0) score += 0.1;
  if (opening_hours != null) score += 0.1;

  const hasStoreOnly = t.some((x) => STORE_TYPES.includes(x as any)) && !t.some((x) => SERVICE_TYPES.includes(x as any));
  if (hasStoreOnly) score -= 0.4;

  return Math.max(0, Math.min(1, score));
}

/** URL path segments that suggest a service business (not retail catalog) */
const SERVICE_URL_PATTERNS = ["/services", "/booking", "/contact", "/pricing", "/cenik", "/storitve"];

/**
 * Multilingual seed keywords for service providers (installation, assembly, repair, contractor, etc.).
 * Used for global "service keyword boost": if place.name matches any (case-insensitive), set
 * serviceHintScore = max(..., 0.80) and serviceScore = max(..., 0.80). Not Slovenia-specific.
 */
const SERVICE_KEYWORDS: string[] = [
  // EN
  "installation", "install", "assembly", "assembling", "repair", "service", "contractor",
  "renovation", "tiling", "plastering", "painting", "electrician", "plumbing", "flooring", "drywall",
  // SL
  "montaža", "montaza", "namestitev", "servis", "popravilo", "gradbeništvo", "električar", "vodoinštalater",
  "ploščnik", "barvanje", "keramika", "suhozid",
  // DE
  "montage", "installation", "reparatur", "dienst", "handwerker", "renovierung", "fliesen",
  "elektriker", "klempner", "maler", "boden", "trockenbau",
  // IT
  "installazione", "montaggio", "riparazione", "servizio", "contractor", "ristrutturazione",
  "piastrellista", "intonaco", "pittura", "elettricista", "idraulico", "pavimenti", "cartongesso",
  // FR
  "installation", "montage", "réparation", "service", "contracteur", "rénovation", "carrelage",
  "plâtrerie", "peinture", "électricien", "plombier", "sol", "placo",
  // ES
  "instalación", "montaje", "reparación", "servicio", "contratista", "renovación", "alicatado",
  "yeso", "pintura", "electricista", "fontanero", "suelos", "pladur",
  // HR
  "montaža", "instalacija", "popravak", "servis", "građevinar", "renovacija", "pločice",
  "električar", "vodoinstalater", "molerski", "podovi",
  // NL
  "installatie", "montage", "reparatie", "dienst", "aannemer", "renovatie", "tegelwerk",
  "stucwerk", "schilderen", "elektricien", "loodgieter", "vloeren", "gipsplaat",
  // PL
  "montaż", "instalacja", "naprawa", "serwis", "wykonawca", "remont", "płytki",
  "elektryk", "hydraulik", "malarz", "podłogi", "gips",
  // PT
  "instalação", "montagem", "reparo", "serviço", "empreiteiro", "renovação", "azulejos",
  "electricista", "encanador", "pintura", "pisos", "drywall",
];

/** Google types that trigger types boost: serviceHintScore = max(..., 0.75) */
const SERVICE_TYPES_BOOST = [
  "general_contractor",
  "electrician",
  "plumber",
  "painter",
  "roofing_contractor",
  "locksmith",
  "flooring_contractor",
] as const;

/** Name/category keywords suggesting service provider (legacy; SERVICE_KEYWORDS used for boost) */
const SERVICE_NAME_HINTS = [
  "installation", "install", "montage", "montaža", "montaza", "repair", "service",
  "contractor", "servis", "popravilo", "namestitev", "assembly", "assembling",
];

/**
 * Service hint score (0..1): high => treat as service business, never put in stores.
 * Uses: (a) Google place types, (b) name keyword hints, (c) website path hints.
 */
export function computeServiceHintScore(
  types: string[],
  websiteUrl?: string | null,
  name?: string | null
): number {
  const t = types.map((x) => x.toLowerCase());
  let score = 0;
  if (t.some((x) => SERVICE_TYPES.includes(x as any))) score += 0.5;
  if (name) {
    const n = name.toLowerCase();
    if (SERVICE_NAME_HINTS.some((h) => n.includes(h))) score += 0.35;
  }
  if (websiteUrl) {
    try {
      const path = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).pathname.toLowerCase();
      if (SERVICE_URL_PATTERNS.some((p) => path.includes(p))) score += 0.2;
    } catch {
      /* ignore */
    }
  }
  return Math.min(1, score);
}

/**
 * Apply global service keyword boost and types boost. If name matches any SERVICE_KEYWORDS,
 * set serviceHintScore = max(..., 0.80) and serviceScore = max(..., 0.80). If types contain
 * any SERVICE_TYPES_BOOST, set serviceHintScore = max(..., 0.75). Returns scores and reasons.
 */
export function applyServiceBoosts(
  types: string[],
  name: string | undefined | null,
  baseServiceHintScore: number,
  baseServiceScore: number
): { serviceHintScore: number; serviceScore: number; reasons: string[] } {
  const reasons: string[] = [];
  let serviceHintScore = baseServiceHintScore;
  let serviceScore = baseServiceScore;
  const n = (name ?? "").toLowerCase();

  // Keyword boost: max(..., 0.80)
  const matchedKeyword = SERVICE_KEYWORDS.find((kw) => n.includes(kw.toLowerCase()));
  if (matchedKeyword) {
    serviceHintScore = Math.max(serviceHintScore, 0.8);
    serviceScore = Math.max(serviceScore, 0.8);
    reasons.push(`keyword:${matchedKeyword}`);
  }

  // Types boost: max(..., 0.75)
  const t = types.map((x) => x.toLowerCase());
  const matchedType = SERVICE_TYPES_BOOST.find((ty) => t.includes(ty));
  if (matchedType) {
    serviceHintScore = Math.max(serviceHintScore, 0.75);
    reasons.push(`types:${matchedType}`);
  }

  return { serviceHintScore, serviceScore, reasons };
}

/**
 * Extract hostname/domain from a full URL for site: queries.
 * Normalized: strip www., lowercase, no path or tracking params.
 */
export function extractDomain(websiteUrl: string): string {
  try {
    const u = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Caches
const searchCache = new TTLCache<Place[]>(CACHE_TTL_SEARCH);
const detailsCache = new TTLCache<PlaceDetails>(CACHE_TTL_DETAILS);

// Throttling state
let lastRequestTime = 0;
const requestQueue: Array<() => Promise<void>> = [];
let activeRequests = 0;

/**
 * Round coordinates to 3 decimals for cache key
 */
function roundCoordinate(coord: number): number {
  return Math.round(coord * 1000) / 1000;
}

/**
 * Generate cache key for search
 */
function getCacheKey(
  lat: number,
  lng: number,
  radiusKm: number,
  keyword: string,
  language: string,
  region: string
): string {
  const roundedLat = roundCoordinate(lat);
  const roundedLng = roundCoordinate(lng);
  return `places:${roundedLat}:${roundedLng}:${radiusKm}:${keyword}:${language}:${region}`;
}

/**
 * Throttle requests (max 3 per second)
 */
async function throttle(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  const minInterval = 1000 / REQUESTS_PER_SECOND; // ~333ms

  if (timeSinceLastRequest < minInterval) {
    await new Promise((resolve) => setTimeout(resolve, minInterval - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
}

/**
 * Execute request with concurrency control
 */
async function executeWithConcurrency<T>(
  fn: () => Promise<T>
): Promise<T> {
  // Wait for available slot
  while (activeRequests >= MAX_CONCURRENCY) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  activeRequests++;
  try {
    await throttle();
    return await fn();
  } finally {
    activeRequests--;
  }
}

/**
 * Fetch places from Google Places API with retry logic
 */
async function fetchPlaces(
  keyword: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  language: string = "sl",
  region: string = "si"
): Promise<Place[]> {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY not configured");
  }

  const cacheKey = getCacheKey(lat, lng, radiusMeters / 1000, keyword, language, region);
  const cached = searchCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Use Nearby Search API
  const location = `${lat},${lng}`;
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&radius=${radiusMeters}&keyword=${encodeURIComponent(keyword)}&language=${language}&region=${region}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  let retries = 0;
  const maxRetries = 2;

  while (retries <= maxRetries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Google Places API error: ${response.status}`);
      }

      const data = await response.json();

      // Handle rate limiting
      if (data.status === "OVER_QUERY_LIMIT" || response.status === 429) {
        if (retries < maxRetries) {
          const backoffMs = Math.pow(2, retries) * 1000; // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          retries++;
          continue;
        }
        throw new Error("Google Places API rate limit exceeded");
      }

      // ZERO_RESULTS is not an error
      if (data.status === "ZERO_RESULTS") {
        const emptyResult: Place[] = [];
        searchCache.set(cacheKey, emptyResult);
        return emptyResult;
      }

      if (data.status !== "OK") {
        throw new Error(`Google Places API error: ${data.status}`);
      }

      // Parse results
      const places: Place[] = (data.results || []).map((result: any) => ({
        place_id: result.place_id,
        name: result.name,
        types: result.types || [],
        vicinity: result.vicinity,
        formatted_address: result.formatted_address,
        location: {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
        },
        rating: result.rating,
        user_ratings_total: result.user_ratings_total,
        opening_hours: result.opening_hours
          ? {
              open_now: result.opening_hours.open_now,
            }
          : undefined,
        googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${result.place_id}`,
        sourceKeywords: [keyword],
        categoriesMatched: [],
      }));

      // Cache result
      searchCache.set(cacheKey, places);

      return places;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw new Error("Google Places API request timeout");
      }
      if (retries < maxRetries) {
        const backoffMs = Math.pow(2, retries) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        retries++;
        continue;
      }
      throw error;
    }
  }

  return [];
}

/**
 * Plan queries based on mode
 */
function planQueries(params: SearchParams): {
  queries: Array<{ keyword: string; language: string; category?: string }>;
  fallbackQueries: Array<{ keyword: string; language: string; category?: string }>;
} {
  const queries: Array<{ keyword: string; language: string; category?: string }> = [];
  const fallbackQueries: Array<{ keyword: string; language: string; category?: string }> = [];

  if (params.mode === "brand" && params.brandKeywords && params.brandKeywords.length > 0) {
    // Brand mode: up to 5 brand queries
    const brandQueries = params.brandKeywords.slice(0, 5).map((brand) => ({
      keyword: brand,
      language: "sl",
    }));
    queries.push(...brandQueries);
  } else {
    // Category mode: 3 Slovenian queries
    queries.push(
      { keyword: CATEGORY_KEYWORDS.furniture.sl, language: "sl", category: "furniture" },
      { keyword: CATEGORY_KEYWORDS.tiles_bathroom.sl, language: "sl", category: "tiles_bathroom" },
      { keyword: CATEGORY_KEYWORDS.hardware.sl, language: "sl", category: "hardware" }
    );
  }

  // Plan fallback queries (English) - max 2 total
  if (params.mode !== "brand") {
    fallbackQueries.push(
      { keyword: CATEGORY_KEYWORDS.furniture.en, language: "en", category: "furniture" },
      { keyword: CATEGORY_KEYWORDS.tiles_bathroom.en, language: "en", category: "tiles_bathroom" },
      { keyword: CATEGORY_KEYWORDS.hardware.en, language: "en", category: "hardware" }
    );
  }

  return { queries, fallbackQueries };
}

/**
 * Merge and deduplicate places
 */
function mergePlaces(
  allPlaces: Array<{ place: Place; keyword: string; category?: string }>
): Place[] {
  const placeMap = new Map<string, Place>();

  for (const { place, keyword, category } of allPlaces) {
    const existing = placeMap.get(place.place_id);

    if (existing) {
      // Merge: add keyword and category
      if (!existing.sourceKeywords.includes(keyword)) {
        existing.sourceKeywords.push(keyword);
      }
      if (category && !existing.categoriesMatched.includes(category)) {
        existing.categoriesMatched.push(category);
      }
    } else {
      // New place
      const merged: Place = {
        ...place,
        sourceKeywords: [keyword],
        categoriesMatched: category ? [category] : [],
      };
      placeMap.set(place.place_id, merged);
    }
  }

  return Array.from(placeMap.values());
}

/**
 * Rank places
 */
function rankPlaces(places: Place[]): Place[] {
  return places.sort((a, b) => {
    // Primary: user_ratings_total (desc)
    const aRatings = a.user_ratings_total || 0;
    const bRatings = b.user_ratings_total || 0;
    if (bRatings !== aRatings) {
      return bRatings - aRatings;
    }

    // Secondary: rating (desc)
    const aRating = a.rating || 0;
    const bRating = b.rating || 0;
    if (bRating !== aRating) {
      return bRating - aRating;
    }

    // Tertiary: name (asc)
    return a.name.localeCompare(b.name);
  });
}

/**
 * Search places with cost control
 */
export async function searchPlaces(params: SearchParams): Promise<SearchResult> {
  const { lat, lng, radiusKm, dryRun = false } = params;

  // Validate radius
  const clampedRadiusKm = Math.max(1, Math.min(50, radiusKm));
  const radiusMeters = Math.round(clampedRadiusKm * 1000);

  // Plan queries
  const { queries, fallbackQueries } = planQueries(params);
  const plannedQueries = queries.map((q) => `${q.keyword} (${q.language})`);

  if (dryRun) {
    return {
      meta: {
        radiusMeters,
        requestsMade: 0,
        cacheHits: 0,
        fallbacksUsed: 0,
        plannedQueries,
        executionNotes: ["Dry run mode - no API calls made", "API debug: D)"],
        debugVersion: "D",
        debugVersionLabel: "D)",
      },
      places: [],
      stores: [],
      contractors: [],
      allowlistDomainsStores: [],
      allowlistDomainsContractors: [],
      status: 200,
    };
  }

  // Execute Phase 1: Slovenian queries
  const allPlaces: Array<{ place: Place; keyword: string; category?: string }> = [];
  let requestsMade = 0;
  let cacheHits = 0;
  const executionNotes: string[] = [];
  const categoryResults: Record<string, number> = {};

  // Execute queries with concurrency control
  const queryPromises = queries.map(async (query) => {
    return executeWithConcurrency(async () => {
      const cacheKey = getCacheKey(lat, lng, clampedRadiusKm, query.keyword, query.language, "si");
      const cached = searchCache.get(cacheKey);

      if (cached) {
        cacheHits++;
        cached.forEach((place) => {
          allPlaces.push({ place, keyword: query.keyword, category: query.category });
        });
        return cached.length;
      }

      requestsMade++;
      const places = await fetchPlaces(query.keyword, lat, lng, radiusMeters, query.language, "si");
      const count = places.length;
      categoryResults[query.category || "unknown"] = count;

      places.forEach((place) => {
        allPlaces.push({ place, keyword: query.keyword, category: query.category });
      });

      return count;
    });
  });

  await Promise.all(queryPromises);

  // Phase 2: English fallback (max 2 queries total; strict cap so total requests ≤ MAX_REQUESTS_PER_SEARCH)
  let fallbacksUsed = 0;
  const fallbackBudget = Math.min(2, MAX_REQUESTS_PER_SEARCH - requestsMade);

  if (params.mode !== "brand" && fallbacksUsed < fallbackBudget) {
    // Prioritize categories with 0 results
    const zeroResultCategories = Object.entries(categoryResults)
      .filter(([_, count]) => count === 0)
      .map(([category]) => category);

    // Then categories with fewest results
    const sortedCategories = Object.entries(categoryResults)
      .sort(([_, a], [__, b]) => a - b)
      .map(([category]) => category);

    const priorityCategories = [...zeroResultCategories, ...sortedCategories].slice(0, fallbackBudget);

    for (const category of priorityCategories) {
      if (fallbacksUsed >= fallbackBudget || requestsMade >= MAX_REQUESTS_PER_SEARCH) break;

      const fallbackQuery = fallbackQueries.find((q) => q.category === category);
      if (!fallbackQuery) continue;

      await executeWithConcurrency(async () => {
        const cacheKey = getCacheKey(lat, lng, clampedRadiusKm, fallbackQuery.keyword, fallbackQuery.language, "si");
        const cached = searchCache.get(cacheKey);

        if (cached) {
          cacheHits++;
          cached.forEach((place) => {
            allPlaces.push({ place, keyword: fallbackQuery.keyword, category: fallbackQuery.category });
          });
          return;
        }

        requestsMade++;
        fallbacksUsed++;
        executionNotes.push(`Fallback query: ${fallbackQuery.keyword} (${category})`);

        const places = await fetchPlaces(fallbackQuery.keyword, lat, lng, radiusMeters, fallbackQuery.language, "si");
        places.forEach((place) => {
          allPlaces.push({ place, keyword: fallbackQuery.keyword, category: fallbackQuery.category });
        });
      });
    }
  }

  // Ensure we didn't exceed the cap
  if (requestsMade > MAX_REQUESTS_PER_SEARCH) {
    executionNotes.push(`Warning: Exceeded max requests (${requestsMade} > ${MAX_REQUESTS_PER_SEARCH})`);
  }

  // Merge and dedupe
  const merged = mergePlaces(allPlaces);

  // Calculate distances and filter by radius
  const placesWithDistance = merged.map((place) => {
    const distanceMeters = haversineDistanceMeters(
      lat,
      lng,
      place.location.lat,
      place.location.lng
    );
    return {
      ...place,
      distanceMeters,
      distanceKm: Math.round((distanceMeters / 1000) * 100) / 100, // Round to 2 decimals
    };
  });

  // Hard filter: remove places outside radius
  const beforeFilterCount = placesWithDistance.length;
  const filtered = placesWithDistance.filter(
    (place) => place.distanceMeters <= radiusMeters
  );
  const filteredOutCount = beforeFilterCount - filtered.length;

  if (filteredOutCount > 0) {
    executionNotes.push(
      `Post-filter removed ${filteredOutCount} out-of-radius results`
    );
  }

  // Rank filtered results
  const ranked = rankPlaces(filtered);
  const limited = ranked.slice(0, MAX_PLACES);

  const candidatesFound = filtered.length;
  let detailsFetched = 0;
  let discardedNoWebsiteStores = 0;
  let discardedDomainNotOfficialStores = 0;
  let discardedLowStoreScore = 0;
  let discardedLowServiceScore = 0;
  let reclassifiedToServices = 0;

  // Strict store/contractor pipeline: fetch details, score, reject bad domains, classify into store OR contractor only
  const onlyWithWebsite = params.onlyWithWebsite !== false;
  const debugMode = params.debug === true;
  let stores: PlaceResult[] = [];
  let contractors: PlaceResult[] = [];
  const rejectionReasons: Array<{ name: string; place_id?: string; reason: string }> = [];
  const classificationSignals: Array<{ name: string; storeScore: number; contractorScore: number; serviceHintScore: number; bucket?: string; rejected?: boolean }> = [];
  let debugCandidates: StoreOrServicePlace[] = [];
  let debugDiscarded: DiscardedPlace[] = [];

  if (onlyWithWebsite && !dryRun && limited.length > 0) {
    executionNotes.push("API debug: D)");

    const toEnrich = limited.slice(0, MAX_DETAILS_PER_SEARCH);
    const enriched: StoreOrServicePlace[] = [];

    for (let i = 0; i < toEnrich.length; i += DETAILS_CONCURRENCY) {
      const batch = toEnrich.slice(i, i + DETAILS_CONCURRENCY);
      const detailsResults = await Promise.all(
        batch.map((p) => getPlaceDetails(p.place_id))
      );
      detailsFetched += batch.length;
      for (let j = 0; j < batch.length; j++) {
        const place = batch[j];
        const details = detailsResults[j];
        const types = details?.types?.length ? details.types : place.types;
        const website =
          details?.website && String(details.website).trim()
            ? String(details.website).trim()
            : undefined;
        const websiteDomain = website ? extractDomain(website) : undefined;
        const websiteQuality = websiteDomain
          ? classifyWebsiteQuality(websiteDomain)
          : undefined;
        const storeScore = computeStoreScore(
          types,
          details?.rating ?? place.rating,
          details?.user_ratings_total ?? place.user_ratings_total
        );
        let serviceScore = computeServiceScore(
          types,
          details?.formatted_phone_number,
          details?.opening_hours ?? place.opening_hours
        );
        let serviceHintScore = computeServiceHintScore(types, website, place.name);
        const boosts = applyServiceBoosts(types, place.name, serviceHintScore, serviceScore);
        serviceHintScore = boosts.serviceHintScore;
        serviceScore = boosts.serviceScore;

        const item: StoreOrServicePlace = {
          ...place,
          types,
          website,
          websiteDomain,
          formatted_phone_number: details?.formatted_phone_number,
          storeScore,
          serviceScore,
          serviceHintScore,
          websiteQuality,
        };
        if (debugMode && boosts.reasons.length > 0) item.serviceHintReasons = boosts.reasons;
        enriched.push(item);

        if (storeScore >= 0.7 && !website) discardedNoWebsiteStores++;
        else if (storeScore >= 0.7 && websiteQuality !== "official") discardedDomainNotOfficialStores++;
        else if (storeScore < 0.7) discardedLowStoreScore++;
        if (serviceScore < 0.55) discardedLowServiceScore++;

        if (debugMode) {
          classificationSignals.push({
            name: place.name,
            storeScore,
            contractorScore: serviceScore,
            serviceHintScore,
          });
        }
      }
    }

    if (debugMode) debugCandidates = [...enriched];

    // Hard reject: no website
    const withWebsite = enriched.filter((p) => p.website && p.websiteDomain);
    for (const p of enriched) {
      if (!p.website && onlyWithWebsite) {
        rejectionReasons.push({ name: p.name, place_id: p.place_id, reason: "no_website" });
        if (debugMode) debugDiscarded.push({ place: p, reason: "no_website" });
      } else if (p.websiteDomain && isRejectedDomain(p.websiteDomain)) {
        rejectionReasons.push({ name: p.name, place_id: p.place_id, reason: "domain_directory_or_social" });
        if (debugMode) debugDiscarded.push({ place: p, reason: "domain_directory_or_social" });
      }
    }
    const notRejected = withWebsite.filter((p) => !isRejectedDomain(p.websiteDomain!));

    // Strict classification: contractor if serviceHintScore >= 0.70; else store candidate if storeScore >= 0.70 and contractorScore < 0.55; else contractor if contractorScore >= 0.55; else reject (ambiguous)
    const contractorPool = notRejected.filter((p) => (p.serviceHintScore ?? 0) >= 0.7);
    reclassifiedToServices = contractorPool.length;
    const storePool = notRejected.filter((p) => (p.serviceHintScore ?? 0) < 0.7 && (p.storeScore ?? 0) >= 0.7 && (p.serviceScore ?? 0) < 0.55);
    const contractorPool2 = notRejected.filter(
      (p) =>
        (p.serviceHintScore ?? 0) < 0.7 &&
        !((p.storeScore ?? 0) >= 0.7 && (p.serviceScore ?? 0) < 0.55) &&
        (p.serviceScore ?? 0) >= 0.55
    );
    const ambiguous = notRejected.filter(
      (p) =>
        (p.serviceHintScore ?? 0) < 0.7 &&
        !((p.storeScore ?? 0) >= 0.7 && (p.serviceScore ?? 0) < 0.55) &&
        (p.serviceScore ?? 0) < 0.55 &&
        (p.storeScore ?? 0) < 0.7
    );
    for (const p of ambiguous) {
      rejectionReasons.push({ name: p.name, place_id: p.place_id, reason: "ambiguous_classification" });
      if (debugMode) debugDiscarded.push({ place: p, reason: "ambiguous_classification" });
    }

    // Store bucket: official + catalogSignal === true only; de-dup by domain
    const storeCandidates = storePool.filter(
      (p) => p.websiteQuality === "official" && (p.storeScore ?? 0) >= 0.7
    );
    const MAX_CATALOG_CHECKS = 15;
    const CATALOG_CONCURRENCY = 2;
    const toCheck = storeCandidates.slice(0, MAX_CATALOG_CHECKS);
    const catalogResults: CatalogCheckResult[] = [];
    for (let i = 0; i < toCheck.length; i += CATALOG_CONCURRENCY) {
      const batch = toCheck.slice(i, i + CATALOG_CONCURRENCY);
      const results = await Promise.all(batch.map((p) => checkProductCatalogSignal(p.website!)));
      catalogResults.push(...results);
      for (let k = 0; k < batch.length; k++) {
        const place = batch[k] as StoreOrServicePlace;
        place.catalogSignal = results[k].signal;
        if (debugMode && results[k].probe) place.catalogProbe = results[k].probe;
        if (results[k].signal !== true && debugMode)
          debugDiscarded.push({ place, reason: results[k].signal === "unknown" ? "catalog_unknown" : "no_catalog_signal" });
      }
    }
    const withCatalogSignal = toCheck.filter((_, idx) => catalogResults[idx].signal === true);

    const storeByDomain = new Map<string, StoreOrServicePlace>();
    for (const p of withCatalogSignal) {
      const d = (p.websiteDomain || extractDomain(p.website || "")).toLowerCase();
      if (!d) continue;
      const existing = storeByDomain.get(d);
      if (!existing || (p.storeScore ?? 0) > (existing.storeScore ?? 0)) storeByDomain.set(d, p);
    }
    const storeList = Array.from(storeByDomain.values());

    const contractorCandidates = [...contractorPool, ...contractorPool2].filter(
      (p) => p.websiteQuality === "official"
    );
    const contractorByDomain = new Map<string, StoreOrServicePlace>();
    for (const p of contractorCandidates) {
      const d = (p.websiteDomain || extractDomain(p.website || "")).toLowerCase();
      if (!d) continue;
      const existing = contractorByDomain.get(d);
      if (!existing || (p.serviceScore ?? 0) > (existing.serviceScore ?? 0)) contractorByDomain.set(d, p);
    }
    const contractorList = Array.from(contractorByDomain.values());

    function toPlaceResult(p: StoreOrServicePlace, bucket: "store" | "contractor"): PlaceResult {
      const domain = (p.websiteDomain || extractDomain(p.website || "")).toLowerCase();
      const quality = p.websiteQuality ?? "official";
      const isDirOrSocial = quality === "social" || quality === "directory";
      return {
        name: p.name,
        place_id: p.place_id,
        rating: p.rating,
        user_ratings_total: p.user_ratings_total,
        distanceKm: p.distanceKm ?? 0,
        website: p.website ?? "",
        websiteDomain: domain,
        categoryBucket: bucket,
        types: p.types ?? [],
        qualityFlags: {
          officialSite: quality === "official",
          hasCatalogSignal: p.catalogSignal === true,
          isDirectoryOrSocial: isDirOrSocial,
          isAggregator: quality === "directory",
        },
      };
    }

    stores = storeList.map((p) => toPlaceResult(p, "store"));
    contractors = contractorList.map((p) => toPlaceResult(p, "contractor"));

    if (debugMode) {
      for (const s of classificationSignals) {
        const place = enriched.find((e) => e.name === s.name);
        if (place) {
          const inStores = storeList.some((x) => x.place_id === place.place_id);
          const inContractors = contractorList.some((x) => x.place_id === place.place_id);
          s.bucket = inStores ? "store" : inContractors ? "contractor" : undefined;
          s.rejected = !inStores && !inContractors;
        }
        if (rejectionReasons.some((r) => r.name === s.name)) s.rejected = true;
      }
    }
  } else if (!onlyWithWebsite && !dryRun) {
    executionNotes.push("API debug: D)");
  }

  const finalPlaces: Place[] = [];
  if (!dryRun && !executionNotes.some((n) => n.includes("API debug: D)"))) {
    executionNotes.push("API debug: D)");
  }

  const allowlistDomainsStores = [...new Set(stores.map((s) => s.websiteDomain).filter(Boolean))];
  const allowlistDomainsContractors = [...new Set(contractors.map((c) => c.websiteDomain).filter(Boolean))];

  let debugDistances: Array<{ name: string; distanceKm: number }> | undefined;
  if (process.env.NODE_ENV === "development" && stores.length > 0) {
    debugDistances = stores.slice(0, 5).map((p) => ({ name: p.name, distanceKm: p.distanceKm }));
  }

  const result: SearchResult = {
    meta: {
      radiusMeters,
      requestsMade,
      cacheHits,
      fallbacksUsed,
      plannedQueries,
      executionNotes,
      usedLocation: { lat, lng },
      filteredOutCount,
      candidatesFound,
      detailsFetched,
      discardedOutOfRadius: filteredOutCount,
      discardedNoWebsiteStores,
      discardedDomainNotOfficialStores,
      discardedLowStoreScore,
      discardedLowServiceScore,
      reclassifiedToServices,
      debugVersion: "D",
      debugVersionLabel: "D)",
      ...(debugDistances && { debugDistances }),
    },
    places: finalPlaces,
    stores,
    contractors,
    allowlistDomainsStores,
    allowlistDomainsContractors,
    status: 200,
  };
  if (debugMode) {
    result.debug = {
      rejectionReasons,
      classificationSignals,
      candidates: debugCandidates,
      discarded: debugDiscarded,
    };
  }
  return result;
}

/**
 * Fetch place details (lazy loading)
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY not configured");
  }

  // Check cache
  const cached = detailsCache.get(placeId);
  if (cached) {
    return cached;
  }

  const fields = "place_id,name,formatted_address,geometry,rating,user_ratings_total,formatted_phone_number,website,opening_hours,url,types";
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&language=sl&region=si&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Google Places Details API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== "OK" || !data.result) {
      return null;
    }

    const result = data.result;
    const details: PlaceDetails = {
      place_id: result.place_id,
      name: result.name,
      types: result.types || [],
      formatted_address: result.formatted_address,
      location: {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
      },
      rating: result.rating,
      user_ratings_total: result.user_ratings_total,
      formatted_phone_number: result.formatted_phone_number,
      website: result.website,
      opening_hours: result.opening_hours
        ? {
            open_now: result.opening_hours.open_now,
            weekday_text: result.opening_hours.weekday_text,
          }
        : undefined,
      url: result.url,
      googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${result.place_id}`,
      sourceKeywords: [],
      categoriesMatched: [],
    };

    // Cache details
    detailsCache.set(placeId, details);

    return details;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      throw new Error("Google Places Details API request timeout");
    }
    throw error;
  }
}
