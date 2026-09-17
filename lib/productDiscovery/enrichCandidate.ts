import { TTLCache } from "@/lib/cache";
import { assertPublicHttpUrl, type AddressLookup } from "@/lib/references/ssrf";
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import {
  acquireMerchantEvidenceFromHtml,
  extractPricesFromSameOriginJson,
  type MerchantEvidenceDiagnostics,
  type MerchantSpecFact,
  type PriceFailureReason,
  type VerifiedMerchantPrice,
} from "./merchantEvidence";
import {
  classifyFetchBlock,
  classifyFetchSuccessHtml,
  type FetchBlockReason,
  type FetchSuccessKind,
  type MerchantAcquisitionSource,
  type MerchantAdapterId,
} from "./merchantAcquisitionDiagnostics";
import { runMerchantAcquisitionAdapter } from "./merchantAcquisition";
import { enrichmentCacheKey } from "./enrichmentCacheKey";

export { enrichmentCacheKey };

export type EnrichmentStatus =
  | "success"
  | "forbidden"
  | "rate_limited"
  | "timeout"
  | "http_error"
  | "parse_error";

/** @deprecated Prefer CandidateEnrichment; kept for existing tests. */
export type ProductPageEvidence = {
  pageTitle: string | null;
  metaDescription: string | null;
  productName: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  availability: string | null;
  sku: string | null;
  rawProductText: string | null;
  jsonLdProductFound: boolean;
  labeledSpecs?: MerchantSpecFact[];
  canonicalUrl?: string | null;
  merchantEvidenceDiagnostics?: MerchantEvidenceDiagnostics;
  priceProvenance?: string | null;
  verifiedPrice?: VerifiedMerchantPrice | null;
  priceFailureReason?: PriceFailureReason | null;
  sameOriginProductDataUrls?: string[];
};

export type CandidateEnrichment = {
  status: EnrichmentStatus;
  pageTitle: string | null;
  metaDescription: string | null;
  productName: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  availability: string | null;
  sku: string | null;
  productText: string | null;
  jsonLdProductFound: boolean;
  labeledSpecs?: MerchantSpecFact[];
  canonicalUrl?: string | null;
  priceProvenance?: string | null;
  verifiedPrice?: VerifiedMerchantPrice | null;
  priceFailureReason?: PriceFailureReason | null;
  merchantEvidenceDiagnostics?: MerchantEvidenceDiagnostics;
  enrichmentTiming?: EnrichmentTiming;
};

export type EnrichmentTiming = {
  totalMs: number;
  primaryFetchMs: number | null;
  followUpFetchMs: number | null;
  cacheHit: boolean;
};

export type EnrichCandidateOptions = {
  allowlistDomains: string[];
  timeoutMs?: number;
  maxHtmlBytes?: number;
  fetchFn?: typeof fetch;
  lookup?: AddressLookup;
  /** Max same-origin product-data follow-ups (0–2). Default 1. */
  maxSameOriginFollowUps?: number;
};

/** Magento/Alpine pages (e.g. OBI) embed Offer microdata after ~512KB. */
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_MAX_HTML_BYTES = 1_048_576;
const ENRICHMENT_CACHE_TTL_MS = 10 * 60 * 1000;

const enrichmentCache = new TTLCache<CandidateEnrichment>(ENRICHMENT_CACHE_TTL_MS);

export type EnrichmentPerfCounters = {
  attempts: number;
  cacheHits: number;
  cacheMisses: number;
  durationsMs: number[];
  primaryFetchMs: number[];
  followUpFetchMs: number[];
  priceSourceCounts: Record<string, number>;
  priceFailureCounts: Record<string, number>;
  fetchBlockCounts: Record<string, number>;
  priceSuccess: number;
  priceFailure: number;
};

const perfCounters: EnrichmentPerfCounters = {
  attempts: 0,
  cacheHits: 0,
  cacheMisses: 0,
  durationsMs: [],
  primaryFetchMs: [],
  followUpFetchMs: [],
  priceSourceCounts: {},
  priceFailureCounts: {},
  fetchBlockCounts: {},
  priceSuccess: 0,
  priceFailure: 0,
};

