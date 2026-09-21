import type { CanonicalSelectionFields } from "./mapProduct";
import { usableProductImageUrl } from "./mapProduct";
import type { RankedProductCandidate } from "./style/types";
import {
  extractProductImageCandidates,
  fetchProductPageHtmlResult,
} from "@/lib/references/extractProductImages";
import { fetchValidatedProductImage, type FetchLike } from "@/lib/references/fetchImage";
import { MAX_PRODUCT_REFERENCE_EVALUATE } from "@/lib/references/constants";
import {
  associateProductImage,
  extractedSourceToEvidenceSource,
  mergeImageEvidence,
  type ProductImageEvidence,
} from "@/lib/references/imageEvidence";
import {
  candidateCouldBeatCurrent,
  isHigherQualityReference,
  isPageSourcedEvidenceSource,
  parseDeclaredSizeFromUrl,
  rankExactProductEvidence,
  referenceQualityFromDimensions,
} from "@/lib/references/referenceQuality";
import { ReferenceError } from "@/lib/references/errors";
import type { AddressLookup } from "@/lib/references/ssrf";

export type CandidatePageEnrichmentResult = {
  attempted: boolean;
  htmlAvailable: boolean;
  extractedCount: number;
  associatedCount: number;
  failureCode?: string;
};

function productFields(candidate: RankedProductCandidate): CanonicalSelectionFields {
  return candidate.product as CanonicalSelectionFields;
}

function parseJsonLdProductName(html: string): string | null {
  const match = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const record = node as Record<string, unknown>;
      const type = record["@type"];
      const isProduct =
        typeof type === "string"
          ? /product/i.test(type)
          : Array.isArray(type) && type.some((item) => typeof item === "string" && /product/i.test(item));
      if (!isProduct) continue;
      if (typeof record.name === "string" && record.name.trim()) return record.name.trim();
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Merchant-page image discovery for a ranked candidate.
 * Step C imageUrl is only a claim: a valid product URL still gets one page fetch.
 */
export async function enrichRankedCandidateFromProductPage(
  candidate: RankedProductCandidate,
  options: { fetch?: FetchLike; lookup?: AddressLookup } = {}
): Promise<CandidatePageEnrichmentResult> {
  const product = productFields(candidate);
  const pageUrl = product.productUrl;
  if (!pageUrl) {
    return { attempted: false, htmlAvailable: false, extractedCount: 0, associatedCount: 0, failureCode: "wrong_product" };
  }

  const page = await fetchProductPageHtmlResult(pageUrl, {
    fetch: options.fetch,
    lookup: options.lookup,
  });
  if (!page.ok) {
    return {
      attempted: true,
      htmlAvailable: false,
      extractedCount: 0,
      associatedCount: 0,
      failureCode: page.reason,
    };
  }

  const extracted = extractProductImageCandidates(page.html, page.finalUrl || pageUrl);
  const associated: ProductImageEvidence[] = [];
  for (const item of extracted) {
    const evidence = associateProductImage({
      url: item.url,
      source: extractedSourceToEvidenceSource(item.source),
      productUrl: pageUrl,
      merchantDomain: product.retailerDomain,
      sourcePageUrl: pageUrl,
    });
    if (evidence) associated.push(evidence);
  }

  const declaredSizeByUrl = new Map(
    extracted.map((item) => [item.url, { width: item.declaredWidth, height: item.declaredHeight }])
  );
  product.imageEvidence = mergeImageEvidence(product.imageEvidence, associated);
  const jsonLdName = parseJsonLdProductName(page.html);
  if (jsonLdName && (!product.productTitle || product.productTitle.length < 3)) {
    product.productTitle = jsonLdName;
  }

  if (extracted.length > 0 && associated.length === 0) {
    return {
      attempted: true,
      htmlAvailable: true,
      extractedCount: extracted.length,
      associatedCount: 0,
      failureCode: "association_unverified",
    };
  }

  const primary = rankExactProductEvidence(associated, declaredSizeByUrl)[0];
  if (!primary) {
    return {
      attempted: true,
      htmlAvailable: true,
      extractedCount: 0,
      associatedCount: 0,
      failureCode: "no_image",
    };
  }

  product.productImageUrl = primary.url;
  product.hasReferenceImage = true;
  return {
    attempted: true,
    htmlAvailable: true,
    extractedCount: extracted.length,
    associatedCount: associated.length,
  };
}

export async function downloadCandidateReferenceImage(
  candidate: RankedProductCandidate,
  options: { fetch?: FetchLike; lookup?: AddressLookup } = {}
): Promise<{ ready: boolean; failureCode?: string; cachedBytesValid?: boolean }> {
  const product = productFields(candidate);
  const existing = usableProductImageUrl(product.productImageUrl)
    ? associateProductImage({
        url: product.productImageUrl as string,
        source: "existing_product_image_url",
        productUrl: product.productUrl,
        merchantDomain: product.retailerDomain,
        sourcePageUrl: product.productUrl,
      })
    : null;
  const evidence = mergeImageEvidence(product.imageEvidence, [existing]);
  const ranked = rankExactProductEvidence(evidence);
  const pageSourced = ranked.filter((item) => isPageSourcedEvidenceSource(item.source));
  const urls = (pageSourced.length > 0 ? pageSourced : ranked)
    .map((item) => item.url)
    .filter((url, index, all) => all.indexOf(url) === index);

  if (urls.length === 0) return { ready: false, failureCode: "no_image" };
  if (!options.fetch) {
    product.productImageUrl = urls[0] ?? product.productImageUrl;
    product.hasReferenceImage = true;
    return { ready: true, cachedBytesValid: true };
  }

  let lastFailure: string = "fetch_failed";
  let best: {
    url: string;
    width: number | null;
    height: number | null;
    sizeBytes: number;
  } | null = null;
  for (const imageUrl of urls.slice(0, MAX_PRODUCT_REFERENCE_EVALUATE)) {
    const declared = parseDeclaredSizeFromUrl(imageUrl);
    if (best && !candidateCouldBeatCurrent(declared, best)) continue;
    try {
      const image = await fetchValidatedProductImage(imageUrl, {
        fetch: options.fetch,
        lookup: options.lookup,
      });
      if (!image.bytes.length || image.sizeBytes <= 0) {
        lastFailure = "invalid_image";
        continue;
      }
      const candidateImage = {
        url: imageUrl,
        width: image.dimensions?.width ?? null,
        height: image.dimensions?.height ?? null,
        sizeBytes: image.sizeBytes,
      };
      if (!best || isHigherQualityReference(candidateImage, best)) {
        best = candidateImage;
      }
      if (referenceQualityFromDimensions(best.width, best.height) === "high") break;
    } catch (error) {
      if (error instanceof ReferenceError) {
        if (error.code === "invalid_image") {
          lastFailure = "invalid_image";
          continue;
        }
        if (error.code === "unsafe_url") {
          lastFailure = "merchant_blocked";
          continue;
        }
      }
      lastFailure = "fetch_failed";
    }
  }
  if (!best) return { ready: false, failureCode: lastFailure };
  product.productImageUrl = best.url;
  product.hasReferenceImage = true;
  return { ready: true, cachedBytesValid: true };
}
