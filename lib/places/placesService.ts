/**
 * Cost-controlled Google Places search service
 * Minimizes API usage while maintaining good coverage
 */

import { TTLCache } from "@/lib/cache";
import { haversineDistanceMeters } from "@/lib/geo/haversine";
import { checkProductCatalogSignal, type CatalogProbe, type CatalogCheckResult, type CatalogSignalResult } from "@/lib/places/catalogSignal";
import { normalizeDomainToRoot, isRejectedDomain as isRejectedDomainUtil } from "@/lib/places/domainUtils";
import { normalizeDomainToRoot as normalizeDomainToRootForAllowlist } from "@/lib/serp/domains";
import { placeTypesToTaxonomyCategories } from "@/lib/serp/taxonomy";

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
  /** If true (default), only include places with website in domain allowlists; stores/contractors lists still show all (with/without website). */
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
  /** Second-pass store discovery: Places types (dry run shows without API calls) */
  plannedTypes?: string[];
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
  /** Unique normalized domains: stores (product search), contractors (service search). */
  domains: { stores: string[]; contractors: string[] };
  /** Alias for C) product SERP. */
  allowlistDomainsStores: string[];
  /** Alias for C) service SERP. */
  allowlistDomainsContractors: string[];
  /** Domain → taxonomy categories for category-based SERP routing (from store Place.types). */
  domainCategoryMapStores?: Record<string, string[]>;
  status: number;
  /** Only when debug=true. */
  debug?: {
    rejectionReasons?: Array<{ name: string; place_id?: string; reason: string }>;
    storesDropped?: Array<{ name: string; place_id?: string; reason: string }>;
    contractorsDropped?: Array<{ name: string; place_id?: string; reason: string }>;
    scoringNotes?: string[];
    classificationSignals?: Array<{ name: string; storeScore: number; contractorScore: number; serviceHintScore: number; bucket?: string; rejected?: boolean }>;
    candidates?: StoreOrServicePlace[];
    discarded?: DiscardedPlace[];
  };
}

// Constants
const MAX_CONCURRENCY = 2;
const REQUESTS_PER_SECOND = 3;
const REQUEST_TIMEOUT_MS = 6000;
const CACHE_TTL_SEARCH = 14 * 24 * 60 * 60 * 1000; // 14 days
const CACHE_TTL_DETAILS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Max places after merge + distance filter (before details); increased for multi-pass. */
const MAX_PLACES = 100;
const MAX_DETAILS_PER_SEARCH = 80;
const DETAILS_CONCURRENCY = 3;
const MAX_DOMAINS_PER_LIST = 10;
/** Cap stores and contractors arrays each to this many places. */
const MAX_PLACES_OUTPUT = 20;

/** Multi-pass store discovery: category keywords (Slovenian), NOT store names. All required retail categories. */
const STORE_CATEGORY_KEYWORDS = [
  // hardware/DIY
  "gradbeni center železnina",
  "orodje železnina gradbeni",
  // bathroom/tiles
  "tla keramika ploščice kopalnica",
  "keramika ploščice sanitarna oprema",
  // flooring
  "laminat vinil parket talne obloge",
  // paint & walls
  "barve stene maloprodaja",
  "notranje barve premaz lazura stene",
  // furniture
  "pohištvo omare postelje police",
  "mize stoli sedežne vzmetnice nočne omarice",
  // lighting
  "svetila elektrika luči",
  "stropne luči LED paneli razsvetljava",
  // decor/textiles
  "tekstil dekoracija zavese",
];

/** Second-pass: Places API types for big-box retailers (one type per request). Exclude electronics_store (noise), department_store (we penalise it). */
const STORE_TYPES_FOR_SEARCH: string[] = [
  "hardware_store",
  "home_goods_store",
  "furniture_store",
  "lighting_store",
];

/** Contractor discovery: all required trades (Slovenian). Multiple queries for full coverage. */
const CONTRACTORS_QUERY_KEYWORDS = [
  "pleskar električar vodovodar keramičar polagalec ploščic",
  "monter pohištva sestavljalec pohištva montaža adaptacije renovacije",
  "polagalec talnih oblog parketar talne obloge",
  "suhomontažer mizar",
];

