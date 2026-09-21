import { TTLCache } from "@/lib/cache";
import { assertPublicHttpUrl, type AddressLookup } from "@/lib/references/ssrf";
import { normalizeDomainToRoot } from "./domains";
import { parsePriceFromAny, type PriceValue } from "./enrich";

export type EnrichmentPriceSource = "serp" | "jsonld" | "meta" | "itemprop" | "html" | null;
export type EnrichmentImageSource = "serp" | "jsonld" | "og" | "twitter" | null;

export type ProductPageEnrichment = {
  price: number | null;
  currency: "EUR" | null;
  image: string | null;
  priceSource: EnrichmentPriceSource;
  imageSource: EnrichmentImageSource;
};

export type TrustedProductPageFetchOptions = {
  allowlistDomains: string[];
  timeoutMs?: number;
  maxHtmlBytes?: number;
  fetchFn?: typeof fetch;
  lookup?: AddressLookup;
};

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_MAX_HTML_BYTES = 512_000;
const ENRICHMENT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const enrichmentCache = new TTLCache<ProductPageEnrichment>(ENRICHMENT_CACHE_TTL_MS);

const REJECT_IMAGE_URL =
  /(?:^|\/)logo|favicon|sprite|placeholder|tracking|pixel|spacer|blank\.(?:gif|png)/i;
const REJECT_IMAGE_EXT = /\.(?:svg|ico)(?:$|[?#])/i;

function parsePriceNumber(raw: string): number | null {
  const normalized = raw.trim().replace(/\s+/g, "");
  const match = normalized.match(/^(\d{1,6})(?:[.,](\d{1,2}))?$/);
  if (!match) return null;
  const whole = match[1];
  const fraction = match[2] ?? "00";
  const num = Number.parseFloat(`${whole}.${fraction}`);
  if (!Number.isFinite(num) || num <= 0 || num >= 100_000) return null;
  return num;
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
      // malformed JSON-LD — skip safely
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
  if (record["@graph"]) {
    collectJsonLdNodes(record["@graph"], out);
  }
  out.push(record);
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") collectJsonLdNodes(nested, out);
  }
}

function isProductType(typeValue: unknown): boolean {
  if (typeof typeValue === "string") return /product/i.test(typeValue);
  if (Array.isArray(typeValue)) return typeValue.some((item) => typeof item === "string" && /product/i.test(item));
  return false;
}

function readJsonLdOfferPrice(offer: unknown): number | null {
  if (!offer || typeof offer !== "object") return null;
  const record = offer as Record<string, unknown>;
  const candidates = [record.price, record.lowPrice, record.highPrice];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && candidate > 0) return candidate;
    if (typeof candidate === "string") {
      const parsed = parsePriceNumber(candidate.replace(/[^\d.,]/g, ""));
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function readJsonLdImage(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readJsonLdImage(item);
      if (parsed) return parsed;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const url = (value as Record<string, unknown>).url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return null;
}

function parseJsonLdProduct(html: string): { price: number | null; image: string | null } {
  const nodes: Record<string, unknown>[] = [];
  for (const block of parseJsonLdBlocks(html)) collectJsonLdNodes(block, nodes);

  for (const node of nodes) {
    if (!isProductType(node["@type"])) continue;
    const offers = node.offers;
    let price: number | null = null;
    if (Array.isArray(offers)) {
      for (const offer of offers) {
        price = readJsonLdOfferPrice(offer);
        if (price != null) break;
      }
    } else {
      price = readJsonLdOfferPrice(offers);
    }
    const image = readJsonLdImage(node.image);
    if (price != null || image) return { price, image };
  }
  return { price: null, image: null };
}

function parseMetaContent(html: string, property: string): string | null {
  const direct = html.match(
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i")
  );
  if (direct?.[1]) return direct[1].trim();
  const reverse = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i")
  );
  return reverse?.[1]?.trim() ?? null;
}

function parseItempropPrice(html: string): number | null {
  const match =
    html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i);
  if (!match?.[1]) return null;
  return parsePriceNumber(match[1].replace(/[^\d.,]/g, ""));
}

function parseMetaProductPrice(html: string): number | null {
  const content = parseMetaContent(html, "product:price:amount");
  if (!content) return null;
  return parsePriceNumber(content.replace(/[^\d.,]/g, ""));
}

function parseDataPrice(html: string): number | null {
  const match = html.match(/data-price=["']([^"']+)["']/i);
  if (!match?.[1]) return null;
  return parsePriceNumber(match[1].replace(/[^\d.,]/g, ""));
}

function parseVisibleEurPrice(html: string): PriceValue | null {
  const stripped = html.replace(/<[^>]+>/g, " ");
  return parsePriceFromAny(stripped, undefined, undefined);
}

export function resolveAbsoluteHttpsUrl(raw: string | null | undefined, baseUrl: string): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^(?:data:|blob:|javascript:)/i.test(trimmed)) return null;
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== "https:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

