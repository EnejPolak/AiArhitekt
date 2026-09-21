import type {
  CanonicalSerpItemResult,
  CanonicalSerpPicked,
  CanonicalSerpTopCandidate,
} from "@/lib/serp/search";
import { attachStepCCandidatePool, STEP_C_MAX_CANDIDATES } from "./stepCCandidates";
import type { ProductDiscoveryProduct, ProductDiscoveryResult } from "./types";

function toPicked(result: ProductDiscoveryResult): CanonicalSerpPicked | null {
  if (result.status !== "found" || !result.product) return null;
  return productToPicked(result.product);
}

function productToPicked(product: ProductDiscoveryProduct): CanonicalSerpPicked {
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
      ...(product.sku ? [`sku:${product.sku}`] : []),
      ...(product.category ? [`category:${product.category}`] : []),
    ],
    domain: product.retailerDomain,
    snippet: product.whyItMatches || null,
  };
}

function toCanonicalTopCandidate(
  product: ProductDiscoveryProduct,
  scoreOffset: number
): CanonicalSerpTopCandidate {
  const picked = productToPicked(product);
  return {
    title: picked.title,
    url: picked.url,
    domain: picked.domain,
    snippet: picked.snippet ?? undefined,
    price: picked.price != null && picked.currency === "EUR" ? { value: picked.price, currency: "EUR" } : null,
    image: picked.image,
    score: Math.max(1, picked.score - scoreOffset),
    flags: {
      isProductLikeUrl: true,
      isCategoryLikeUrl: false,
      hasToolIntent: false,
      hasHomeIntent: false,
    },
  };
}

function toTopCandidates(result: ProductDiscoveryResult): CanonicalSerpTopCandidate[] {
  const pooled = attachStepCCandidatePool(result);
  const products = pooled.candidates?.length ? pooled.candidates : pooled.product ? [pooled.product] : [];
  return products.slice(0, STEP_C_MAX_CANDIDATES).map((product, index) =>
    toCanonicalTopCandidate(product, index * 5)
  );
}

export function productDiscoveryResultToCanonicalItem(
  result: ProductDiscoveryResult
): CanonicalSerpItemResult {
  const pooled = attachStepCCandidatePool(result);
  return {
    item: pooled.requestedItem,
    picked: toPicked(pooled),
    topCandidates: toTopCandidates(pooled),
  };
}

export { STEP_C_MAX_CANDIDATES };