function bumpCount(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function recordEnrichmentPerf(enrichment: CandidateEnrichment, cacheHit: boolean) {
  perfCounters.attempts += 1;
  if (cacheHit) perfCounters.cacheHits += 1;
  else perfCounters.cacheMisses += 1;
  const total = enrichment.enrichmentTiming?.totalMs;
  if (typeof total === "number" && Number.isFinite(total)) {
    perfCounters.durationsMs.push(total);
  }
  const primary = enrichment.enrichmentTiming?.primaryFetchMs;
  if (typeof primary === "number" && Number.isFinite(primary)) {
    perfCounters.primaryFetchMs.push(primary);
  }
  const follow = enrichment.enrichmentTiming?.followUpFetchMs;
  if (typeof follow === "number" && Number.isFinite(follow)) {
    perfCounters.followUpFetchMs.push(follow);
  }
  const block = enrichment.merchantEvidenceDiagnostics?.fetchBlockReason;
  if (block) bumpCount(perfCounters.fetchBlockCounts, block);
  if (enrichment.price != null && enrichment.verifiedPrice) {
    perfCounters.priceSuccess += 1;
    bumpCount(perfCounters.priceSourceCounts, enrichment.verifiedPrice.source);
  } else if (enrichment.status === "success" || enrichment.status === "parse_error") {
    perfCounters.priceFailure += 1;
    bumpCount(
      perfCounters.priceFailureCounts,
      enrichment.priceFailureReason ?? "PRICE_NONE_NO_PRICE_TOKEN"
    );
  } else if (
    enrichment.status === "forbidden" ||
    enrichment.status === "http_error" ||
    enrichment.status === "timeout" ||
    enrichment.status === "rate_limited"
  ) {
    perfCounters.priceFailure += 1;
    bumpCount(perfCounters.priceFailureCounts, "PRICE_NONE_FETCH_BLOCKED");
  }
}

export function getEnrichmentPerfCounters(): EnrichmentPerfCounters {
  return {
    ...perfCounters,
    durationsMs: [...perfCounters.durationsMs],
    primaryFetchMs: [...perfCounters.primaryFetchMs],
    followUpFetchMs: [...perfCounters.followUpFetchMs],
    priceSourceCounts: { ...perfCounters.priceSourceCounts },
    priceFailureCounts: { ...perfCounters.priceFailureCounts },
    fetchBlockCounts: { ...perfCounters.fetchBlockCounts },
  };
}

export function resetEnrichmentPerfCounters(): void {
  perfCounters.attempts = 0;
  perfCounters.cacheHits = 0;
  perfCounters.cacheMisses = 0;
  perfCounters.durationsMs = [];
  perfCounters.primaryFetchMs = [];
  perfCounters.followUpFetchMs = [];
  perfCounters.priceSourceCounts = {};
  perfCounters.priceFailureCounts = {};
  perfCounters.fetchBlockCounts = {};
  perfCounters.priceSuccess = 0;
  perfCounters.priceFailure = 0;
}

export function summarizeEnrichmentPerf(counters: EnrichmentPerfCounters = getEnrichmentPerfCounters()) {
  const sorted = [...counters.durationsMs].sort((a, b) => a - b);
  const pct = (p: number): number | null => {
    if (sorted.length === 0) return null;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx] ?? null;
  };
  const avg =
    sorted.length === 0 ? null : sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const cacheAttempts = counters.cacheHits + counters.cacheMisses;
  return {
    averageMs: avg,
    p50Ms: pct(50),
    p95Ms: pct(95),
    cacheHitRate: cacheAttempts === 0 ? null : counters.cacheHits / cacheAttempts,
    attempts: counters.attempts,
    priceSourceCounts: counters.priceSourceCounts,
    priceFailureCounts: counters.priceFailureCounts,
    fetchBlockCounts: counters.fetchBlockCounts,
  };
}

