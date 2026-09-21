export const PROJECT_ASSETS_BUCKET = "project-assets";
export const PRODUCT_REFERENCE_KIND = "product-references";
export const MAX_PRODUCT_REFERENCE_BYTES = 10 * 1024 * 1024;
export const MAX_REFERENCE_FETCH_REDIRECTS = 3;
export const REFERENCE_FETCH_TIMEOUT_MS = 15_000;
export const PRODUCT_PAGE_FETCH_TIMEOUT_MS = 8_000;
/**
 * Hard cap on *decompressed* product-page HTML.
 * `Content-Length` is often the gzip size (~50KB) and cannot be used as the
 * decoded budget. Large retailer product documents with JSON-LD, Open Graph,
 * Twitter, and gallery markup commonly decompress to 0.5–1.2 MiB (OBI pages
 * measured at ~650–670KB). 2 MiB admits those pages while remaining a hard
 * DoS bound, far below the 10 MiB product-image cap. Pages over the cap fail
 * closed; HTML is never truncated, so evidence parsers cannot see cut JSON-LD.
 */
export const MAX_PRODUCT_PAGE_HTML_BYTES = 2_097_152;
export const MIN_PRODUCT_REFERENCE_EDGE = 64;
export const MIN_PRODUCT_REFERENCE_BYTES = 256;
/** Max associated image URLs fetched while choosing a primary reference. */
export const MAX_PRODUCT_REFERENCE_CANDIDATES = 3;
/** Max product-page image URLs extracted before association/ranking. */
export const MAX_PRODUCT_IMAGE_EXTRACT = 24;
/** Max associated URLs to byte-fetch when picking the best exact-product image. */
export const MAX_PRODUCT_REFERENCE_EVALUATE = 6;
/** Longest edge for internal reference-quality class HIGH. */
export const REFERENCE_QUALITY_HIGH_EDGE = 800;
/** Longest edge for internal reference-quality class MEDIUM. */
export const REFERENCE_QUALITY_MEDIUM_EDGE = 400;

export const PRODUCT_REFERENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProductReferenceMimeType = (typeof PRODUCT_REFERENCE_MIME_TYPES)[number];

export const REFERENCE_MIME_TO_EXT: Record<ProductReferenceMimeType, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const REFERENCE_EXT_TO_MIME = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export type ProductReferenceExt = keyof typeof REFERENCE_EXT_TO_MIME;
