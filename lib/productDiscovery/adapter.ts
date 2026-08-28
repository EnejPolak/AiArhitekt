import type {
  CanonicalSerpItemResult,
  CanonicalSerpPicked,
  CanonicalSerpTopCandidate,
} from "@/lib/serp/search";
import type { ProductDiscoveryResult } from "./types";

function toPicked(result: ProductDiscoveryResult): CanonicalSerpPicked | null {
  if (result.status !== "found" || !result.product) return null;
  const product = result.product;
  return {
    title: product.name,
    url: product.productUrl,
    image: product.imageUrl,
    price: product.price,
    currency: product.currency === "EUR" ? "EUR" : null,
    score: Math.round(product.matchScore * 100),
    confidence: product.matchScore,
    reasons: [
      ...product.matchedRequirements,
      ...(product.whyItMatches ? [product.whyItMatches] : []),
    ],
    domain: product.retailerDomain,
    snippet: product.whyItMatches || null,
  };
}

function toTopCandidates(result: ProductDiscoveryResult): CanonicalSerpTopCandidate[] {
  const picked = toPicked(result);
  if (!picked) return [];
  return [
    {
      title: picked.title,
      url: picked.url,
      domain: picked.domain,
      snippet: picked.snippet ?? undefined,
      price: picked.price != null && picked.currency === "EUR" ? { value: picked.price, currency: "EUR" } : null,
      image: picked.image,
      score: picked.score,
      flags: {
        isProductLikeUrl: true,
        isCategoryLikeUrl: false,
        hasToolIntent: false,
        hasHomeIntent: false,
      },
    },
  ];
}

export function productDiscoveryResultToCanonicalItem(
  result: ProductDiscoveryResult
): CanonicalSerpItemResult {
  return {
    item: result.requestedItem,
    picked: toPicked(result),
    topCandidates: toTopCandidates(result),
  };
}