export function parseProductPageEvidence(html: string, pageUrl: string): ProductPageEvidence {
  const acquired = acquireMerchantEvidenceFromHtml(html, pageUrl);
  return {
    pageTitle: acquired.pageTitle,
    metaDescription: acquired.metaDescription,
    productName: acquired.productName,
    brand: acquired.brand,
    price: acquired.price,
    currency: acquired.currency,
    imageUrl: acquired.imageUrl,
    availability: acquired.availability,
    sku: acquired.sku,
    rawProductText: acquired.rawProductText,
    jsonLdProductFound: acquired.jsonLdProductFound,
    labeledSpecs: acquired.labeledSpecs,
    canonicalUrl: acquired.canonicalUrl,
    merchantEvidenceDiagnostics: acquired.diagnostics,
    priceProvenance: acquired.priceProvenance,
    verifiedPrice: acquired.verifiedPrice,
    priceFailureReason: acquired.priceFailureReason,
    sameOriginProductDataUrls: acquired.sameOriginProductDataUrls,
  };
}

function isAllowlistedUrl(url: string, allowlistDomains: string[]): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const domain = normalizeDomainToRoot(parsed.hostname);
    return allowlistDomains.some((entry) => normalizeDomainToRoot(entry) === domain);
  } catch {
    return false;
  }
}

function httpStatusToEnrichmentStatus(status: number): EnrichmentStatus {
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "http_error";
  return "http_error";
}

async function readBoundedHtml(response: Response, maxBytes: number): Promise<string | null> {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const slice = value.byteLength + total > maxBytes ? value.slice(0, maxBytes - total) : value;
      chunks.push(slice);
      total += slice.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(merged);
  }
  return (await response.text()).slice(0, maxBytes);
}

function emptyDiagnostics(
  status: string,
  httpStatus: number | null,
  extras?: Partial<MerchantEvidenceDiagnostics>
): MerchantEvidenceDiagnostics {
  return {
    status,
    httpStatus,
    jsonLdProductFound: false,
    canonicalFound: false,
    productNameFound: false,
    priceFound: false,
    materialFound: false,
    colorFound: false,
    labeledDimensionsFound: 0,
    extractionMethods: [],
    priceFailureReason: status === "forbidden" ? "PRICE_NONE_FETCH_BLOCKED" : null,
    fetchBlockReason: extras?.fetchBlockReason ?? null,
    fetchSuccessKind: extras?.fetchSuccessKind ?? null,
    acquisitionSource: extras?.acquisitionSource ?? null,
    adapterId: extras?.adapterId ?? null,
    unsupportedDirectEnrichment: extras?.unsupportedDirectEnrichment,
  };
}

function adapterIdForUrl(url: string): MerchantAdapterId {
  try {
    const root = normalizeDomainToRoot(new URL(url).hostname);
    if (root === "bauhaus.si") return "bauhaus";
    if (root === "obi.si") return "obi";
    if (root === "xxxlesnina.si") return "xxxlesnina";
  } catch {
    /* ignore */
  }
  return null;
}

function blockedEnrichment(
  status: EnrichmentStatus,
  httpStatus: number | null,
  timing: EnrichmentTiming,
  blockReason: FetchBlockReason,
  adapterId: MerchantAdapterId = null
): CandidateEnrichment {
  return {
    status,
    pageTitle: null,
    metaDescription: null,
    productName: null,
    brand: null,
    price: null,
    currency: null,
    imageUrl: null,
    availability: null,
    sku: null,
    productText: null,
    jsonLdProductFound: false,
    labeledSpecs: [],
    canonicalUrl: null,
    priceProvenance: null,
    verifiedPrice: null,
    priceFailureReason: "PRICE_NONE_FETCH_BLOCKED",
    merchantEvidenceDiagnostics: emptyDiagnostics(status, httpStatus, {
      fetchBlockReason: blockReason,
      adapterId,
      unsupportedDirectEnrichment:
        adapterId === "bauhaus" || adapterId === "xxxlesnina" ? true : undefined,
      acquisitionSource: adapterId ? "merchant_domain_adapter" : null,
    }),
    enrichmentTiming: timing,
  };
}

