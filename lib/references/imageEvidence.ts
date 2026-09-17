import { normalizeDomainToRoot } from "@/lib/serp/domains";
import { isCandidateProductImageUrl } from "./extractProductImages";
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
  | "fetch_failed";

const BANNER_OR_CATEGORY =
  /(?:^|\/)(?:logo|favicon|sprite|placeholder|tracking|pixel|spacer|blank|icon|banner|hero|category|categories|promo|advert)(?:[-_/]|\b)/i;

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

function sameMerchant(imageUrl: string, productUrl: string, merchantDomain: string | null): boolean {
  try {
    const imageHost = normalizeDomainToRoot(new URL(imageUrl).hostname);
    const pageHost = normalizeDomainToRoot(new URL(productUrl).hostname);
    const merchant = merchantDomain ? normalizeDomainToRoot(merchantDomain) : "";
    if (!imageHost) return false;
    if (pageHost && imageHost === pageHost) return true;
    if (merchant && imageHost === merchant) return true;
    return false;
  } catch {
    return false;
  }
}

export function isRejectedGenericImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return BANNER_OR_CATEGORY.test(parsed.pathname) || BANNER_OR_CATEGORY.test(parsed.search);
  } catch {
    return true;
  }
}

export function associateProductImage(input: {
  url: string;
  source: ProductImageEvidenceSource;
  productUrl: string;
  merchantDomain: string | null;
  sourcePageUrl?: string | null;
}): ProductImageEvidence | null {
  if (!isCandidateProductImageUrl(input.url)) return null;
  if (isRejectedGenericImageUrl(input.url)) return null;

  const pageUrl = input.sourcePageUrl ?? input.productUrl;
  const fromCanonicalPage = Boolean(pageUrl) && pageUrl === input.productUrl;
  const merchantMatch = sameMerchant(input.url, input.productUrl, input.merchantDomain);
  const pageSourced =
    input.source === "json_ld_product" ||
    input.source === "open_graph" ||
    input.source === "twitter_card" ||
    input.source === "merchant_gallery";

  const exactProductAssociation = pageSourced
    ? fromCanonicalPage || merchantMatch
    : merchantMatch;

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
