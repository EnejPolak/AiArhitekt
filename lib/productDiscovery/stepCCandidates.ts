import { normalizeDomainToRoot } from "@/lib/serp/domains";
import type { ProductDiscoveryModelOutput, ProductDiscoveryModelProduct } from "./schema";
import type { ProductDiscoveryProduct, ProductDiscoveryResult, ProductDiscoverySource } from "./types";

export const STEP_C_MAX_CANDIDATES = 5;

const PRODUCT_PATH_PATTERN =
  /\/(p|product|products|izdelek|artikel|prod|item|sku|trgovina)\/|\/p\/[^/?#]+/i;

function canonicalUrlKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${path}${parsed.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function looksLikeProductUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return PRODUCT_PATH_PATTERN.test(parsed.pathname) || PRODUCT_PATH_PATTERN.test(url);
  } catch {
    return false;
  }
}

function productFromSource(
  source: ProductDiscoverySource,
  requestedItem: string,
  rank: number
): ProductDiscoveryProduct | null {
  if (!source.url || !looksLikeProductUrl(source.url)) return null;
  const domain = normalizeDomainToRoot(source.url);
  if (!domain) return null;
  const name = source.title?.trim() || requestedItem;
  return {
    name,
    retailer: domain,
    retailerDomain: domain,
    productUrl: source.url,
    price: null,
    currency: null,
    priceUnit: null,
    imageUrl: null,
    specifications: {},
    matchScore: Math.max(0.2, 0.72 - (rank - 1) * 0.08),
    matchedRequirements: [],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: source.snippet?.trim() || requestedItem,
    category: requestedItem,
    rank,
    sourceUrls: [source.url],
  };
}

function productFromEnrichmentDebug(
  debug: NonNullable<NonNullable<ProductDiscoveryResult["diagnostics"]>["enrichmentCandidateDebug"]>[number],
  requestedItem: string,
  rank: number
): ProductDiscoveryProduct | null {
  if (!debug.url) return null;
  const domain = normalizeDomainToRoot(debug.domain || debug.url);
  if (!domain) return null;
  return {
    name: requestedItem,
    retailer: domain,
    retailerDomain: domain,
    productUrl: debug.url,
    price: null,
    currency: null,
    priceUnit: null,
    imageUrl: null,
    specifications: {},
    matchScore: Math.max(0.2, Math.min(0.9, debug.preRankScore / 100)),
    matchedRequirements: [],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: requestedItem,
    sku: null,
    category: requestedItem,
    rank,
    sourceUrls: [debug.url],
  };
}

export function buildStepCCandidateProducts(result: ProductDiscoveryResult): ProductDiscoveryProduct[] {
  const out: ProductDiscoveryProduct[] = [];
  const seen = new Set<string>();

  const push = (product: ProductDiscoveryProduct | null | undefined) => {
    if (!product?.productUrl || out.length >= STEP_C_MAX_CANDIDATES) return;
    const key = canonicalUrlKey(product.productUrl);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      ...product,
      category: product.category ?? result.requestedItem,
      rank: out.length + 1,
      sourceUrls: product.sourceUrls?.length
        ? product.sourceUrls
        : [product.productUrl, ...result.sources.map((source) => source.url)].filter(Boolean),
    });
  };

  push(result.product);
  for (const extra of result.candidates ?? []) push(extra);
  push(result.diagnostics?.rejectedProduct);
  for (const debug of result.diagnostics?.enrichmentCandidateDebug ?? []) {
    push(productFromEnrichmentDebug(debug, result.requestedItem, out.length + 1));
  }
  for (const source of result.sources) {
    push(productFromSource(source, result.requestedItem, out.length + 1));
  }
  return out;
}

