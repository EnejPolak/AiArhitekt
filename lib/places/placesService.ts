/**
 * Cost-controlled Google Places search service
 * Minimizes API usage while maintaining good coverage
 */

import { TTLCache } from "@/lib/cache";
import { haversineDistanceMeters } from "@/lib/geo/haversine";
import { checkProductCatalogSignal, type CatalogProbe, type CatalogSignalResult } from "@/lib/places/catalogSignal";
import { normalizeDomainToRoot, isRejectedDomain as isRejectedDomainUtil } from "@/lib/places/domainUtils";
import { normalizeDomainToRoot as normalizeDomainToRootForAllowlist } from "@/lib/serp/domains";
import { placeTypesToTaxonomyCategories } from "@/lib/serp/taxonomy";
import { delay } from "./runtime";
import {
  PlacesError,
  PLACES_ERROR_CODES,
  isPlacesQuotaStatus,
  isPlacesRateLimitedStatus,
  placesErrorFromHttp,
  type PlacesOutcome,
} from "./errors";
import {
  buildStoreDiscoveryPlan,
  defaultStoreDiscoveryPlan,
  type StoreDiscoveryPlan,
} from "./retailTaxonomy";
import {
  STORE_TYPES,
  SERVICE_TYPES,
  classifyPlaceBucket,
  classifyWebsiteQuality,
  computeStoreScore,
  evaluateStoreDomainGate,
  hasCatalogPathSignal,
  hasStrongStoreType,
  isOfficialDomain,
  isServiceDomainByHeuristic,
  placesOutcomeFromCounts,
} from "./storeRelevance";

export {
  classifyPlaceBucket,
  classifyWebsiteQuality,
  computeStoreScore,
  isServiceDomainByHeuristic,
} from "./storeRelevance";
export { PlacesError, PLACES_ERROR_CODES } from "./errors";

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
  /** Debug-only. Canonical A→D→C never plans by retailer brand names. */
  mode?: "category" | "brand";
  /** Debug-only. Ignored by Places query planning. */
  brandKeywords?: string[];
  dryRun?: boolean;
  /** If true (default), only include places with website in domain allowlists; stores/contractors lists still show all (with/without website). */
  onlyWithWebsite?: boolean;
  /** If true, include debug.candidates and debug.discarded in response */
  debug?: boolean;
  /** Product discovery only needs retail stores. Default false (canonical A→D→C). */
  includeContractors?: boolean;
  /** Requirement-driven Places plan. Canonical discovery always passes this. */
  storePlan?: StoreDiscoveryPlan;
  retailRequirements?: string[];
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
  /** Structured D) outcome. Empty-store cases are never collapsed into a generic provider error. */
  outcome?: PlacesOutcome;
  providerHttpStatus?: number;
  providerStatus?: string;
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
  matchedRetailCategories?: string[];
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
  outcome: PlacesOutcome;
  /** Only when debug=true. */
  debug?: {
    rejectionReasons?: Array<{ name: string; place_id?: string; reason: string }>;
    storesDropped?: Array<{ name: string; place_id?: string; reason: string }>;
    contractorsDropped?: Array<{ name: string; place_id?: string; reason: string }>;
    scoringNotes?: string[];
    classificationSignals?: Array<{ name: string; storeScore: number; contractorScore: number; serviceHintScore: number; bucket?: string; rejected?: boolean }>;
    candidates?: StoreOrServicePlace[];
    discarded?: DiscardedPlace[];
    pipeline?: PlacePipelineDebugRow[];
    googlePlacesRequests?: Array<{
      kind: "nearby_keyword" | "nearby_type" | "details";
      query?: string;
      httpStatus?: number;
      providerStatus?: string;
      resultCount?: number;
      cacheHit?: boolean;
    }>;
  };
}

/** Per-candidate D) rejection pipeline (debug only). */
export type PlacePipelineDebugRow = {
  name: string;
  place_id: string;
  sourceKeywords: string[];
  googleTypes: string[];
  sourceRetailCategories: string[];
  afterRadiusFilter: boolean;
  detailsFetched: boolean;
  hasWebsite: boolean;
  websiteDomain?: string;
  classifyPlaceBucket: "store" | "contractor" | null;
  storeScore: number;
  officialDomain: boolean;
  catalogPath: boolean;
  catalogSignal?: CatalogSignalResult | "not_probed";
  rejectionReason: string | null;
  acceptedStoreDomain: boolean;
};