export function isUsableProductImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  if (/^(?:data:|blob:|javascript:)/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (REJECT_IMAGE_URL.test(parsed.pathname)) return false;
    if (REJECT_IMAGE_EXT.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function parseProductPageEnrichment(html: string, baseUrl: string): ProductPageEnrichment {
  const jsonLd = parseJsonLdProduct(html);
  const ogImage = parseMetaContent(html, "og:image");
  const twitterImage = parseMetaContent(html, "twitter:image");
  const jsonLdImage = resolveAbsoluteHttpsUrl(jsonLd.image, baseUrl);
  const fallbackImage = resolveAbsoluteHttpsUrl(ogImage ?? twitterImage, baseUrl);
  const resolvedJsonLdImage = isUsableProductImageUrl(jsonLdImage) ? jsonLdImage : null;
  const resolvedFallbackImage = isUsableProductImageUrl(fallbackImage) ? fallbackImage : null;
  const resolvedImage = resolvedJsonLdImage ?? resolvedFallbackImage;
  const resolvedImageSource: EnrichmentImageSource = resolvedJsonLdImage
    ? "jsonld"
    : ogImage && resolvedFallbackImage
      ? "og"
      : twitterImage && resolvedFallbackImage
        ? "twitter"
        : null;

  if (jsonLd.price != null || jsonLd.image) {
    return {
      price: jsonLd.price,
      currency: jsonLd.price != null ? "EUR" : null,
      image: resolvedImage,
      priceSource: jsonLd.price != null ? "jsonld" : null,
      imageSource: resolvedImageSource,
    };
  }

  const metaPrice = parseMetaProductPrice(html);
  if (metaPrice != null) {
    return {
      price: metaPrice,
      currency: "EUR",
      image: resolvedImage,
      priceSource: "meta",
      imageSource: resolvedImageSource,
    };
  }

  const itempropPrice = parseItempropPrice(html);
  if (itempropPrice != null) {
    return {
      price: itempropPrice,
      currency: "EUR",
      image: resolvedImage,
      priceSource: "itemprop",
      imageSource: resolvedImageSource,
    };
  }

  const dataPrice = parseDataPrice(html);
  if (dataPrice != null) {
    return {
      price: dataPrice,
      currency: "EUR",
      image: resolvedImage,
      priceSource: "html",
      imageSource: resolvedImageSource,
    };
  }

  const visible = parseVisibleEurPrice(html);
  return {
    price: visible?.value ?? null,
    currency: visible ? "EUR" : null,
    image: resolvedImage,
    priceSource: visible ? "html" : null,
    imageSource: resolvedImageSource,
  };
}

export function canonicalProductPageUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.search = "";
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function isAllowlistedHttpsUrl(url: string, allowlistDomains: string[]): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const domain = normalizeDomainToRoot(parsed.hostname);
    if (!domain) return false;
    return allowlistDomains.some((entry) => normalizeDomainToRoot(entry) === domain);
  } catch {
    return false;
  }
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
  const text = await response.text();
  return text.slice(0, maxBytes);
}

export function getCachedProductPageEnrichment(url: string): ProductPageEnrichment | null {
  return enrichmentCache.get(canonicalProductPageUrl(url));
}

export function setCachedProductPageEnrichment(url: string, value: ProductPageEnrichment): void {
  enrichmentCache.set(canonicalProductPageUrl(url), value);
}

export function clearProductPageEnrichmentCache(): void {
  enrichmentCache.clear();
}

export async function fetchTrustedProductPageEnrichment(
  url: string,
  options: TrustedProductPageFetchOptions
): Promise<ProductPageEnrichment> {
  const cacheKey = canonicalProductPageUrl(url);
  const cached = enrichmentCache.get(cacheKey);
  if (cached) return cached;

  if (!isAllowlistedHttpsUrl(url, options.allowlistDomains)) {
    return { price: null, currency: null, image: null, priceSource: null, imageSource: null };
  }

  const fetchFn = options.fetchFn ?? fetch;
  const lookup = options.lookup;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxHtmlBytes = options.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES;

  let safeUrl: URL;
  try {
    safeUrl = await assertPublicHttpUrl(url, lookup);
  } catch {
    return { price: null, currency: null, image: null, priceSource: null, imageSource: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let current = safeUrl.toString();
    let response: Response | null = null;
    for (let hop = 0; hop <= 3; hop += 1) {
      const nextSafe = await assertPublicHttpUrl(current, lookup);
      response = await fetchFn(nextSafe.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AiArhitektProductEnrich/1.0)" },
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
    if (!response?.ok) {
      return { price: null, currency: null, image: null, priceSource: null, imageSource: null };
    }
    const html = await readBoundedHtml(response, maxHtmlBytes);
    if (!html) {
      return { price: null, currency: null, image: null, priceSource: null, imageSource: null };
    }
    const parsed = parseProductPageEnrichment(html, safeUrl.toString());
    if (parsed.price != null || parsed.image) {
      enrichmentCache.set(cacheKey, parsed);
    }
    return parsed;
  } catch {
    clearTimeout(timeout);
    return { price: null, currency: null, image: null, priceSource: null, imageSource: null };
  }
}
