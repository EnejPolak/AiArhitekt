import { isProductionDeployment } from "@/lib/env/deployment";
import type { CanonicalSelectionFields } from "./mapProduct";
import { usableProductImageUrl } from "./mapProduct";
import type { ResolvedDiscoverySelection } from "./resolveProducts";
import {
  canonicalProductPageUrl,
  fetchTrustedProductPageEnrichment,
  getCachedProductPageEnrichment,
  type EnrichmentImageSource,
  type EnrichmentPriceSource,
  type ProductPageEnrichment,
  type TrustedProductPageFetchOptions,
} from "@/lib/serp/productPageEnrichment";
import {
  associateProductImage,
  enrichmentSourceToEvidenceSource,
  mergeImageEvidence,
} from "@/lib/references/imageEvidence";

export const DISCOVERY_ENRICHMENT_MIN_REMAINING_MS = 8_000;
export const DISCOVERY_ENRICHMENT_PER_PAGE_TIMEOUT_MS = 3_000;
export const DISCOVERY_ENRICHMENT_MAX_CONCURRENCY = 3;

export type WinnerEnrichmentStats = {
  winnerEnrichmentAttempts: number;
  winnerEnrichmentSuccesses: number;
  winnerEnrichmentFailures: number;
  winnerEnrichmentSkipped: number;
  winnerEnrichmentCacheHits: number;
};

type EnrichmentTarget = {
  requirementKey: string;
  product: CanonicalSelectionFields;
  needsPrice: boolean;
  needsImage: boolean;
};

export type EnrichDiscoveryWinnersOptions = {
  allowlistDomains: string[];
  deadlineAt?: number;
  enabled?: boolean;
  fetchOptions?: Omit<TrustedProductPageFetchOptions, "allowlistDomains">;
};

function remainingMs(deadlineAt?: number): number | null {
  if (!deadlineAt) return null;
  return deadlineAt - Date.now();
}

function logProductEnrichment(payload: Record<string, unknown>): void {
  if (isProductionDeployment()) return;
  console.info("[product-enrichment]", payload);
}

function winnerNeedsEnrichment(product: CanonicalSelectionFields): {
  needsPrice: boolean;
  needsImage: boolean;
} {
  const needsPrice = product.price == null;
  const needsImage = usableProductImageUrl(product.productImageUrl) == null;
  return { needsPrice, needsImage };
}