// Constants
const MAX_CONCURRENCY = 2;
const REQUESTS_PER_SECOND = 3;
const REQUEST_TIMEOUT_MS = 6000;
const CACHE_TTL_SEARCH = 14 * 24 * 60 * 60 * 1000; // 14 days
const CACHE_TTL_DETAILS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Max places after merge + distance filter (before details); increased for multi-pass. */
const MAX_PLACES = 40;
const MAX_DETAILS_PER_SEARCH = 30;
const DETAILS_CONCURRENCY = 3;
const MAX_DOMAINS_PER_LIST = 10;
/** Cap stores and contractors arrays each to this many places. */
const MAX_PLACES_OUTPUT = 20;

/** Contractor discovery: optional, not part of canonical product discovery. */
const CONTRACTORS_QUERY_KEYWORDS = [
  "pleskar električar vodovodar keramičar polagalec ploščic",
  "monter pohištva sestavljalec pohištva montaža adaptacije renovacije",
  "polagalec talnih oblog parketar talne obloge",
  "suhomontažer mizar",
];

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

function isRejectedDomain(domain: string): boolean {
  return isRejectedDomainUtil(domain);
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
    await delay(minInterval - timeSinceLastRequest);
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
    await delay(100);
  }

  activeRequests++;
  try {
    await throttle();
    return await fn();
  } finally {
    activeRequests--;
  }
}

type GooglePlacesRequestLog = {
  kind: "nearby_keyword" | "nearby_type" | "details";
  query?: string;
  httpStatus?: number;
  providerStatus?: string;
  resultCount?: number;
  cacheHit?: boolean;
};

function rethrowFatalPlacesError(error: unknown): void {
  if (!(error instanceof PlacesError)) return;
  if (
    error.code === PLACES_ERROR_CODES.PLACES_QUOTA_EXCEEDED ||
    error.code === PLACES_ERROR_CODES.PLACES_RATE_LIMITED
  ) {
    throw error;
  }
  const swallow =
    error.providerStatus === "TIMEOUT" || error.providerStatus === "NETWORK_ERROR";
  if (!swallow) throw error;
}

function requireMapsKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new PlacesError(PLACES_ERROR_CODES.PLACES_PROVIDER_ERROR, "Places is not configured");
  }
  return key;
}