// Category keywords (Slovenian-first) – used when mode is brand for fallback
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

/** Google Place types that indicate a retail store (SERP-friendly). Exclude "store" (too broad) and "shopping_mall" (location, not store). */
const STORE_TYPES = [
  "furniture_store",
  "hardware_store",
  "home_goods_store",
  "lighting_store",
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

/** Slovenian (and common) name/category keywords that imply CONTRACTOR (service). Never put in stores. */
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
  "parket",
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

/** Domain substrings that imply service provider (contractor). If domain contains any → contractor. */
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

/**
 * True if websiteDomain matches service-domain heuristics (treat as contractor).
 */
export function isServiceDomainByHeuristic(websiteDomain: string): boolean {
  if (!websiteDomain || !String(websiteDomain).trim()) return false;
  const d = String(websiteDomain).toLowerCase().replace(/^www\./, "").trim();
  return SERVICE_DOMAIN_PATTERNS.some((p) => d.includes(p));
}

/**
 * Classify a place into exactly one bucket (store or contractor) or null (ambiguous).
 * Based on Place types + name keywords + optional websiteDomain heuristics.
 * If both store and contractor match, prefer contractor (safer).
 * Exported for tests (Slovenian classification).
 */
export function classifyPlaceBucket(
  types: string[],
  name: string,
  websiteDomain?: string | null
): "store" | "contractor" | null {
  const t = types.map((x) => x.toLowerCase());
  const n = (name ?? "").toLowerCase();
  const hasStoreType = t.some((x) => STORE_TYPES.includes(x as any));
  const hasServiceType = t.some((x) => SERVICE_TYPES.includes(x as any));
  const nameMatchesContractor = CONTRACTOR_NAME_KEYWORDS_SL.some((kw) => n.includes(kw.toLowerCase()));
  const domainMatchesService = websiteDomain ? isServiceDomainByHeuristic(websiteDomain) : false;

  if (domainMatchesService || nameMatchesContractor || hasServiceType) {
    return "contractor";
  }
  if (hasStoreType && !nameMatchesContractor) {
    return "store";
  }
  return null;
}

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

/** Use shared reject list from domainUtils. */
function isRejectedDomain(domain: string): boolean {
  return isRejectedDomainUtil(domain);
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
 * Strong store types +0.7; weak "store"/"shopping_mall" +0.15/+0.1 only.
 */
export function computeStoreScore(
  types: string[],
  rating?: number,
  user_ratings_total?: number
): number {
  const t = types.map((x) => x.toLowerCase());
  let score = 0;

  if (t.some((x) => STORE_TYPES.includes(x as any))) score += 0.7;
  if (t.includes("store")) score += 0.15;
  if (t.includes("shopping_mall")) score += 0.1;
  if (t.some((x) => RETAIL_NEGATIVE_TYPES.includes(x as any))) score -= 0.9;
  if (t.includes("shopping_mall") && !t.some((x) => STORE_TYPES.includes(x as any))) score -= 0.2;

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
const SERVICE_URL_PATTERNS = ["/services", "/booking", "/contact", "/pricing", "/cenik", "/storitve", "/povpraševanje", "/montaža", "/pleskanje", "/kontakt"];

/** Path/URL patterns that suggest ecommerce/catalog (stores). */
const CATALOG_PATH_PATTERNS = ["/p/", "/product", "/izdelek", "/shop", "/kategorija", "cart", "cena", "/trgovina", "/artikel"];

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
 * Extract root domain from URL for site: queries (uses domainUtils).
 */
export function extractDomain(websiteUrl: string): string {
  return normalizeDomainToRoot(websiteUrl);
}

/** Generic name tokens to ignore when matching domain (avoid false positives). */
const GENERIC_NAME_TOKENS = new Set([
  "center", "centre", "trgovina", "d.o.o", "doo", "outlet", "salon", "poslovalnica",
  "trgovski", "dipo", "d.o.o.", "s.p", "sp", "storitve", "slovenija", "ljubljana",
  "celje", "maribor", "kranj", "koper", "novo", "mesto", "group", "plus",
]);

/** True if domain looks like the business: at least one brand-like name token (length ≥4, not generic) appears in domain. */
function isOfficialDomain(domain: string, businessName: string): boolean {
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

/** True if URL path suggests ecommerce/catalog (stores). */
function hasCatalogPathSignal(url: string): boolean {
  try {
    const path = new URL(url.startsWith("http") ? url : `https://${url}`).pathname.toLowerCase();
    return CATALOG_PATH_PATTERNS.some((p) => path.includes(p) || url.toLowerCase().includes(p));
  } catch {
    return false;
  }
}

/** True if URL path suggests services (contractors). */
function hasServicePathSignal(url: string): boolean {
  try {
    const path = new URL(url.startsWith("http") ? url : `https://${url}`).pathname.toLowerCase();
    const lower = url.toLowerCase();
    return (
      SERVICE_URL_PATTERNS.some((p) => path.includes(p) || lower.includes(p)) ||
      ["storitve", "povpraševanje", "kontakt", "cenik", "montaža", "pleskanje"].some((k) => path.includes(k) || lower.includes(k))
    );
  } catch {
    return false;
  }
}

// Caches
const searchCache = new TTLCache<Place[]>(CACHE_TTL_SEARCH);
const detailsCache = new TTLCache<PlaceDetails>(CACHE_TTL_DETAILS);

// Throttling state
let lastRequestTime = 0;
let activeRequests = 0;

/**
 * Round coordinates to 3 decimals for cache key
 */
function roundCoordinate(coord: number): number {
  return Math.round(coord * 1000) / 1000;
}

/**
 * Generate cache key for keyword search
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

/** Cache key for type-based Nearby Search (second pass). */
function getCacheKeyForType(
  lat: number,
  lng: number,
  radiusKm: number,
  placeType: string,
  language: string,
  region: string
): string {
  const roundedLat = roundCoordinate(lat);
  const roundedLng = roundCoordinate(lng);
  return `places:type:${roundedLat}:${roundedLng}:${radiusKm}:${placeType}:${language}:${region}`;
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
 * Fetch places by Google Place type (second pass: big-box retailers).
 * Uses Nearby Search with type= parameter (no keyword).
 */
async function fetchPlacesByType(
  placeType: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  language: string = "sl",
  region: string = "si"
): Promise<Place[]> {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY not configured");
  }

  const cacheKey = getCacheKeyForType(lat, lng, radiusMeters / 1000, placeType, language, region);
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const location = `${lat},${lng}`;
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&radius=${radiusMeters}&type=${encodeURIComponent(placeType)}&language=${language}&region=${region}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  let retries = 0;
  const maxRetries = 2;

  while (retries <= maxRetries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`Google Places API error: ${response.status}`);
      const data = await response.json();

      if (data.status === "OVER_QUERY_LIMIT" || response.status === 429) {
        if (retries < maxRetries) {
          await new Promise((r) => setTimeout(r, Math.pow(2, retries) * 1000));
          retries++;
          continue;
        }
        throw new Error("Google Places API rate limit exceeded");
      }

      if (data.status === "ZERO_RESULTS") {
        searchCache.set(cacheKey, []);
        return [];
      }
      if (data.status !== "OK") throw new Error(`Google Places API error: ${data.status}`);

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
        opening_hours: result.opening_hours ? { open_now: result.opening_hours.open_now } : undefined,
        googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${result.place_id}`,
        sourceKeywords: [],
        categoriesMatched: [placeType],
      }));
      searchCache.set(cacheKey, places);
      return places;
    } catch (error: any) {
      if (error.name === "AbortError") throw new Error("Google Places API request timeout");
      if (retries < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, retries) * 1000));
        retries++;
        continue;
      }
      throw error;
    }
  }
  return [];
}

/**
 * Plan multi-pass discovery: store category keywords + store types + contractors.
 * Stores: multiple keyword-based searches per category, then type-based pass.
 * Contractors: single keyword search.
 */
function planMultiPassStoresAndContractors(params: SearchParams): {
  storesKeywordQueries: Array<{ keyword: string; language: string }>;
  storesTypeQueries: Array<{ type: string }>;
  contractorsQueries: Array<{ keyword: string; language: string }>;
} {
  if (params.mode === "brand" && params.brandKeywords && params.brandKeywords.length > 0) {
    const kw = params.brandKeywords.slice(0, 2).join(" ");
    return {
      storesKeywordQueries: [{ keyword: kw, language: "sl" }],
      storesTypeQueries: STORE_TYPES_FOR_SEARCH.map((t) => ({ type: t })),
      contractorsQueries: CONTRACTORS_QUERY_KEYWORDS.map((keyword) => ({ keyword, language: "sl" })),
    };
  }
  return {
    storesKeywordQueries: STORE_CATEGORY_KEYWORDS.map((keyword) => ({ keyword, language: "sl" })),
    storesTypeQueries: STORE_TYPES_FOR_SEARCH.map((t) => ({ type: t })),
    contractorsQueries: CONTRACTORS_QUERY_KEYWORDS.map((keyword) => ({ keyword, language: "sl" })),
  };
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
 * Search places with cost control (multi-pass: store category keywords + types + contractors).
 */
export async function searchPlaces(params: SearchParams): Promise<SearchResult> {
  const { lat, lng, radiusKm, dryRun = false } = params;

  const clampedRadiusKm = Math.max(1, Math.min(50, radiusKm));
  const radiusMeters = Math.round(clampedRadiusKm * 1000);

  const { storesKeywordQueries, storesTypeQueries, contractorsQueries } = planMultiPassStoresAndContractors(params);
  const plannedQueries = [
    ...storesKeywordQueries.map((q) => `stores: ${q.keyword} (${q.language})`),
    ...contractorsQueries.map((q) => `contractors: ${q.keyword} (${q.language})`),
  ];
  const plannedTypes = storesTypeQueries.map((q) => q.type);

  if (dryRun) {
    return {
      meta: {
        radiusMeters,
        requestsMade: 0,
        cacheHits: 0,
        fallbacksUsed: 0,
        plannedQueries,
        plannedTypes,
        executionNotes: ["Dry run mode - no API calls made", "API debug: D)"],
        debugVersion: "D",
        debugVersionLabel: "D)",
      },
      places: [],
      stores: [],
      contractors: [],
      domains: { stores: [], contractors: [] },
      allowlistDomainsStores: [],
      allowlistDomainsContractors: [],
      domainCategoryMapStores: undefined,
      status: 200,
    };
  }

  const allPlaces: Array<{ place: Place; intent: "store" | "contractor" }> = [];
  let requestsMade = 0;
  let cacheHits = 0;
  const executionNotes: string[] = [];

  // Pass 1: store category keyword searches (merge, dedupe by place_id later)
  for (const query of storesKeywordQueries) {
    await executeWithConcurrency(async () => {
      const cacheKey = getCacheKey(lat, lng, clampedRadiusKm, query.keyword, query.language, "si");
      const cached = searchCache.get(cacheKey);
      if (cached) {
        cacheHits++;
        cached.forEach((place) => allPlaces.push({ place, intent: "store" }));
        return;
      }
      requestsMade++;
      const places = await fetchPlaces(query.keyword, lat, lng, radiusMeters, query.language, "si");
      places.forEach((place) => allPlaces.push({ place, intent: "store" }));
    });
  }

  // Pass 2: store type-based searches (big-box retailers)
  for (const typeQuery of storesTypeQueries) {
    await executeWithConcurrency(async () => {
      const cacheKey = getCacheKeyForType(lat, lng, clampedRadiusKm, typeQuery.type, "sl", "si");
      const cached = searchCache.get(cacheKey);
      if (cached) {
        cacheHits++;
        cached.forEach((place) => allPlaces.push({ place, intent: "store" }));
        return;
      }
      requestsMade++;
      const places = await fetchPlacesByType(typeQuery.type, lat, lng, radiusMeters, "sl", "si");
      places.forEach((place) => allPlaces.push({ place, intent: "store" }));
    });
  }

  // Contractors: single keyword search
  for (const query of contractorsQueries) {
    await executeWithConcurrency(async () => {
      const cacheKey = getCacheKey(lat, lng, clampedRadiusKm, query.keyword, query.language, "si");
      const cached = searchCache.get(cacheKey);
      if (cached) {
        cacheHits++;
        cached.forEach((place) => allPlaces.push({ place, intent: "contractor" }));
        return;
      }
      requestsMade++;
      const places = await fetchPlaces(query.keyword, lat, lng, radiusMeters, query.language, "si");
      places.forEach((place) => allPlaces.push({ place, intent: "contractor" }));
    });
  }

  // Dedupe by place_id: keep first (store then contractor); keep intent for classification prior
  const placeById = new Map<string, { place: Place; intent: "store" | "contractor" }>();
  for (const { place, intent } of allPlaces) {
    if (!placeById.has(place.place_id)) placeById.set(place.place_id, { place, intent });
  }
  const mergedWithIntent = Array.from(placeById.values());

  // Calculate distances and filter by radius; keep intent
  const withDistance = mergedWithIntent.map(({ place, intent }) => {
    const distanceMeters = haversineDistanceMeters(lat, lng, place.location.lat, place.location.lng);
    return {
      place: {
        ...place,
        distanceMeters,
        distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
      },
      intent,
    };
  });

  const beforeFilterCount = withDistance.length;
  const filteredWithIntent = withDistance.filter(({ place }) => place.distanceMeters! <= radiusMeters);
  const filteredOutCount = beforeFilterCount - filteredWithIntent.length;
  if (filteredOutCount > 0) {
    executionNotes.push(`Post-filter removed ${filteredOutCount} out-of-radius results`);
  }

  const filteredPlaces = filteredWithIntent.map(({ place }) => place);
  const ranked = rankPlaces(filteredPlaces);
  const intentByPlaceId = new Map(filteredWithIntent.map(({ place, intent }) => [place.place_id, intent]));
  const limited = ranked.slice(0, MAX_PLACES);
  const limitedWithIntent = limited.map((place) => ({
    place,
    intent: intentByPlaceId.get(place.place_id) ?? "store",
  }));

  const candidatesFound = filteredPlaces.length;
  let detailsFetched = 0;
  const onlyWithWebsite = params.onlyWithWebsite !== false;
  const debugMode = params.debug === true;

  const storesDropped: Array<{ name: string; place_id?: string; reason: string }> = [];
  const contractorsDropped: Array<{ name: string; place_id?: string; reason: string }> = [];
  const scoringNotes: string[] = [];

  // Enrich all (no pre-classification drop); classify after details with intent as prior
  const toEnrich = limitedWithIntent.slice(0, MAX_DETAILS_PER_SEARCH);
  type EnrichedPlace = Place & {
    types: string[];
    website?: string;
    websiteDomain?: string;
    distanceKm: number;
    bucket: "store" | "contractor";
    formatted_phone_number?: string;
  };
  const enriched: EnrichedPlace[] = [];

  for (let i = 0; i < toEnrich.length; i += DETAILS_CONCURRENCY) {
    const batch = toEnrich.slice(i, i + DETAILS_CONCURRENCY);
    const detailsResults = await Promise.all(batch.map(({ place }) => getPlaceDetails(place.place_id)));
    detailsFetched += batch.length;
    for (let j = 0; j < batch.length; j++) {
      const { place, intent } = batch[j];
      const details = detailsResults[j];
      const types = details?.types?.length ? details.types : place.types;
      const website = details?.website && String(details.website).trim() ? String(details.website).trim() : undefined;
      const websiteDomain = website ? normalizeDomainToRoot(website) : undefined;
      const phone = details?.formatted_phone_number;
      let bucket = classifyPlaceBucket(types, place.name, websiteDomain);
      if (bucket === null) bucket = intent;
      else if (bucket === "contractor") bucket = "contractor";
      else if (bucket === "store" && intent === "contractor") bucket = "contractor";
      enriched.push({
        ...place,
        types,
        website,
        websiteDomain,
        distanceKm: place.distanceKm ?? 0,
        bucket,
        formatted_phone_number: phone,
      });
    }
  }

  // onlyWithWebsite applies only to domain allowlist; do NOT drop stores/contractors without website from lists
  const storeEnriched = enriched.filter((p) => p.bucket === "store");
  const contractorEnriched = enriched.filter((p) => p.bucket === "contractor");

  const storeByDomain = new Map<string, typeof enriched[0]>();
  const contractorByDomain = new Map<string, typeof enriched[0]>();

  for (const p of storeEnriched) {
    if (!p.website || !p.websiteDomain) continue; // domain allowlist: only places with website
    if (isRejectedDomain(p.websiteDomain)) {
      storesDropped.push({ name: p.name, place_id: p.place_id, reason: "domain_rejected" });
      continue;
    }
    const official = isOfficialDomain(p.websiteDomain, p.name);
    const catalogPath = hasCatalogPathSignal(p.website);
    const storeScore = computeStoreScore(p.types, p.rating, p.user_ratings_total);
    const includeDomain = official && (catalogPath || storeScore >= 0.7);
    if (!includeDomain) {
      storesDropped.push({ name: p.name, place_id: p.place_id, reason: official ? "no_catalog_signal" : "domain_not_official" });
      continue;
    }
    const d = p.websiteDomain.toLowerCase();
    const existing = storeByDomain.get(d);
    if (!existing || (p.user_ratings_total ?? 0) > (existing.user_ratings_total ?? 0)) storeByDomain.set(d, p);
  }

  for (const p of contractorEnriched) {
    if (!p.website || !p.websiteDomain) continue;
    if (isRejectedDomain(p.websiteDomain)) {
      contractorsDropped.push({ name: p.name, place_id: p.place_id, reason: "domain_rejected" });
      continue;
    }
    const official = isOfficialDomain(p.websiteDomain, p.name);
    const servicePath = hasServicePathSignal(p.website);
    const serviceType = p.types.some((t) => (SERVICE_TYPES as readonly string[]).includes(t.toLowerCase()));
    const nameMatchesContractor = CONTRACTOR_NAME_KEYWORDS_SL.some((kw) => (p.name ?? "").toLowerCase().includes(kw));
    const domainServiceHeuristic = isServiceDomainByHeuristic(p.websiteDomain);
    const hasPhone = !!p.formatted_phone_number && String(p.formatted_phone_number).trim().length > 0;
    const contractorSignal = servicePath || serviceType || nameMatchesContractor || domainServiceHeuristic || hasPhone;
    if (!official || !contractorSignal) {
      contractorsDropped.push({ name: p.name, place_id: p.place_id, reason: official ? "no_contractor_signal" : "domain_not_official" });
      continue;
    }
    const d = p.websiteDomain.toLowerCase();
    const existing = contractorByDomain.get(d);
    if (!existing || (p.user_ratings_total ?? 0) > (existing.user_ratings_total ?? 0)) contractorByDomain.set(d, p);
  }

  function toPlaceResult(
    p: { name: string; place_id: string; rating?: number; user_ratings_total?: number; distanceKm: number; website?: string; websiteDomain?: string; types: string[] },
    bucket: "store" | "contractor",
    qualityFlags: QualityFlags
  ): PlaceResult {
    const web = p.website ?? "";
    const dom = (p.websiteDomain ?? "").toLowerCase();
    return {
      name: p.name,
      place_id: p.place_id,
      rating: p.rating,
      user_ratings_total: p.user_ratings_total,
      distanceKm: p.distanceKm,
      website: web,
      websiteDomain: dom,
      categoryBucket: bucket,
      types: p.types,
      qualityFlags,
    };
  }

  // Domain allowlists: only from places with website that passed quality
  const storeListForDomains = Array.from(storeByDomain.values());
  const contractorListForDomains = Array.from(contractorByDomain.values());

  // Sort: hasWebsite desc, rating desc, distance asc; then cap
  const sortByQuality = <T extends { website?: string; websiteDomain?: string; rating?: number; distanceKm?: number }>(list: T[]): T[] =>
    [...list].sort((a, b) => {
      const aHas = !!(a.website && a.websiteDomain);
      const bHas = !!(b.website && b.websiteDomain);
      if (bHas !== aHas) return bHas ? 1 : -1;
      const aR = a.rating ?? 0;
      const bR = b.rating ?? 0;
      if (bR !== aR) return bR - aR;
      const aD = a.distanceKm ?? 0;
      const bD = b.distanceKm ?? 0;
      return aD - bD;
    });

  // Stores list: ALL storeEnriched (with or without website); exclude from domains only if no website
  const sortedStoresAll = sortByQuality(storeEnriched).slice(0, MAX_PLACES_OUTPUT);
  const sortedContractorsAll = sortByQuality(contractorEnriched).slice(0, MAX_PLACES_OUTPUT);

  let stores: PlaceResult[] = sortedStoresAll.map((p) =>
    toPlaceResult(p, "store", {
      officialSite: !!(p.websiteDomain && isOfficialDomain(p.websiteDomain, p.name)),
      hasCatalogSignal: !!(p.website && hasCatalogPathSignal(p.website)),
      isDirectoryOrSocial: !!(p.websiteDomain && isRejectedDomain(p.websiteDomain)),
      isAggregator: false,
    })
  );
  let contractors: PlaceResult[] = sortedContractorsAll.map((p) =>
    toPlaceResult(p, "contractor", {
      officialSite: !!(p.websiteDomain && isOfficialDomain(p.websiteDomain, p.name)),
      hasCatalogSignal: false,
      isDirectoryOrSocial: !!(p.websiteDomain && isRejectedDomain(p.websiteDomain)),
      isAggregator: false,
    })
  );

  // Domain allowlists: root-normalized (same as SERP) so allowlist and domainCategoryMapStores keys match
  const domainsStoresRaw = storeListForDomains
    .map((s) => normalizeDomainToRootForAllowlist(s.websiteDomain ?? ""))
    .filter(Boolean);
  const domainsContractorsRaw = contractorListForDomains
    .map((c) => normalizeDomainToRootForAllowlist(c.websiteDomain ?? ""))
    .filter(Boolean);

  let domainsStores = [...new Set(domainsStoresRaw)].slice(0, MAX_DOMAINS_PER_LIST);
  let domainsContractors = [...new Set(domainsContractorsRaw)].slice(0, MAX_DOMAINS_PER_LIST);

  const contractorSet = new Set(domainsContractors);
  domainsStores = domainsStores.filter((d) => !contractorSet.has(d));

  // domainCategoryMapStores keyed by root domain (tldts); merge categories across stores for same root
  const domainCategoryMapStores: Record<string, string[]> = {};
  for (const place of storeListForDomains) {
    const d = normalizeDomainToRootForAllowlist(place.websiteDomain ?? "");
    if (!d) continue;
    const cats = placeTypesToTaxonomyCategories(place.types ?? []);
    const existing = domainCategoryMapStores[d] ?? [];
    const merged = [...new Set([...existing, ...cats])];
    domainCategoryMapStores[d] = merged;
  }

  scoringNotes.push(`Stores: ${stores.length} places, ${domainsStores.length} domains (cap ${MAX_DOMAINS_PER_LIST})`);
  scoringNotes.push(`Contractors: ${contractors.length} places, ${domainsContractors.length} domains (cap ${MAX_DOMAINS_PER_LIST})`);

  if (!dryRun) executionNotes.push("API debug: D)");

  const result: SearchResult = {
    meta: {
      radiusMeters,
      requestsMade,
      cacheHits,
      fallbacksUsed: 0,
      plannedQueries,
      plannedTypes,
      executionNotes,
      usedLocation: { lat, lng },
      filteredOutCount,
      candidatesFound,
      detailsFetched,
      discardedOutOfRadius: filteredOutCount,
      discardedNoWebsiteStores: 0,
      discardedDomainNotOfficialStores: 0,
      discardedLowStoreScore: 0,
      discardedLowServiceScore: 0,
      reclassifiedToServices: 0,
      debugVersion: "D",
      debugVersionLabel: "D)",
    },
    places: [],
    stores,
    contractors,
    domains: { stores: domainsStores, contractors: domainsContractors },
    allowlistDomainsStores: domainsStores,
    allowlistDomainsContractors: domainsContractors,
    domainCategoryMapStores: Object.keys(domainCategoryMapStores).length > 0 ? domainCategoryMapStores : undefined,
    status: 200,
  };
  if (debugMode) {
    result.debug = {
      storesDropped,
      contractorsDropped,
      scoringNotes,
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