function mergeEnrichmentIntoProduct(
  product: CanonicalSelectionFields,
  enriched: ProductPageEnrichment,
  needsPrice: boolean,
  needsImage: boolean
): CanonicalSelectionFields {
  const nextPrice = needsPrice && enriched.price != null ? enriched.price : product.price;
  const nextCurrency =
    product.currency ?? (nextPrice != null ? enriched.currency ?? "EUR" : null);
  const nextImage =
    needsImage && enriched.image ? enriched.image : usableProductImageUrl(product.productImageUrl);
  const evidenceSource = enrichmentSourceToEvidenceSource(enriched.imageSource);
  const enrichmentEvidence =
    needsImage && enriched.image && evidenceSource
      ? associateProductImage({
          url: enriched.image,
          source: evidenceSource,
          productUrl: product.productUrl,
          merchantDomain: product.retailerDomain,
          sourcePageUrl: product.productUrl,
        })
      : null;

  return {
    ...product,
    price: nextPrice,
    currency: nextCurrency,
    productImageUrl: nextImage,
    hasReferenceImage: nextImage != null,
    imageEvidence: mergeImageEvidence(product.imageEvidence, [enrichmentEvidence]),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]!);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function enrichDiscoveryWinners(
  selections: ResolvedDiscoverySelection[],
  options: EnrichDiscoveryWinnersOptions
): Promise<{ selections: ResolvedDiscoverySelection[]; stats: WinnerEnrichmentStats }> {
  const stats: WinnerEnrichmentStats = {
    winnerEnrichmentAttempts: 0,
    winnerEnrichmentSuccesses: 0,
    winnerEnrichmentFailures: 0,
    winnerEnrichmentSkipped: 0,
    winnerEnrichmentCacheHits: 0,
  };

  if (options.enabled === false || selections.length === 0) {
    return { selections, stats };
  }

  const left = remainingMs(options.deadlineAt);
  if (left != null && left < DISCOVERY_ENRICHMENT_MIN_REMAINING_MS) {
    for (const selection of selections) {
      logProductEnrichment({
        requirementKey: selection.requirementKey,
        domain: selection.product.retailerDomain,
        attempted: false,
        skippedReason: "deadline_low",
      });
      stats.winnerEnrichmentSkipped += 1;
    }
    return { selections, stats };
  }

  const targets: EnrichmentTarget[] = [];
  const urlToTargets = new Map<string, EnrichmentTarget[]>();

  for (const selection of selections) {
    const { needsPrice, needsImage } = winnerNeedsEnrichment(selection.product);
    if (!needsPrice && !needsImage) {
      logProductEnrichment({
        requirementKey: selection.requirementKey,
        domain: selection.product.retailerDomain,
        attempted: false,
        skippedReason: "already_complete",
        priceFound: selection.product.price != null,
        imageFound: usableProductImageUrl(selection.product.productImageUrl) != null,
      });
      stats.winnerEnrichmentSkipped += 1;
      continue;
    }
    const target: EnrichmentTarget = {
      requirementKey: selection.requirementKey,
      product: selection.product,
      needsPrice,
      needsImage,
    };
    targets.push(target);
    const key = canonicalProductPageUrl(selection.product.productUrl);
    const bucket = urlToTargets.get(key) ?? [];
    bucket.push(target);
    urlToTargets.set(key, bucket);
  }

  const uniqueUrls = [...urlToTargets.keys()];
  const enrichmentByUrl = new Map<string, ProductPageEnrichment>();
  const fetchOptions: TrustedProductPageFetchOptions = {
    allowlistDomains: options.allowlistDomains,
    timeoutMs: DISCOVERY_ENRICHMENT_PER_PAGE_TIMEOUT_MS,
    ...options.fetchOptions,
  };

  await mapWithConcurrency(uniqueUrls, DISCOVERY_ENRICHMENT_MAX_CONCURRENCY, async (urlKey) => {
    const sample = urlToTargets.get(urlKey)?.[0];
    if (!sample) return;
    const url = sample.product.productUrl;

    const cached = getCachedProductPageEnrichment(url);
    if (cached) {
      enrichmentByUrl.set(urlKey, cached);
      stats.winnerEnrichmentCacheHits += 1;
      for (const target of urlToTargets.get(urlKey) ?? []) {
        logProductEnrichment({
          requirementKey: target.requirementKey,
          domain: target.product.retailerDomain,
          attempted: true,
          cacheHit: true,
          priceFound: cached.price != null,
          imageFound: cached.image != null,
          priceSource: cached.priceSource,
          imageSource: cached.imageSource,
        });
      }
      return;
    }

    stats.winnerEnrichmentAttempts += 1;
    const started = Date.now();
    const enriched = await fetchTrustedProductPageEnrichment(url, fetchOptions);
    const elapsedMs = Date.now() - started;
    enrichmentByUrl.set(urlKey, enriched);

    const success = enriched.price != null || enriched.image != null;
    if (success) stats.winnerEnrichmentSuccesses += 1;
    else stats.winnerEnrichmentFailures += 1;

    for (const target of urlToTargets.get(urlKey) ?? []) {
      logProductEnrichment({
        requirementKey: target.requirementKey,
        domain: target.product.retailerDomain,
        attempted: true,
        cacheHit: false,
        success,
        priceFound: enriched.price != null,
        imageFound: enriched.image != null,
        priceSource: enriched.priceSource as EnrichmentPriceSource,
        imageSource: enriched.imageSource as EnrichmentImageSource,
        elapsedMs,
      });
    }
  });

  const enrichedSelections = selections.map((selection) => {
    const { needsPrice, needsImage } = winnerNeedsEnrichment(selection.product);
    if (!needsPrice && !needsImage) return selection;
    const enriched = enrichmentByUrl.get(canonicalProductPageUrl(selection.product.productUrl));
    if (!enriched) return selection;
    return {
      ...selection,
      product: mergeEnrichmentIntoProduct(selection.product, enriched, needsPrice, needsImage),
    };
  });

  return { selections: enrichedSelections, stats };
}
