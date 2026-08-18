import { detectImageMime } from "@/lib/uploads/signature";
import {
  MAX_PRODUCT_REFERENCE_BYTES,
  MAX_REFERENCE_FETCH_REDIRECTS,
  PRODUCT_REFERENCE_MIME_TYPES,
  REFERENCE_FETCH_TIMEOUT_MS,
  type ProductReferenceMimeType,
} from "./constants";
import { readImageDimensions, type ImageDimensions } from "./dimensions";
import { ReferenceError, referenceErrorMessage } from "./errors";
import { assertPublicHttpUrl, type AddressLookup } from "./ssrf";

export type FetchLike = (
  input: string,
  init?: { method?: string; redirect?: RequestRedirect; signal?: AbortSignal; headers?: Record<string, string> }
) => Promise<Response>;

export type FetchedProductImage = {
  bytes: Uint8Array;
  mime: ProductReferenceMimeType;
  sourceUrl: string;
  sizeBytes: number;
  dimensions: ImageDimensions | null;
};

const ALLOWED_CONTENT_TYPES = new Set<string>([
  ...PRODUCT_REFERENCE_MIME_TYPES,
  "image/jpg",
  "image/pjpeg",
  "application/octet-stream",
]);

function normalizeContentType(header: string | null): string | null {
  if (!header) return null;
  const raw = header.split(";")[0]?.trim().toLowerCase() ?? "";
  return raw || null;
}

function contentTypeToMime(contentType: string | null): ProductReferenceMimeType | null {
  if (!contentType) return null;
  if (contentType === "image/jpeg" || contentType === "image/jpg" || contentType === "image/pjpeg") {
    return "image/jpeg";
  }
  if (contentType === "image/png") return "image/png";
  if (contentType === "image/webp") return "image/webp";
  return null;
}

async function readCappedBytes(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PRODUCT_REFERENCE_BYTES) {
    throw new ReferenceError("invalid_image", referenceErrorMessage("invalid_image"));
  }
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_PRODUCT_REFERENCE_BYTES) {
      throw new ReferenceError("invalid_image", referenceErrorMessage("invalid_image"));
    }
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_PRODUCT_REFERENCE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ReferenceError("invalid_image", referenceErrorMessage("invalid_image"));
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchValidatedProductImage(
  sourceUrl: string,
  options: {
    fetch?: FetchLike;
    lookup?: AddressLookup;
  } = {}
): Promise<FetchedProductImage> {
  const fetchFn = options.fetch ?? fetch;
  let current = sourceUrl;
  let response: Response | null = null;

  for (let hop = 0; hop <= MAX_REFERENCE_FETCH_REDIRECTS; hop += 1) {
    const safe = await assertPublicHttpUrl(current, options.lookup);
    try {
      response = await fetchFn(safe.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(REFERENCE_FETCH_TIMEOUT_MS),
        headers: { Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8" },
      });
    } catch {
      throw new ReferenceError("failed", referenceErrorMessage("failed"));
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REFERENCE_FETCH_REDIRECTS) {
        throw new ReferenceError("unsafe_url", referenceErrorMessage("unsafe_url"));
      }
      current = new URL(location, safe).toString();
      continue;
    }
    break;
  }

  if (!response || !response.ok) {
    throw new ReferenceError("failed", referenceErrorMessage("failed"));
  }

  const contentType = normalizeContentType(response.headers.get("content-type"));
  if (contentType && !ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ReferenceError("invalid_image", referenceErrorMessage("invalid_image"));
  }

  const bytes = await readCappedBytes(response);
  const magic = detectImageMime(bytes);
  if (!magic) {
    throw new ReferenceError("invalid_image", referenceErrorMessage("invalid_image"));
  }
  const declaredMime = contentTypeToMime(contentType);
  if (declaredMime && declaredMime !== magic) {
    throw new ReferenceError("invalid_image", referenceErrorMessage("invalid_image"));
  }

  return {
    bytes,
    mime: magic,
    sourceUrl,
    sizeBytes: bytes.byteLength,
    dimensions: readImageDimensions(bytes, magic),
  };
}
