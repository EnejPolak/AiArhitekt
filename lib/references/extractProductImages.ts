import {
  MAX_PRODUCT_PAGE_HTML_BYTES,
  MAX_PRODUCT_REFERENCE_CANDIDATES,
  MAX_REFERENCE_FETCH_REDIRECTS,
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
/** Unresolved HTML/JS template leftovers, not fetchable image resources. */
const REJECT_UNRESOLVED_TEMPLATE = /[(){}]|\$\{|\{\{|<%/;

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
    if (
      REJECT_UNRESOLVED_TEMPLATE.test(parsed.pathname) ||
      REJECT_UNRESOLVED_TEMPLATE.test(parsed.search)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function htmlAttr(tag: string, names: string[]): string | null {
  for (const name of names) {
    const pattern = new RegExp(`(?:^|[\\s"'<])${name}=["']([^"']+)["']`, "i");
    const match = tag.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function parseSrcsetValue(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((item): item is string => Boolean(item));
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
    const content = htmlAttr(tag, ["content", "src", "href"]);
    if (content) values.push(content);
  }
  return values;
}

function parseGalleryImages(html: string): string[] {
  const values: string[] = [];
  const tags = html.match(/<(?:img|source)\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const width = Number(tag.match(/(?:^|[\s"'<])width=["']?(\d+)/i)?.[1] ?? "");
    const height = Number(tag.match(/(?:^|[\s"'<])height=["']?(\d+)/i)?.[1] ?? "");
    if ((Number.isFinite(width) && width > 0 && width < 64) || (Number.isFinite(height) && height > 0 && height < 64)) {
      continue;
    }
    const src = htmlAttr(tag, ["data-src", "data-original", "data-lazy-src", "src"]);
    if (src) values.push(src);
    const srcset = htmlAttr(tag, ["srcset"]);
    if (srcset) values.push(...parseSrcsetValue(srcset));
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

export type ProductPageHtmlFailure = "merchant_blocked" | "fetch_failed";

export type ProductPageHtmlFailureDetail =
  | "dns_failed"
  | "ssrf_rejected"
  | "timeout"
  | "redirect_limit"
  | "redirect_missing_location"
  | "http_status"
  | "merchant_blocked"
  | "invalid_content_type"
  | "declared_content_too_large"
  | "streamed_content_too_large"
  | "empty_body"
  | "network_error";

export type ProductPageHtmlResult =
  | { ok: true; html: string; finalUrl: string }
  | {
      ok: false;
      reason: ProductPageHtmlFailure;
      detail: ProductPageHtmlFailureDetail;
      status?: number;
    };

function blockedStatus(status: number | undefined): boolean {
  return status === 401 || status === 403 || status === 407 || status === 429 || status === 451;
}

function fail(
  detail: ProductPageHtmlFailureDetail,
  status?: number
): Extract<ProductPageHtmlResult, { ok: false }> {
  const reason: ProductPageHtmlFailure =
    detail === "ssrf_rejected" || detail === "merchant_blocked" ? "merchant_blocked" : "fetch_failed";
  return status != null ? { ok: false, reason, detail, status } : { ok: false, reason, detail };
}

function contentEncodingIsIdentity(header: string | null): boolean {
  const encoding = (header ?? "").trim().toLowerCase();
  return !encoding || encoding === "identity";
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  const causeName = (error as { cause?: { name?: string } }).cause?.name;
  return name === "TimeoutError" || name === "AbortError" || causeName === "TimeoutError";
}

function isDnsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  const causeCode = (error as { cause?: { code?: string } }).cause?.code;
  return code === "ENOTFOUND" || code === "EAI_AGAIN" || causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN";
}

async function readCappedHtml(
  response: Response,
  maxBytes: number
): Promise<{ ok: true; html: string } | { ok: false; detail: "empty_body" | "streamed_content_too_large" }> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  const append = (value: Uint8Array): boolean => {
    total += value.byteLength;
    if (total > maxBytes) return false;
    chunks.push(value);
    return true;
  };

  const finish = (): { ok: true; html: string } | { ok: false; detail: "empty_body" | "streamed_content_too_large" } => {
    if (total === 0) return { ok: false, detail: "empty_body" };
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, html: new TextDecoder("utf-8").decode(bytes) };
  };

  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (!append(buffer)) return { ok: false, detail: "streamed_content_too_large" };
    return finish();
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (!append(value)) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, detail: "streamed_content_too_large" };
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return finish();
}

export async function fetchProductPageHtmlResult(
  pageUrl: string,
  options: {
    fetch?: FetchLike;
    lookup?: AddressLookup;
    timeoutMs?: number;
    maxBytes?: number;
  } = {}
): Promise<ProductPageHtmlResult> {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? PRODUCT_PAGE_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_PRODUCT_PAGE_HTML_BYTES;

  let current = pageUrl;
  try {
    for (let hop = 0; hop <= MAX_REFERENCE_FETCH_REDIRECTS; hop += 1) {
      let safe: URL;
      try {
        safe = await assertPublicHttpUrl(current, options.lookup);
      } catch {
        return fail("ssrf_rejected");
      }

      const response = await fetchFn(safe.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; AiArhitektProductReference/1.0)",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return fail("redirect_missing_location", response.status);
        current = new URL(location, safe).toString();
        continue;
      }

      if (blockedStatus(response.status)) {
        return fail("merchant_blocked", response.status);
      }
      if (!response.ok) {
        return fail("http_status", response.status);
      }

      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (
        contentType &&
        !contentType.includes("html") &&
        !contentType.includes("xml") &&
        !contentType.includes("text/plain")
      ) {
        return fail("invalid_content_type", response.status);
      }
      const declared = Number(response.headers.get("content-length"));
      if (
        contentEncodingIsIdentity(response.headers.get("content-encoding")) &&
        Number.isFinite(declared) &&
        declared > maxBytes
      ) {
        return fail("declared_content_too_large", response.status);
      }
      const body = await readCappedHtml(response, maxBytes);
      if (!body.ok) return fail(body.detail, response.status);
      return { ok: true, html: body.html, finalUrl: safe.toString() };
    }
    return fail("redirect_limit");
  } catch (error) {
    if (error instanceof ReferenceError) throw error;
    if (isTimeoutError(error)) return fail("timeout");
    if (isDnsError(error)) return fail("dns_failed");
    return fail("network_error");
  }
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
  const result = await fetchProductPageHtmlResult(pageUrl, options);
  return result.ok ? result.html : null;
}

export function assertCandidateImageUrlOrThrow(url: string): string {
  if (!isCandidateProductImageUrl(url)) {
    throw new ReferenceError("unsafe_url", referenceErrorMessage("unsafe_url"));
  }
  return url;
}
