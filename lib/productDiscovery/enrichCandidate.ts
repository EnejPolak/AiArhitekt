import { TTLCache } from "@/lib/cache";
import { assertPublicHttpUrl, type AddressLookup } from "@/lib/references/ssrf";
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import {
  isUsableProductImageUrl,
  resolveAbsoluteHttpsUrl,
} from "@/lib/serp/productPageEnrichment";

export type EnrichmentStatus =
  | "success"
  | "forbidden"
  | "rate_limited"
  | "timeout"
  | "http_error"
  | "parse_error";

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
};

export type EnrichCandidateOptions = {
  allowlistDomains: string[];
  timeoutMs?: number;
  maxHtmlBytes?: number;
  fetchFn?: typeof fetch;
  lookup?: AddressLookup;
};

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_MAX_HTML_BYTES = 512_000;
const ENRICHMENT_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PRODUCT_TEXT_CHARS = 6000;

const enrichmentCache = new TTLCache<CandidateEnrichment>(ENRICHMENT_CACHE_TTL_MS);

function parsePriceNumber(raw: string): number | null {
  const normalized = raw.trim().replace(/\s+/g, "");
  const match = normalized.match(/^(\d{1,6})(?:[.,](\d{1,2}))?$/);
  if (!match) return null;
  const num = Number.parseFloat(`${match[1]}.${match[2] ?? "00"}`);
  if (!Number.isFinite(num) || num <= 0 || num >= 100_000) return null;
  return num;
}

function parseMetaContent(html: string, attr: "property" | "name", key: string): string | null {
  const direct = html.match(
    new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`, "i")
  );
  if (direct?.[1]) return direct[1].trim();
  const reverse = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`, "i")
  );
  return reverse?.[1]?.trim() ?? null;
}

function parseJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // malformed JSON-LD
    }
  }
  return blocks;
}

function collectJsonLdNodes(value: unknown, out: Record<string, unknown>[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdNodes(item, out);
    return;
  }
  if (typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record["@graph"]) collectJsonLdNodes(record["@graph"], out);
  out.push(record);
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") collectJsonLdNodes(nested, out);
  }
}

function isProductType(typeValue: unknown): boolean {
  if (typeof typeValue === "string") return /product/i.test(typeValue);
  if (Array.isArray(typeValue)) {
    return typeValue.some((item) => typeof item === "string" && /product/i.test(item));
  }
  return false;
}

function readBrand(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const name = (value as Record<string, unknown>).name;
    if (typeof name === "string") return name.trim() || null;
  }
  return null;
}

function readOfferFields(offer: unknown): {
  price: number | null;
  currency: string | null;
  availability: string | null;
} {
  if (!offer || typeof offer !== "object") {
    return { price: null, currency: null, availability: null };
  }
  const record = offer as Record<string, unknown>;
  const type = record["@type"];
  const isOffer =
    (typeof type === "string" && /offer/i.test(type)) ||
    (Array.isArray(type) && type.some((t) => typeof t === "string" && /offer/i.test(t)));

  if (!isOffer && !record.price && !record.lowPrice) {
    return { price: null, currency: null, availability: null };
  }

  const candidates = [record.price, record.lowPrice, record.highPrice];
  let price: number | null = null;
  for (const candidate of candidates) {
    if (typeof candidate === "number" && candidate > 0) {
      price = candidate;
      break;
    }
    if (typeof candidate === "string") {
      const parsed = parsePriceNumber(candidate.replace(/[^\d.,]/g, ""));
      if (parsed != null) {
        price = parsed;
        break;
      }
    }
  }

  const currency =
    typeof record.priceCurrency === "string"
      ? record.priceCurrency.trim().toUpperCase()
      : typeof record.currency === "string"
        ? record.currency.trim().toUpperCase()
        : null;

  const availability =
    typeof record.availability === "string"
      ? record.availability.split("/").pop()?.trim() ?? record.availability
      : null;

  return { price, currency, availability };
}

function readJsonLdImage(value: unknown, baseUrl: string): string | null {
  if (typeof value === "string") return resolveAbsoluteHttpsUrl(value, baseUrl);
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readJsonLdImage(item, baseUrl);
      if (parsed) return parsed;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const url = (value as Record<string, unknown>).url;
    if (typeof url === "string") return resolveAbsoluteHttpsUrl(url, baseUrl);
  }
  return null;
}

function scoreProductNode(node: Record<string, unknown>, pageUrl: string): number {
  const name = typeof node.name === "string" ? node.name.toLowerCase() : "";
  let score = 0;
  if (name) score += 10;
  try {
    const slug = decodeURIComponent(new URL(pageUrl).pathname).toLowerCase();
    for (const token of name.split(/\s+/).filter((t) => t.length >= 4)) {
      if (slug.includes(token)) score += 5;
    }
  } catch {
    // ignore
  }
  return score;
}

