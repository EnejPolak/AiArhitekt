import { isCandidateProductImageUrl } from "./imageUrlGuards";
import type { ExtractedProductImage } from "./extractProductImages";

export const PRODUCT_IMAGE_EVIDENCE_SOURCES = [
  "json_ld_product",
  "open_graph",
  "twitter_card",
  "merchant_gallery",
  "search_evidence",
  "existing_product_image_url",
] as const;

export type ProductImageEvidenceSource = (typeof PRODUCT_IMAGE_EVIDENCE_SOURCES)[number];

export type ProductImageEvidence = {
  url: string;
  source: ProductImageEvidenceSource;
  sourcePageUrl: string | null;
  merchantDomain: string | null;
  confidence: "high" | "medium" | "low";
  exactProductAssociation: boolean;
};

export type ProductReferenceStatus = "pending" | "ready" | "unavailable";

export type ProductReferenceFailureCode =
  | "no_image"
  | "merchant_blocked"
  | "invalid_image"
  | "association_unverified"
  | "fetch_failed"
  | "wrong_product";

const BANNER_OR_CATEGORY =
  /(?:^|[\/_-])(?:logo|favicon|sprite|placeholder|tracking|pixel|spacer|blank|icon|banner|hero|category|categories|promo|advert|flyout)(?:[-_/]|\b)|\/menu\//i;

const DOCUMENT_OR_INSTRUCTION =
  /(?:^|[\/_-])(?:legal[-_]?guarantee|instruction(?:s|[-_]?sheet)?|datasheet|packing(?:[-_]?list)?|user[-_]?manual|manual|notice)(?:[-_/]|\.|$)/i;

const FURNITURE_CLASSES: Array<{ id: string; product: RegExp; url: RegExp }> = [
  { id: "seating", product: /\b(sofa|couch|sectional|garnitur|sede[zž])/i, url: /(?:sofa|couch|sectional|garnitur|corner_sofas|sedezn)/i },
  { id: "bed", product: /\b(bed|mattress|postelj)/i, url: /(?:(?:^|[\/_-])bed(?:[\/_-]|\.|$)|mattress|postelj)/i },
  { id: "light", product: /\b(light|lamp|svetil|pendant)/i, url: /(?:light|lamp|svetil|pendant)/i },
  { id: "curtain", product: /\b(curtain|zavesa|blackout|drape)/i, url: /(?:curtain|zavesa|blackout|drape)/i },
  { id: "table", product: /\b(table|miza)/i, url: /(?:coffee[-_]?table|dining[-_]?table|klubsk|miza)/i },
  { id: "rug", product: /\b(rug|carpet|preprog)/i, url: /(?:rug|carpet|preprog)/i },
];

export function parseProductImageEvidence(value: unknown): ProductImageEvidence[] {
  if (!Array.isArray(value)) return [];
  const out: ProductImageEvidence[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const source = PRODUCT_IMAGE_EVIDENCE_SOURCES.find((entry) => entry === record.source);
    if (!url || !source) continue;
    out.push({
      url,
      source,
      sourcePageUrl: typeof record.sourcePageUrl === "string" ? record.sourcePageUrl : null,
      merchantDomain: typeof record.merchantDomain === "string" ? record.merchantDomain : null,
      confidence:
        record.confidence === "high" || record.confidence === "medium" || record.confidence === "low"
          ? record.confidence
          : "low",
      exactProductAssociation: record.exactProductAssociation === true,
    });
  }
  return out;
}

export function extractedSourceToEvidenceSource(
  source: ExtractedProductImage["source"]
): ProductImageEvidenceSource {
  if (source === "jsonld") return "json_ld_product";
  if (source === "og") return "open_graph";
  if (source === "twitter") return "twitter_card";
  return "merchant_gallery";
}

export function enrichmentSourceToEvidenceSource(
  source: "serp" | "jsonld" | "og" | "twitter" | null
): ProductImageEvidenceSource | null {
  if (source === "jsonld") return "json_ld_product";
  if (source === "og") return "open_graph";
  if (source === "twitter") return "twitter_card";
  if (source === "serp") return "search_evidence";
  return null;
}

export function isRejectedGenericImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const haystack = `${parsed.pathname}${parsed.search}`;
    return BANNER_OR_CATEGORY.test(haystack) || DOCUMENT_OR_INSTRUCTION.test(haystack);
  } catch {
    return true;
  }
}