function mapPlaceResult(result: {
  place_id?: string;
  name?: string;
  types?: string[];
  vicinity?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: { open_now?: boolean };
}, sourceKeywords: string[], categoriesMatched: string[]): Place {
  return {
    place_id: result.place_id ?? "",
    name: result.name ?? "",
    types: result.types || [],
    vicinity: result.vicinity,
    formatted_address: result.formatted_address,
    location: {
      lat: result.geometry?.location?.lat ?? 0,
      lng: result.geometry?.location?.lng ?? 0,
    },
    rating: result.rating,
    user_ratings_total: result.user_ratings_total,
    opening_hours: result.opening_hours ? { open_now: result.opening_hours.open_now } : undefined,
    googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${result.place_id}`,
    sourceKeywords,
    categoriesMatched,
  };
}

async function fetchNearbyJson(
  url: string,
  log: GooglePlacesRequestLog[],
  kind: GooglePlacesRequestLog["kind"],
  query: string
): Promise<{ httpStatus: number; providerStatus: string; results: unknown[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error: unknown) {
    clearTimeout(timeout);
    const name = error instanceof Error ? error.name : "";
    log.push({ kind, query, providerStatus: name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR" });
    throw new PlacesError(
      PLACES_ERROR_CODES.PLACES_PROVIDER_ERROR,
      name === "AbortError" ? "Places request timeout" : "Places network error"
    );
  }
  clearTimeout(timeout);

  if (isPlacesRateLimitedStatus(response.status) || isPlacesQuotaStatus(response.status)) {
    log.push({ kind, query, httpStatus: response.status, providerStatus: "HTTP_ERROR" });
    throw placesErrorFromHttp(response.status);
  }
  if (!response.ok) {
    log.push({ kind, query, httpStatus: response.status });
    throw placesErrorFromHttp(response.status);
  }

  const data = (await response.json()) as { status?: string; results?: unknown[] };
  const providerStatus = String(data.status ?? "");
  log.push({
    kind,
    query,
    httpStatus: response.status,
    providerStatus,
    resultCount: Array.isArray(data.results) ? data.results.length : 0,
  });

  if (isPlacesQuotaStatus(response.status, providerStatus) || isPlacesRateLimitedStatus(response.status, providerStatus)) {
    throw placesErrorFromHttp(response.status, providerStatus);
  }
  if (providerStatus === "ZERO_RESULTS") {
    return { httpStatus: response.status, providerStatus, results: [] };
  }
  if (providerStatus !== "OK") {
    throw placesErrorFromHttp(response.status, providerStatus);
  }
  return {
    httpStatus: response.status,
    providerStatus,
    results: Array.isArray(data.results) ? data.results : [],
  };
}

async function fetchPlaces(
  keyword: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  language: string = "sl",
  region: string = "si",
  log: GooglePlacesRequestLog[] = []
): Promise<Place[]> {
  const apiKey = requireMapsKey();
  const cacheKey = getCacheKey(lat, lng, radiusMeters / 1000, keyword, language, region);
  const cached = searchCache.get(cacheKey);
  if (cached) {
    log.push({ kind: "nearby_keyword", query: keyword, cacheHit: true, resultCount: cached.length });
    return cached;
  }

  const location = `${lat},${lng}`;
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&radius=${radiusMeters}&keyword=${encodeURIComponent(keyword)}&language=${language}&region=${region}&key=${apiKey}`;
  const { results } = await fetchNearbyJson(url, log, "nearby_keyword", keyword);
  const places = results.map((item) =>
    mapPlaceResult(item as Parameters<typeof mapPlaceResult>[0], [keyword], [])
  );
  searchCache.set(cacheKey, places);
  return places;
}

async function fetchPlacesByType(
  placeType: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  language: string = "sl",
  region: string = "si",
  log: GooglePlacesRequestLog[] = []
): Promise<Place[]> {
  const apiKey = requireMapsKey();
  const cacheKey = getCacheKeyForType(lat, lng, radiusMeters / 1000, placeType, language, region);
  const cached = searchCache.get(cacheKey);
  if (cached) {
    log.push({ kind: "nearby_type", query: placeType, cacheHit: true, resultCount: cached.length });
    return cached;
  }

  const location = `${lat},${lng}`;
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&radius=${radiusMeters}&type=${encodeURIComponent(placeType)}&language=${language}&region=${region}&key=${apiKey}`;
  const { results } = await fetchNearbyJson(url, log, "nearby_type", placeType);
  const places = results.map((item) =>
    mapPlaceResult(item as Parameters<typeof mapPlaceResult>[0], [placeType], [])
  );
  searchCache.set(cacheKey, places);
  return places;
}

/**
 * Plan multi-pass discovery: store category keywords + store types + contractors.
 * Stores: multiple keyword-based searches per category, then type-based pass.
 * Contractors: single keyword search.
 */
function resolveStorePlan(params: SearchParams): StoreDiscoveryPlan {
  if (params.storePlan) return params.storePlan;
  if (params.retailRequirements && params.retailRequirements.length > 0) {
    return buildStoreDiscoveryPlan(params.retailRequirements);
  }
  return defaultStoreDiscoveryPlan();
}

/**
 * Plan store searches from the requirement-driven taxonomy.
 * Canonical product discovery never uses retailer brand names.
 */
function planMultiPassStoresAndContractors(params: SearchParams): {
  storePlan: StoreDiscoveryPlan;
  storesKeywordQueries: Array<{ keyword: string; language: string; categories: string[] }>;
  storesTypeQueries: Array<{ type: string; categories: string[] }>;
  contractorsQueries: Array<{ keyword: string; language: string }>;
} {
  const storePlan = resolveStorePlan(params);
  const includeContractors = params.includeContractors === true;
  return {
    storePlan,
    storesKeywordQueries: storePlan.queries
      .filter((q): q is Extract<typeof q, { kind: "keyword" }> => q.kind === "keyword")
      .map((q) => ({ keyword: q.keyword, language: q.language, categories: q.categories })),
    storesTypeQueries: storePlan.queries
      .filter((q): q is Extract<typeof q, { kind: "type" }> => q.kind === "type")
      .map((q) => ({ type: q.type, categories: q.categories })),
    contractorsQueries: includeContractors
      ? CONTRACTORS_QUERY_KEYWORDS.map((keyword) => ({ keyword, language: "sl" }))
      : [],
  };
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

  const { storePlan, storesKeywordQueries, storesTypeQueries, contractorsQueries } =
    planMultiPassStoresAndContractors(params);
  const plannedQueries = [
    ...storesKeywordQueries.map((q) => `stores[${q.categories.join(",")}]: ${q.keyword} (${q.language})`),
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
        executionNotes: [
          "Dry run mode - no API calls made",
          "API debug: D)",
          `Retail categories: ${storePlan.categories.join(", ") || "(none)"}`,
        ],
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
      outcome: "OK",
    };
  }

  const allPlaces: Array<{ place: Place; intent: "store" | "contractor" }> = [];
  let requestsMade = 0;
  let cacheHits = 0;
  const executionNotes: string[] = [];
  const googlePlacesRequests: GooglePlacesRequestLog[] = [];

  for (const query of storesKeywordQueries) {
    await executeWithConcurrency(async () => {
      const cacheKey = getCacheKey(lat, lng, clampedRadiusKm, query.keyword, query.language, "si");
      const cached = searchCache.get(cacheKey);
      if (cached) {
        cacheHits++;
        cached.forEach((place) =>
          allPlaces.push({
            place: {
              ...place,
              sourceKeywords: [...new Set([...(place.sourceKeywords ?? []), query.keyword])],
              categoriesMatched: [...new Set([...(place.categoriesMatched ?? []), ...query.categories])],
            },
            intent: "store",
          })
        );
        googlePlacesRequests.push({
          kind: "nearby_keyword",
          query: query.keyword,
          cacheHit: true,
          resultCount: cached.length,
        });
        return;
      }
      requestsMade++;
      try {
        const places = await fetchPlaces(
          query.keyword,
          lat,
          lng,
          radiusMeters,
          query.language,
          "si",
          googlePlacesRequests
        );
        places.forEach((place) =>
          allPlaces.push({
            place: {
              ...place,
              categoriesMatched: [...new Set([...(place.categoriesMatched ?? []), ...query.categories])],
            },
            intent: "store",
          })
        );
      } catch (error) {
        rethrowFatalPlacesError(error);
        executionNotes.push(`Nearby keyword search failed: ${query.keyword}`);
      }
    });
  }

  for (const typeQuery of storesTypeQueries) {
    await executeWithConcurrency(async () => {
      const cacheKey = getCacheKeyForType(lat, lng, clampedRadiusKm, typeQuery.type, "sl", "si");
      const cached = searchCache.get(cacheKey);
      if (cached) {
        cacheHits++;
        cached.forEach((place) =>
          allPlaces.push({
            place: {
              ...place,
              sourceKeywords: [...new Set([...(place.sourceKeywords ?? []), typeQuery.type])],
              categoriesMatched: [...new Set([...(place.categoriesMatched ?? []), ...typeQuery.categories])],
            },
            intent: "store",
          })
        );
        googlePlacesRequests.push({
          kind: "nearby_type",
          query: typeQuery.type,
          cacheHit: true,
          resultCount: cached.length,
        });
        return;
      }
      requestsMade++;
      try {
        const places = await fetchPlacesByType(
          typeQuery.type,
          lat,
          lng,
          radiusMeters,
          "sl",
          "si",
          googlePlacesRequests
        );
        places.forEach((place) =>
          allPlaces.push({
            place: {
              ...place,
              sourceKeywords: [...new Set([...(place.sourceKeywords ?? []), typeQuery.type])],
              categoriesMatched: [...new Set([...(place.categoriesMatched ?? []), ...typeQuery.categories])],
            },
            intent: "store",
          })
        );
      } catch (error) {
        rethrowFatalPlacesError(error);
        executionNotes.push(`Nearby type search failed: ${typeQuery.type}`);
      }
    });
  }

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
      try {
        const places = await fetchPlaces(
          query.keyword,
          lat,
          lng,
          radiusMeters,
          query.language,
          "si",
          googlePlacesRequests
        );
        places.forEach((place) => allPlaces.push({ place, intent: "contractor" }));
      } catch (error) {
        rethrowFatalPlacesError(error);
        executionNotes.push(`Contractor search failed: ${query.keyword}`);
      }
    });
  }

  // Dedupe by place_id: keep first (store then contractor); keep intent for classification prior
  const placeById = new Map<string, { place: Place; intent: "store" | "contractor" }>();
  for (const { place, intent } of allPlaces) {
    const existing = placeById.get(place.place_id);
    if (!existing) {
      placeById.set(place.place_id, { place, intent });
      continue;
    }
    const categoriesMatched = [
      ...new Set([...(existing.place.categoriesMatched ?? []), ...(place.categoriesMatched ?? [])]),
    ];
    const sourceKeywords = [
      ...new Set([...(existing.place.sourceKeywords ?? []), ...(place.sourceKeywords ?? [])]),
    ];
    existing.place = { ...existing.place, categoriesMatched, sourceKeywords };
    if (existing.intent !== "store" && intent === "store") existing.intent = "store";
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
  const debugMode = params.debug === true;

  const storesDropped: Array<{ name: string; place_id?: string; reason: string }> = [];
  const contractorsDropped: Array<{ name: string; place_id?: string; reason: string } > = [];
  const scoringNotes: string[] = [];
  const pipeline: PlacePipelineDebugRow[] = [];

  const toEnrich = limitedWithIntent.slice(0, MAX_DETAILS_PER_SEARCH);
  type EnrichedPlace = Place & {
    types: string[];
    website?: string;
    websiteDomain?: string;
    distanceKm: number;
    bucket: "store" | "contractor" | null;
    formatted_phone_number?: string;
    catalogSignal?: CatalogSignalResult | "not_probed";
  };
  const enriched: EnrichedPlace[] = [];

  for (let i = 0; i < toEnrich.length; i += DETAILS_CONCURRENCY) {
    const batch = toEnrich.slice(i, i + DETAILS_CONCURRENCY);
    const detailsResults = await Promise.all(
      batch.map(({ place }) => getPlaceDetails(place.place_id, googlePlacesRequests))
    );
    detailsFetched += batch.length;
    for (let j = 0; j < batch.length; j++) {
      const { place, intent } = batch[j];
      const details = detailsResults[j];
      const types = details?.types?.length ? details.types : place.types;
      const website =
        details?.website && String(details.website).trim() ? String(details.website).trim() : undefined;
      const websiteDomain = website ? normalizeDomainToRoot(website) : undefined;
      const phone = details?.formatted_phone_number;
      let bucket = classifyPlaceBucket(types, place.name, websiteDomain, {
        sourceKeywords: place.sourceKeywords,
        categoriesMatched: place.categoriesMatched,
      });
      if (bucket === null && intent === "contractor") bucket = "contractor";
      enriched.push({
        ...place,
        types,
        website,
        websiteDomain,
        distanceKm: place.distanceKm ?? 0,
        bucket,
        formatted_phone_number: phone,
        catalogSignal: "not_probed",
      });
    }
  }

  const storeEnriched = enriched.filter((p) => p.bucket === "store");
  const contractorEnriched = enriched.filter((p) => p.bucket === "contractor");

  const storeByDomain = new Map<string, (typeof enriched)[0]>();
  const contractorByDomain = new Map<string, (typeof enriched)[0]>();
  let discardedNoWebsiteStores = 0;
  let discardedDomainNotOfficialStores = 0;

  for (const p of storeEnriched) {
    const storeScore = computeStoreScore(p.types, p.rating, p.user_ratings_total);
    let catalogSignal: CatalogSignalResult | "not_probed" = "not_probed";
    const needsCatalogEvidence =
      Boolean(p.website) &&
      !hasStrongStoreType(p.types) &&
      !isOfficialDomain(p.websiteDomain ?? "", p.name);
    if (needsCatalogEvidence && p.website) {
      const probed = await checkProductCatalogSignal(p.website);
      catalogSignal = probed.signal;
      p.catalogSignal = catalogSignal;
    }

    const gate = evaluateStoreDomainGate({
      name: p.name,
      types: p.types,
      website: p.website,
      websiteDomain: p.websiteDomain,
      storeScore,
      sourceKeywords: p.sourceKeywords,
      categoriesMatched: p.categoriesMatched,
      catalogSignal: catalogSignal === "not_probed" ? undefined : catalogSignal,
    });

    const row: PlacePipelineDebugRow = {
      name: p.name,
      place_id: p.place_id,
      sourceKeywords: p.sourceKeywords,
      googleTypes: p.types,
      sourceRetailCategories: p.categoriesMatched ?? [],
      afterRadiusFilter: true,
      detailsFetched: true,
      hasWebsite: Boolean(p.website && p.websiteDomain),
      websiteDomain: p.websiteDomain,
      classifyPlaceBucket: p.bucket,
      storeScore,
      officialDomain: gate.officialDomain,
      catalogPath: gate.catalogPath,
      catalogSignal,
      rejectionReason: gate.accept ? null : gate.reason,
      acceptedStoreDomain: gate.accept,
    };
    pipeline.push(row);

    if (!p.website || !p.websiteDomain) {
      discardedNoWebsiteStores += 1;
      storesDropped.push({ name: p.name, place_id: p.place_id, reason: "no_website" });
      continue;
    }
    if (!gate.accept) {
      if (gate.reason === "domain_not_official") discardedDomainNotOfficialStores += 1;
      storesDropped.push({ name: p.name, place_id: p.place_id, reason: gate.reason ?? "filtered" });
      continue;
    }
    const d = p.websiteDomain.toLowerCase();
    const existing = storeByDomain.get(d);
    const categoriesMatched = [
      ...new Set([...(existing?.categoriesMatched ?? []), ...(p.categoriesMatched ?? [])]),
    ];
    const keep =
      !existing || (p.user_ratings_total ?? 0) > (existing.user_ratings_total ?? 0) ? p : existing;
    storeByDomain.set(d, { ...keep, categoriesMatched });
  }

  for (const p of contractorEnriched) {
    if (!p.website || !p.websiteDomain) continue;
    if (isRejectedDomain(p.websiteDomain)) {
      contractorsDropped.push({ name: p.name, place_id: p.place_id, reason: "social_or_directory_website" });
      continue;
    }
    const official = isOfficialDomain(p.websiteDomain, p.name);
    const servicePath = hasServicePathSignal(p.website);
    const serviceType = p.types.some((t) => (SERVICE_TYPES as readonly string[]).includes(t.toLowerCase()));
    const nameMatchesContractor = CONTRACTOR_NAME_KEYWORDS_SL.some((kw) =>
      (p.name ?? "").toLowerCase().includes(kw)
    );
    const domainServiceHeuristic = isServiceDomainByHeuristic(p.websiteDomain);
    const hasPhone = !!p.formatted_phone_number && String(p.formatted_phone_number).trim().length > 0;
    const contractorSignal =
      servicePath || serviceType || nameMatchesContractor || domainServiceHeuristic || hasPhone;
    if (!official || !contractorSignal) {
      contractorsDropped.push({
        name: p.name,
        place_id: p.place_id,
        reason: official ? "no_contractor_signal" : "domain_not_official",
      });
      continue;
    }
    const d = p.websiteDomain.toLowerCase();
    const existing = contractorByDomain.get(d);
    if (!existing || (p.user_ratings_total ?? 0) > (existing.user_ratings_total ?? 0)) {
      contractorByDomain.set(d, p);
    }
  }

  for (const p of enriched.filter((item) => item.bucket !== "store")) {
    pipeline.push({
      name: p.name,
      place_id: p.place_id,
      sourceKeywords: p.sourceKeywords,
      googleTypes: p.types,
      sourceRetailCategories: p.categoriesMatched ?? [],
      afterRadiusFilter: true,
      detailsFetched: true,
      hasWebsite: Boolean(p.website && p.websiteDomain),
      websiteDomain: p.websiteDomain,
      classifyPlaceBucket: p.bucket,
      storeScore: computeStoreScore(p.types, p.rating, p.user_ratings_total),
      officialDomain: Boolean(p.websiteDomain && isOfficialDomain(p.websiteDomain, p.name)),
      catalogPath: Boolean(p.website && hasCatalogPathSignal(p.website)),
      catalogSignal: "not_probed",
      rejectionReason:
        p.bucket === "contractor" ? "classified_contractor" : "not_classified_as_store",
      acceptedStoreDomain: false,
    });
  }

  function toPlaceResult(
    p: {
      name: string;
      place_id: string;
      rating?: number;
      user_ratings_total?: number;
      distanceKm: number;
      website?: string;
      websiteDomain?: string;
      types: string[];
      categoriesMatched?: string[];
    },
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
      matchedRetailCategories: p.categoriesMatched ?? [],
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
      hasCatalogSignal: !!(p.website && (hasCatalogPathSignal(p.website) || p.catalogSignal === true || hasStrongStoreType(p.types))),
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

  if (!dryRun) {
    executionNotes.push("API debug: D)");
    executionNotes.push(`Retail categories: ${storePlan.categories.join(", ") || "(none)"}`);
  }

  const storesWithWebsite = storeEnriched.filter((p) => p.website && p.websiteDomain).length;
  const outcome = placesOutcomeFromCounts({
    rawCandidates: beforeFilterCount,
    afterRadius: candidatesFound,
    storeBucketCount: storeEnriched.length,
    storesWithWebsite,
    validStoreDomains: domainsStores.length,
  });

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
      discardedNoWebsiteStores,
      discardedDomainNotOfficialStores,
      discardedLowStoreScore: 0,
      discardedLowServiceScore: 0,
      reclassifiedToServices: 0,
      debugVersion: "D",
      debugVersionLabel: "D)",
      outcome,
    },
    places: [],
    stores,
    contractors,
    domains: { stores: domainsStores, contractors: domainsContractors },
    allowlistDomainsStores: domainsStores,
    allowlistDomainsContractors: domainsContractors,
    domainCategoryMapStores: Object.keys(domainCategoryMapStores).length > 0 ? domainCategoryMapStores : undefined,
    status: 200,
    outcome,
  };
  if (debugMode) {
    result.debug = {
      storesDropped,
      contractorsDropped,
      scoringNotes,
      pipeline,
      googlePlacesRequests,
    };
  }
  return result;
}

/**
 * Fetch place details (lazy loading)
 */
export async function getPlaceDetails(
  placeId: string,
  log: GooglePlacesRequestLog[] = []
): Promise<PlaceDetails | null> {
  const apiKey = requireMapsKey();

  const cached = detailsCache.get(placeId);
  if (cached) {
    log.push({ kind: "details", query: placeId, cacheHit: true, resultCount: 1 });
    return cached;
  }

  const fields = "place_id,name,formatted_address,geometry,rating,user_ratings_total,formatted_phone_number,website,opening_hours,url,types";
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&language=sl&region=si&key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (isPlacesRateLimitedStatus(response.status) || isPlacesQuotaStatus(response.status)) {
      log.push({ kind: "details", query: placeId, httpStatus: response.status, providerStatus: "HTTP_ERROR" });
      throw placesErrorFromHttp(response.status);
    }
    if (!response.ok) {
      log.push({ kind: "details", query: placeId, httpStatus: response.status });
      throw placesErrorFromHttp(response.status);
    }

    const data = await response.json();
    const providerStatus = String(data.status ?? "");
    log.push({
      kind: "details",
      query: placeId,
      httpStatus: response.status,
      providerStatus,
      resultCount: data.result ? 1 : 0,
    });

    if (
      isPlacesQuotaStatus(response.status, providerStatus) ||
      isPlacesRateLimitedStatus(response.status, providerStatus)
    ) {
      throw placesErrorFromHttp(response.status, providerStatus);
    }

    if (data.status !== "OK" || !data.result) {
      return null;
    }

    const result = data.result;
    if (!result?.geometry?.location || typeof result.geometry.location.lat !== "number") {
      return null;
    }

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

    detailsCache.set(placeId, details);

    return details;
  } catch (error: unknown) {
    clearTimeout(timeout);
    if (error instanceof PlacesError) throw error;
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError") {
      throw new PlacesError(PLACES_ERROR_CODES.PLACES_PROVIDER_ERROR, "Places details timeout");
    }
    throw new PlacesError(PLACES_ERROR_CODES.PLACES_PROVIDER_ERROR, "Places details error");
  }
}