function parseJsonLdProduct(html: string, pageUrl: string): ProductPageEvidence | null {
  const nodes: Record<string, unknown>[] = [];
  for (const block of parseJsonLdBlocks(html)) collectJsonLdNodes(block, nodes);

  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  for (const node of nodes) {
    if (!isProductType(node["@type"])) continue;
    const score = scoreProductNode(node, pageUrl);
    if (score > bestScore) {
      best = node;
      bestScore = score;
    }
  }
  if (!best) return null;

  const offers = best.offers;
  let offerFields = readOfferFields(offers);
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      const fields = readOfferFields(offer);
      if (fields.price != null) {
        offerFields = fields;
        break;
      }
    }
  }

  const image = readJsonLdImage(best.image, pageUrl);
  return {
    pageTitle: null,
    metaDescription: null,
    productName: typeof best.name === "string" ? best.name.trim() : null,
    brand: readBrand(best.brand),
    price: offerFields.price,
    currency: offerFields.currency,
    imageUrl: isUsableProductImageUrl(image) ? image : null,
    availability: offerFields.availability,
    sku: typeof best.sku === "string" ? best.sku.trim() : null,
    rawProductText: null,
    jsonLdProductFound: true,
  };
}

function extractVisibleText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  const text = withoutScripts.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, MAX_PRODUCT_TEXT_CHARS);
}

function parseHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

export function parseProductPageEvidence(html: string, pageUrl: string): ProductPageEvidence {
  const pageTitle = parseHtmlTitle(html);
  const metaDescription =
    parseMetaContent(html, "name", "description") ??
    parseMetaContent(html, "property", "og:description");

  const jsonLd = parseJsonLdProduct(html, pageUrl);
  if (jsonLd?.jsonLdProductFound) {
    return {
      ...jsonLd,
      pageTitle: jsonLd.pageTitle ?? pageTitle,
      metaDescription: jsonLd.metaDescription ?? metaDescription,
      rawProductText: extractVisibleText(html),
    };
  }

  const ogTitle = parseMetaContent(html, "property", "og:title");
  const metaPrice = parseMetaContent(html, "property", "product:price:amount");
  const metaCurrency = parseMetaContent(html, "property", "product:price:currency");
  const ogImage = parseMetaContent(html, "property", "og:image");
  const image = resolveAbsoluteHttpsUrl(ogImage, pageUrl);

  return {
    pageTitle,
    metaDescription,
    productName: ogTitle ?? pageTitle,
    brand: null,
    price: metaPrice ? parsePriceNumber(metaPrice.replace(/[^\d.,]/g, "")) : null,
    currency: metaCurrency?.trim().toUpperCase() ?? (metaPrice ? "EUR" : null),
    imageUrl: isUsableProductImageUrl(image) ? image : null,
    availability: null,
    sku: null,
    rawProductText: extractVisibleText(html),
    jsonLdProductFound: false,
  };
}

function enrichmentCacheKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
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

function evidenceToEnrichment(status: EnrichmentStatus, evidence: ProductPageEvidence | null): CandidateEnrichment {
  if (!evidence || status !== "success") {
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
    };
  }
  return {
    status: "success",
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
  };
}

export function getCachedCandidateEnrichment(url: string): CandidateEnrichment | null {
  return enrichmentCache.get(enrichmentCacheKey(url));
}

export function clearCandidateEnrichmentCache(): void {
  enrichmentCache.clear();
}

export async function enrichCandidatePage(
  url: string,
  options: EnrichCandidateOptions
): Promise<CandidateEnrichment> {
  const cacheKey = enrichmentCacheKey(url);
  const cached = enrichmentCache.get(cacheKey);
  if (cached) return cached;

  if (!isAllowlistedUrl(url, options.allowlistDomains)) {
    const blocked: CandidateEnrichment = evidenceToEnrichment("http_error", null);
    return blocked;
  }

  const fetchFn = options.fetchFn ?? fetch;
  const lookup = options.lookup;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxHtmlBytes = options.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES;

  let safeUrl: URL;
  try {
    safeUrl = await assertPublicHttpUrl(url, lookup);
  } catch {
    return evidenceToEnrichment("http_error", null);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let current = safeUrl.toString();
    let response: Response | null = null;

    for (let hop = 0; hop <= 3; hop += 1) {
      const nextSafe = await assertPublicHttpUrl(current, lookup);
      if (!isAllowlistedUrl(nextSafe.toString(), options.allowlistDomains)) {
        clearTimeout(timeout);
        return evidenceToEnrichment("http_error", null);
      }

      response = await fetchFn(nextSafe.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AiArhitektProductDiscovery/1.0)",
          Accept: "text/html,application/xhtml+xml",
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

    clearTimeout(timeout);

    if (!response) return evidenceToEnrichment("http_error", null);
    if (response.status === 403) return evidenceToEnrichment("forbidden", null);
    if (response.status === 429) return evidenceToEnrichment("rate_limited", null);
    if (!response.ok) return evidenceToEnrichment(httpStatusToEnrichmentStatus(response.status), null);

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return evidenceToEnrichment("parse_error", null);
    }

    const html = await readBoundedHtml(response, maxHtmlBytes);
    if (!html) return evidenceToEnrichment("parse_error", null);

    const evidence = parseProductPageEvidence(html, safeUrl.toString());
    const enrichment = evidenceToEnrichment("success", evidence);
    if (enrichment.status === "success") {
      enrichmentCache.set(cacheKey, enrichment);
    }
    return enrichment;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && /abort|timeout/i.test(error.message)) {
      return evidenceToEnrichment("timeout", null);
    }
    return evidenceToEnrichment("http_error", null);
  }
}
