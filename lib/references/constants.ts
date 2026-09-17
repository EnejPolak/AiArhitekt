export const PROJECT_ASSETS_BUCKET = "project-assets";
export const PRODUCT_REFERENCE_KIND = "product-references";
export const MAX_PRODUCT_REFERENCE_BYTES = 10 * 1024 * 1024;
export const MAX_REFERENCE_FETCH_REDIRECTS = 3;
export const REFERENCE_FETCH_TIMEOUT_MS = 15_000;
export const PRODUCT_PAGE_FETCH_TIMEOUT_MS = 8_000;
export const MAX_PRODUCT_PAGE_HTML_BYTES = 512_000;
export const MIN_PRODUCT_REFERENCE_EDGE = 64;
export const MIN_PRODUCT_REFERENCE_BYTES = 256;
export const MAX_PRODUCT_REFERENCE_CANDIDATES = 3;

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