export function attachStepCCandidatePool(
  result: ProductDiscoveryResult,
  excludeProductUrls?: string[]
): ProductDiscoveryResult {
  const candidates = filterExcludedProducts(buildStepCCandidateProducts(result), excludeProductUrls);
  if (candidates.length === 0) {
    if (result.product && isExcludedProductUrl(result.product.productUrl, excludeProductUrls)) {
      return { ...result, product: null, candidates: [] };
    }
    return result;
  }
  const product =
    result.product && isExcludedProductUrl(result.product.productUrl, excludeProductUrls)
      ? candidates[0] ?? null
      : result.product;
  return { ...result, product, candidates };
}

function specificationsToRecord(
  specs: ProductDiscoveryModelProduct["specifications"] | undefined
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const entry of specs ?? []) {
    if (entry.key.trim()) out[entry.key.trim()] = entry.value;
  }
  return out;
}

function modelProductToProposal(
  product: ProductDiscoveryModelProduct,
  requestedItem: string,
  rank: number
): ProductDiscoveryProduct {
  const domain = normalizeDomainToRoot(product.retailerDomain || product.productUrl) || product.retailerDomain;
  return {
    name: product.name.trim(),
    retailer: product.retailer.trim(),
    retailerDomain: domain,
    productUrl: product.productUrl,
    price: typeof product.price === "number" && product.price > 0 ? product.price : null,
    currency: product.currency,
    priceUnit: product.priceUnit,
    imageUrl: product.imageUrl?.startsWith("https://") ? product.imageUrl : null,
    specifications: specificationsToRecord(product.specifications),
    matchScore: Math.max(0, Math.min(1, product.matchScore)),
    matchedRequirements: product.matchedRequirements ?? [],
    unmetRequirements: product.unmetRequirements ?? [],
    unknownRequirements: product.unknownRequirements ?? [],
    whyItMatches: product.whyItMatches.trim() || requestedItem,
    sku: product.sku ?? null,
    category: product.category ?? requestedItem,
    rank,
    sourceUrls: product.sourceUrls?.length ? product.sourceUrls : [product.productUrl],
  };
}

export function isExcludedProductUrl(url: string, excluded: string[] | undefined): boolean {
  if (!excluded?.length) return false;
  const key = canonicalUrlKey(url);
  if (!key) return false;
  return excluded.some((item) => canonicalUrlKey(item) === key);
}

export function filterExcludedProducts<T extends { productUrl: string }>(
  products: T[],
  excluded: string[] | undefined
): T[] {
  if (!excluded?.length) return products;
  return products.filter((product) => !isExcludedProductUrl(product.productUrl, excluded));
}

export function extractModelProposedCandidates(input: {
  parsed: ProductDiscoveryModelOutput | null | undefined;
  requestedItem: string;
  allowlistDomains: string[];
  excludeProductUrls?: string[];
}): ProductDiscoveryProduct[] {
  if (!input.parsed) return [];
  const raw = [input.parsed.product, ...(input.parsed.candidates ?? [])].filter(
    (product): product is ProductDiscoveryModelProduct => Boolean(product?.productUrl)
  );
  const out: ProductDiscoveryProduct[] = [];
  const seen = new Set<string>();
  for (const product of raw) {
    if (out.length >= STEP_C_MAX_CANDIDATES) break;
    if (isExcludedProductUrl(product.productUrl, input.excludeProductUrls)) continue;
    const domain = normalizeDomainToRoot(product.retailerDomain || product.productUrl);
    if (!domain || !input.allowlistDomains.includes(domain)) continue;
    const key = canonicalUrlKey(product.productUrl);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(modelProductToProposal(product, input.requestedItem, out.length + 1));
  }
  return out;
}

export function withModelCandidatePool(
  result: ProductDiscoveryResult,
  proposed: ProductDiscoveryProduct[] | undefined,
  excludeProductUrls?: string[]
): ProductDiscoveryResult {
  if (!proposed?.length) return attachStepCCandidatePool(result, excludeProductUrls);
  return attachStepCCandidatePool(
    {
      ...result,
      candidates: [...proposed, ...(result.candidates ?? [])],
    },
    excludeProductUrls
  );
}
