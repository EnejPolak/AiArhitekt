import {
  MAX_PRODUCT_PAGE_HTML_BYTES,
  MAX_PRODUCT_REFERENCE_CANDIDATES,
  PRODUCT_PAGE_FETCH_TIMEOUT_MS,
} from "./constants";
import type { FetchLike } from "./fetchImage";
import { ReferenceError, referenceErrorMessage } from "./errors";
import { assertPublicHttpUrl, type AddressLookup } from "./ssrf";

export type ProductImageSource = "jsonld" | "schema" | "og" | "twitter" | "gallery";

export type ExtractedProductImage = {
  url: string;
  source: ProductImageSource;
};

const REJECT_IMAGE_URL =
  /(?:^|\/)(?:logo|favicon|sprite|placeholder|tracking|pixel|spacer|blank|icon)(?:[-_/]|\b)|\.(?:svg|ico)(?:$|[?#])/i;
const REJECT_IMAGE_EXT = /\.(?:svg|ico|gif)(?:$|[?#])/i;

function resolveAbsoluteHttpUrl(raw: string | null | undefined, baseUrl: string): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^(?:data:|blob:|javascript:|file:)/i.test(trimmed)) return null;
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    if (resolved.username || resolved.password) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

export function isCandidateProductImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (REJECT_IMAGE_URL.test(parsed.pathname) || REJECT_IMAGE_EXT.test(parsed.pathname)) return false;
    if (REJECT_IMAGE_URL.test(parsed.search)) return false;
    return true;
  } catch {
    return false;
  }
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
      // skip malformed JSON-LD
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
}

function isProductType(typeValue: unknown): boolean {
  if (typeof typeValue === "string") return /product/i.test(typeValue);
  if (Array.isArray(typeValue)) {
    return typeValue.some((item) => typeof item === "string" && /product/i.test(item));
  }
  return false;
}

function collectImageValues(value: unknown, out: string[]): void {
  if (!value) return;
  if (typeof value === "string") {
    if (value.trim()) out.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageValues(item, out);
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.url === "string") out.push(record.url);
    if (typeof record.contentUrl === "string") out.push(record.contentUrl);
    if (record.image) collectImageValues(record.image, out);
  }
}

function parseMetaContent(html: string, attr: "property" | "name", key: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(
    `<meta\\b[^>]*(?:${attr}=["']${key}["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*${attr}=["']${key}["'])[^>]*>`,
    "gi"
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const value = (match[1] ?? match[2])?.trim();
    if (value) values.push(value);
  }
  return values;
}

function parseItempropImages(html: string): string[] {
  const values: string[] = [];
  const tags = html.match(/<(?:meta|img|link)\b[^>]*itemprop=["']image["'][^>]*>/gi) ?? [];
  for (const tag of tags) {
    const content =
      tag.match(/\b(?:content|src|href)=["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bitemprop=["']image["'][^>]*\b(?:content|src|href)=["']([^"']+)["']/i)?.[1];
    if (content) values.push(content);
  }
  return values;
}

function parseGalleryImages(html: string): string[] {
  const values: string[] = [];
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const width = Number(tag.match(/\bwidth=["']?(\d+)/i)?.[1] ?? "");
    const height = Number(tag.match(/\bheight=["']?(\d+)/i)?.[1] ?? "");
    if ((Number.isFinite(width) && width > 0 && width < 64) || (Number.isFinite(height) && height > 0 && height < 64)) {
      continue;
    }
    const src =
      tag.match(/\b(?:data-src|data-original|data-lazy-src|src)=["']([^"']+)["']/i)?.[1] ?? null;
    if (src) values.push(src);
  }
  return values;
}

function pushUnique(
  items: ExtractedProductImage[],
  seen: Set<string>,
  raw: string | null | undefined,
  baseUrl: string,
  source: ProductImageSource
) {
  const url = resolveAbsoluteHttpUrl(raw, baseUrl);
  if (!isCandidateProductImageUrl(url)) return;
  if (seen.has(url)) return;
  seen.add(url);
  items.push({ url, source });
}

export function extractProductImageCandidates(
  html: string,
  pageUrl: string
): ExtractedProductImage[] {
  const seen = new Set<string>();
  const ordered: ExtractedProductImage[] = [];

  const nodes: Record<string, unknown>[] = [];
  for (const block of parseJsonLdBlocks(html)) collectJsonLdNodes(block, nodes);
  for (const node of nodes) {
    if (!isProductType(node["@type"])) continue;
    const images: string[] = [];
    collectImageValues(node.image, images);
    for (const image of images) {
      pushUnique(ordered, seen, image, pageUrl, "jsonld");
    }
  }

  for (const image of parseItempropImages(html)) {
    pushUnique(ordered, seen, image, pageUrl, "schema");
  }

  for (const image of parseMetaContent(html, "property", "og:image")) {
    pushUnique(ordered, seen, image, pageUrl, "og");
  }

  for (const image of [
    ...parseMetaContent(html, "name", "twitter:image"),
    ...parseMetaContent(html, "property", "twitter:image"),
  ]) {
    pushUnique(ordered, seen, image, pageUrl, "twitter");
  }

  for (const image of parseGalleryImages(html)) {
    pushUnique(ordered, seen, image, pageUrl, "gallery");
  }

  return ordered.slice(0, MAX_PRODUCT_REFERENCE_CANDIDATES);
}

export function selectPrimaryProductImage(
  candidates: ExtractedProductImage[]
): ExtractedProductImage | null {
  return candidates[0] ?? null;
}

export async function fetchProductPageHtml(
  pageUrl: string,
  options: {
    fetch?: FetchLike;
    lookup?: AddressLookup;
    timeoutMs?: number;
    maxBytes?: number;
  } = {}
): Promise<string | null> {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? PRODUCT_PAGE_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_PRODUCT_PAGE_HTML_BYTES;
  let safe: URL;
  try {
    safe = await assertPublicHttpUrl(pageUrl, options.lookup);
  } catch {
    return null;
  }

  try {
    const response = await fetchFn(safe.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; AiArhitektProductReference/1.0)",
      },
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !contentType.includes("html") && !contentType.includes("xml") && !contentType.includes("text/plain")) {
      return null;
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) return null;
    const text = await response.text();
    if (!text || text.length > maxBytes) return null;
    return text;
  } catch (error) {
    if (error instanceof ReferenceError) throw error;
    return null;
  }
}

export function assertCandidateImageUrlOrThrow(url: string): string {
  if (!isCandidateProductImageUrl(url)) {
    throw new ReferenceError("unsafe_url", referenceErrorMessage("unsafe_url"));
  }
  return url;
}