function evidenceToEnrichment(
  status: EnrichmentStatus,
  evidence: ProductPageEvidence | null,
  httpStatus: number | null = null,
  timing?: EnrichmentTiming
): CandidateEnrichment {
  if (!evidence || (status !== "success" && status !== "parse_error")) {
    return {
      status,
      pageTitle: null,
      metaDescription: null,
      productName: null,
      brand: null,
      price: null,
      currency: null,
      imageUrl: null,
      availability: null,
      sku: null,
      productText: null,
      jsonLdProductFound: false,
      labeledSpecs: [],
      canonicalUrl: null,
      priceProvenance: null,
      verifiedPrice: null,
      priceFailureReason:
        status === "forbidden" || status === "http_error" || status === "timeout"
          ? "PRICE_NONE_FETCH_BLOCKED"
          : null,
      merchantEvidenceDiagnostics: evidence?.merchantEvidenceDiagnostics
        ? { ...evidence.merchantEvidenceDiagnostics, status, httpStatus }
        : emptyDiagnostics(status, httpStatus),
      enrichmentTiming: timing,
    };
  }

  const hasUseful =
    Boolean(evidence.productName) ||
    evidence.price != null ||
    (evidence.labeledSpecs?.length ?? 0) > 0 ||
    evidence.jsonLdProductFound;

  return {
    status: hasUseful ? "success" : status === "parse_error" ? "parse_error" : "success",
    pageTitle: evidence.pageTitle,
    metaDescription: evidence.metaDescription,
    productName: evidence.productName,
    brand: evidence.brand,
    price: evidence.price,
    currency: evidence.currency,
    imageUrl: evidence.imageUrl,
    availability: evidence.availability,
    sku: evidence.sku,
    productText: evidence.rawProductText,
    jsonLdProductFound: evidence.jsonLdProductFound,
    labeledSpecs: evidence.labeledSpecs ?? [],
    canonicalUrl: evidence.canonicalUrl ?? null,
    priceProvenance: evidence.priceProvenance ?? evidence.verifiedPrice?.source ?? null,
    verifiedPrice: evidence.verifiedPrice ?? null,
    priceFailureReason: evidence.priceFailureReason ?? null,
    merchantEvidenceDiagnostics: {
      ...(evidence.merchantEvidenceDiagnostics ?? emptyDiagnostics("success", httpStatus)),
      httpStatus,
      status: hasUseful ? "success" : "partial",
      priceFound: evidence.price != null,
      priceSource: evidence.verifiedPrice?.source ?? null,
      priceKind: evidence.verifiedPrice?.kind ?? null,
      priceFailureReason: evidence.priceFailureReason ?? null,
      price: evidence.verifiedPrice
        ? {
            found: true,
            amount: evidence.verifiedPrice.amount,
            currency: evidence.verifiedPrice.currency,
            extractionMethod: evidence.verifiedPrice.extractionMethod,
            sourcePath: evidence.verifiedPrice.sourcePath ?? null,
            excerpt: evidence.verifiedPrice.evidenceExcerpt ?? null,
            evidenceKind: evidence.verifiedPrice.source,
          }
        : evidence.merchantEvidenceDiagnostics?.price ?? { found: false },
    },
    enrichmentTiming: timing,
  };
}

export function getCachedCandidateEnrichment(url: string): CandidateEnrichment | null {
  return enrichmentCache.get(enrichmentCacheKey(url));
}

export function clearCandidateEnrichmentCache(): void {
  enrichmentCache.clear();
}

function cloneCandidateEnrichment(enrichment: CandidateEnrichment): CandidateEnrichment {
  return JSON.parse(JSON.stringify(enrichment)) as CandidateEnrichment;
}

/** Persist enrichment with provenance intact (JSON snapshot, no HTML). */
export function seedCandidateEnrichmentCache(url: string, enrichment: CandidateEnrichment): void {
  enrichmentCache.set(enrichmentCacheKey(url), cloneCandidateEnrichment(enrichment));
}

export function candidateEnrichmentFromPageEvidence(
  evidence: ProductPageEvidence
): CandidateEnrichment {
  return evidenceToEnrichment("success", evidence, null);
}

/** Compact provenance for api-debug only. Never includes HTML. */
export function compactMerchantEvidenceForDebug(url: string | null): {
  status: string;
  canonicalUrl: string | null;
  productName: { found: boolean; sourcePath?: string };
  price: {
    found: boolean;
    amount?: number;
    currency?: string | null;
    extractionMethod?: string;
    sourcePath?: string | null;
    excerpt?: string | null;
  };
  materialsFound: number;
  colorsFound: number;
  labeledDimensionsFound: number;
  extractionMethods: string[];
} | undefined {
  if (!url) return undefined;
  const cached = getCachedCandidateEnrichment(url);
  const d = cached?.merchantEvidenceDiagnostics;
  if (!d) return undefined;
  return {
    status: d.status,
    canonicalUrl: d.canonicalUrl ?? cached.canonicalUrl ?? null,
    productName: d.productName ?? { found: d.productNameFound },
    price: d.price ?? { found: d.priceFound },
    materialsFound: d.materialsFound ?? (d.materialFound ? 1 : 0),
    colorsFound: d.colorsFound ?? (d.colorFound ? 1 : 0),
    labeledDimensionsFound: d.labeledDimensionsFound,
    extractionMethods: d.extractionMethods,
  };
}