export function imageConflictsProductIdentity(
  url: string,
  productTitle?: string | null,
  itemSpec?: string | null
): boolean {
  const identity = `${productTitle ?? ""} ${itemSpec ?? ""}`.trim();
  if (!identity) return false;
  let path = url;
  try {
    path = `${new URL(url).pathname} ${new URL(url).search}`;
  } catch {
    /* use raw */
  }
  const productClass = FURNITURE_CLASSES.find((entry) => entry.product.test(identity));
  if (!productClass) return false;
  return FURNITURE_CLASSES.some(
    (entry) => entry.id !== productClass.id && entry.url.test(path)
  );
}

export function isUsableExactProductImageUrl(
  url: string | null | undefined,
  productTitle?: string | null,
  itemSpec?: string | null
): url is string {
  if (!url || !isCandidateProductImageUrl(url) || isRejectedGenericImageUrl(url)) return false;
  return !imageConflictsProductIdentity(url, productTitle, itemSpec);
}

export function selectionHasUsableExactProductImage(selection: {
  productTitle: string;
  itemSpec?: string | null;
  productImageUrl?: string | null;
  imageEvidence?: ProductImageEvidence[] | null;
  referenceStatus?: string | null;
}): boolean {
  if (selection.referenceStatus === "unavailable" || selection.referenceStatus === "pending") {
    return false;
  }
  const title = selection.productTitle;
  const spec = selection.itemSpec;
  // The declared/cached product image is the visualization source of truth.
  // Stale imageEvidence alone must not keep an invalid thumbnail READY.
  return isUsableExactProductImageUrl(selection.productImageUrl, title, spec);
}

export function associateProductImage(input: {
  url: string;
  source: ProductImageEvidenceSource;
  productUrl: string;
  merchantDomain: string | null;
  sourcePageUrl?: string | null;
  productTitle?: string | null;
  itemSpec?: string | null;
}): ProductImageEvidence | null {
  if (!isCandidateProductImageUrl(input.url)) return null;
  if (isRejectedGenericImageUrl(input.url)) return null;
  if (imageConflictsProductIdentity(input.url, input.productTitle, input.itemSpec)) return null;

  const pageUrl = input.sourcePageUrl ?? input.productUrl;
  const fromCanonicalPage = Boolean(pageUrl) && pageUrl === input.productUrl;
  const pageSourced =
    input.source === "json_ld_product" ||
    input.source === "open_graph" ||
    input.source === "twitter_card" ||
    input.source === "merchant_gallery" ||
    input.source === "existing_product_image_url";

  // Same-merchant is not enough. The image must come from this product page,
  // then still pass chrome / identity checks above.
  const exactProductAssociation = pageSourced && fromCanonicalPage;
  if (!exactProductAssociation) return null;

  const confidence: ProductImageEvidence["confidence"] =
    input.source === "json_ld_product"
      ? "high"
      : input.source === "open_graph" || input.source === "merchant_gallery"
        ? "medium"
        : "low";

  return {
    url: input.url,
    source: input.source,
    sourcePageUrl: pageUrl,
    merchantDomain: input.merchantDomain,
    confidence,
    exactProductAssociation: true,
  };
}

export function evidenceFromProductImageUrl(input: {
  url: string | null | undefined;
  productUrl: string;
  merchantDomain: string | null;
}): ProductImageEvidence | null {
  if (!input.url) return null;
  return associateProductImage({
    url: input.url,
    source: "existing_product_image_url",
    productUrl: input.productUrl,
    merchantDomain: input.merchantDomain,
    sourcePageUrl: input.productUrl,
  });
}

export function mergeImageEvidence(
  existing: ProductImageEvidence[] | null | undefined,
  next: Array<ProductImageEvidence | null | undefined>
): ProductImageEvidence[] {
  const out: ProductImageEvidence[] = [];
  const seen = new Set<string>();
  for (const item of [...(existing ?? []), ...next]) {
    if (!item?.exactProductAssociation) continue;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

export function evidenceCandidateUrls(evidence: ProductImageEvidence[] | null | undefined): string[] {
  return (evidence ?? [])
    .filter((item) => item.exactProductAssociation)
    .map((item) => item.url);
}