async function fetchSameOriginProductJson(args: {
  url: string;
  fetchFn: typeof fetch;
  lookup?: AddressLookup;
  allowlistDomains: string[];
  timeoutMs: number;
  signal: AbortSignal;
}): Promise<unknown | null> {
  try {
    const safe = await assertPublicHttpUrl(args.url, args.lookup);
    if (!isAllowlistedUrl(safe.toString(), args.allowlistDomains)) return null;
    const response = await args.fetchFn(safe.toString(), {
      signal: args.signal,
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AiArhitektProductDiscovery/1.1; +https://aiarhitekt.local)",
        Accept: "application/json,text/javascript,*/*;q=0.8",
        "Accept-Language": "sl-SI,sl;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    if (response.status >= 300 && response.status < 400) return null;
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > 400_000) return null;
    try {
      return JSON.parse(text);
    } catch {
      // Shopify product.js is often JSON already; sometimes padded — try trim
      const trimmed = text.trim().replace(/^;\s*/, "");
      try {
        return JSON.parse(trimmed);
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
}

export async function enrichCandidatePage(
  url: string,
  options: EnrichCandidateOptions
): Promise<CandidateEnrichment> {
  const started = Date.now();
  const cacheKey = enrichmentCacheKey(url);
  const cached = enrichmentCache.get(cacheKey);
  if (cached) {
    const withTiming: CandidateEnrichment = {
      ...cached,
      enrichmentTiming: {
        totalMs: 0,
        primaryFetchMs: null,
        followUpFetchMs: null,
        cacheHit: true,
      },
    };
    recordEnrichmentPerf(withTiming, true);
    return withTiming;
  }

  if (!isAllowlistedUrl(url, options.allowlistDomains)) {
    const blocked = evidenceToEnrichment("http_error", null, null, {
      totalMs: Date.now() - started,
      primaryFetchMs: null,
      followUpFetchMs: null,
      cacheHit: false,
    });
    recordEnrichmentPerf(blocked, false);
    return blocked;
  }

  const fetchFn = options.fetchFn ?? fetch;
  const lookup = options.lookup;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxHtmlBytes = options.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES;
  const maxFollowUps = Math.max(0, Math.min(2, options.maxSameOriginFollowUps ?? 1));

  let safeUrl: URL;
  try {
    safeUrl = await assertPublicHttpUrl(url, lookup);
  } catch {
    const blocked = evidenceToEnrichment("http_error", null, null, {
      totalMs: Date.now() - started,
      primaryFetchMs: null,
      followUpFetchMs: null,
      cacheHit: false,
    });
    recordEnrichmentPerf(blocked, false);
    return blocked;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let primaryFetchMs: number | null = null;
  let followUpFetchMs: number | null = null;

  try {
    let current = safeUrl.toString();
    let response: Response | null = null;
    const fetchStarted = Date.now();

    for (let hop = 0; hop <= 3; hop += 1) {
      const nextSafe = await assertPublicHttpUrl(current, lookup);
      if (!isAllowlistedUrl(nextSafe.toString(), options.allowlistDomains)) {
        clearTimeout(timeout);
        const blocked = evidenceToEnrichment("http_error", null, null, {
          totalMs: Date.now() - started,
          primaryFetchMs: Date.now() - fetchStarted,
          followUpFetchMs: null,
          cacheHit: false,
        });
        recordEnrichmentPerf(blocked, false);
        return blocked;
      }

      response = await fetchFn(nextSafe.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          // Legitimate browser-compatible identity — not anti-bot evasion.
          "User-Agent":
            "Mozilla/5.0 (compatible; AiArhitektProductDiscovery/1.1; +https://aiarhitekt.local)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "sl-SI,sl;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) break;
        current = new URL(location, nextSafe).toString();
        continue;
      }
      break;
    }

    primaryFetchMs = Date.now() - fetchStarted;
    const adapterHint = adapterIdForUrl(safeUrl.toString());

    if (!response) {
      clearTimeout(timeout);
      const err = blockedEnrichment(
        "http_error",
        null,
        { totalMs: Date.now() - started, primaryFetchMs, followUpFetchMs: null, cacheHit: false },
        "FETCH_BLOCKED_OTHER",
        adapterHint
      );
      recordEnrichmentPerf(err, false);
      return err;
    }
    if (!response.ok) {
      const snippet = (await readBoundedHtml(response, 8_000)) ?? "";
      let blockReason = classifyFetchBlock({
        httpStatus: response.status,
        bodySnippet: snippet,
      });
      const adapterMeta = runMerchantAcquisitionAdapter({
        pageUrl: safeUrl.toString(),
        html: snippet,
      });
      if (adapterMeta?.unsupportedDirectEnrichment && response.status === 403) {
        blockReason = "FETCH_BLOCKED_CHALLENGE_PAGE";
      }
      clearTimeout(timeout);
      const status =
        response.status === 429
          ? "rate_limited"
          : response.status === 403 || response.status === 401
            ? "forbidden"
            : httpStatusToEnrichmentStatus(response.status);
      const err = blockedEnrichment(
        status,
        response.status,
        { totalMs: Date.now() - started, primaryFetchMs, followUpFetchMs: null, cacheHit: false },
        blockReason,
        adapterMeta?.adapter ?? adapterHint
      );
      recordEnrichmentPerf(err, false);
      return err;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      clearTimeout(timeout);
      const err = evidenceToEnrichment("parse_error", null, response.status, {
        totalMs: Date.now() - started,
        primaryFetchMs,
        followUpFetchMs: null,
        cacheHit: false,
      });
      recordEnrichmentPerf(err, false);
      return err;
    }

    const html = await readBoundedHtml(response, maxHtmlBytes);
    if (!html) {
      clearTimeout(timeout);
      const err = evidenceToEnrichment("parse_error", null, response.status, {
        totalMs: Date.now() - started,
        primaryFetchMs,
        followUpFetchMs: null,
        cacheHit: false,
      });
      recordEnrichmentPerf(err, false);
      return err;
    }

    const pageUrl = safeUrl.toString();
    const adapterResult = runMerchantAcquisitionAdapter({ pageUrl, html });
    const extraFromAdapter = adapterResult?.extraPriceCandidates ?? [];
    const adapterUrls = adapterResult?.productDataUrls ?? [];

    let acquired = acquireMerchantEvidenceFromHtml(html, pageUrl, {
      extraPriceCandidates: extraFromAdapter,
    });
    let sameOriginAttempted = false;
    let sameOriginHit = false;

    const followCandidates = [
      ...acquired.sameOriginProductDataUrls,
      ...adapterUrls,
    ].filter((u, i, arr) => arr.indexOf(u) === i);

    if (!acquired.verifiedPrice && maxFollowUps > 0 && followCandidates.length > 0) {
      sameOriginAttempted = true;
      const followStarted = Date.now();
      const followUrls = followCandidates.slice(0, maxFollowUps);
      const extra = [...extraFromAdapter];
      for (const followUrl of followUrls) {
        const json = await fetchSameOriginProductJson({
          url: followUrl,
          fetchFn,
          lookup,
          allowlistDomains: options.allowlistDomains,
          timeoutMs,
          signal: controller.signal,
        });
        if (!json) continue;
        sameOriginHit = true;
        extra.push(...extractPricesFromSameOriginJson(json, pageUrl, acquired.sku));
      }
      followUpFetchMs = Date.now() - followStarted;
      if (extra.length > 0) {
        acquired = acquireMerchantEvidenceFromHtml(html, pageUrl, {
          extraPriceCandidates: extra,
          sameOriginFollowUpAttempted: true,
          sameOriginFollowUpHit: sameOriginHit,
        });
      } else {
        acquired = {
          ...acquired,
          diagnostics: {
            ...acquired.diagnostics,
            sameOriginFollowUpAttempted: true,
            sameOriginFollowUpHit: false,
          },
        };
      }
    }

    clearTimeout(timeout);

    const fetchSuccessKind = classifyFetchSuccessHtml(html, {
      hasProductSignals:
        acquired.jsonLdProductFound ||
        acquired.price != null ||
        acquired.labeledSpecs.length > 0 ||
        Boolean(acquired.productName),
    });

    const acquisitionSource: MerchantAcquisitionSource | null =
      adapterResult && acquired.verifiedPrice && extraFromAdapter.length > 0
        ? "merchant_domain_adapter"
        : acquired.verifiedPrice?.source === "same_origin_product_data"
          ? "merchant_public_product_json"
          : acquired.verifiedPrice?.source === "embedded_state"
            ? "embedded_state"
            : acquired.verifiedPrice
              ? "merchant_html"
              : null;

    const evidence: ProductPageEvidence = {
      pageTitle: acquired.pageTitle,
      metaDescription: acquired.metaDescription,
      productName: acquired.productName,
      brand: acquired.brand,
      price: acquired.price,
      currency: acquired.currency,
      imageUrl: acquired.imageUrl,
      availability: acquired.availability,
      sku: acquired.sku,
      rawProductText: acquired.rawProductText,
      jsonLdProductFound: acquired.jsonLdProductFound,
      labeledSpecs: acquired.labeledSpecs,
      canonicalUrl: acquired.canonicalUrl,
      merchantEvidenceDiagnostics: {
        ...acquired.diagnostics,
        sameOriginFollowUpAttempted: sameOriginAttempted,
        sameOriginFollowUpHit: sameOriginHit,
        fetchSuccessKind,
        acquisitionSource,
        adapterId: adapterResult?.adapter ?? adapterHint,
        unsupportedDirectEnrichment: adapterResult?.unsupportedDirectEnrichment,
      },
      priceProvenance: acquired.priceProvenance,
      verifiedPrice: acquired.verifiedPrice,
      priceFailureReason: acquired.priceFailureReason,
      sameOriginProductDataUrls: acquired.sameOriginProductDataUrls,
    };

    if (fetchSuccessKind === "FETCH_SUCCESS_JS_SHELL" && !acquired.verifiedPrice) {
      const shell = evidenceToEnrichment("parse_error", evidence, response.status, {
        totalMs: Date.now() - started,
        primaryFetchMs,
        followUpFetchMs,
        cacheHit: false,
      });
      if (shell.merchantEvidenceDiagnostics) {
        shell.merchantEvidenceDiagnostics.fetchSuccessKind = fetchSuccessKind;
        shell.merchantEvidenceDiagnostics.adapterId = adapterResult?.adapter ?? adapterHint;
      }
      recordEnrichmentPerf(shell, false);
      return shell;
    }

    const enrichment = evidenceToEnrichment("success", evidence, response.status, {
      totalMs: Date.now() - started,
      primaryFetchMs,
      followUpFetchMs,
      cacheHit: false,
    });
    if (enrichment.status === "success") {
      const cached = cloneCandidateEnrichment(enrichment);
      enrichmentCache.set(cacheKey, cached);
      if (enrichment.canonicalUrl) {
        const canonKey = enrichmentCacheKey(enrichment.canonicalUrl);
        if (canonKey !== cacheKey) enrichmentCache.set(canonKey, cached);
      }
    }
    recordEnrichmentPerf(enrichment, false);
    return enrichment;
  } catch (error) {
    clearTimeout(timeout);
    const adapterHint = adapterIdForUrl(url);
    if (error instanceof Error && /abort|timeout/i.test(error.message)) {
      const err = blockedEnrichment(
        "timeout",
        null,
        { totalMs: Date.now() - started, primaryFetchMs, followUpFetchMs, cacheHit: false },
        "FETCH_BLOCKED_TIMEOUT",
        adapterHint
      );
      recordEnrichmentPerf(err, false);
      return err;
    }
    const err = blockedEnrichment(
      "http_error",
      null,
      { totalMs: Date.now() - started, primaryFetchMs, followUpFetchMs, cacheHit: false },
      "FETCH_BLOCKED_OTHER",
      adapterHint
    );
    recordEnrichmentPerf(err, false);
    return err;
  }
}
