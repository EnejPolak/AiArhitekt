/**
 * Narrow merchant acquisition adapters.
 * Only legitimate public storefront data — no anti-bot evasion.
 */
import type { MerchantPriceCandidate } from "../merchantPurchasePrice";
import type { MerchantAdapterId, MerchantAcquisitionSource } from "../merchantAcquisitionDiagnostics";

export type MerchantAdapterContext = {
  pageUrl: string;
  html: string;
  domainRoot: string;
};

export type MerchantAdapterResult = {
  adapter: MerchantAdapterId;
  acquisitionSource: MerchantAcquisitionSource;
  /** Extra price candidates discovered by the adapter from already-fetched HTML. */
  extraPriceCandidates: MerchantPriceCandidate[];
  /** Same-origin / merchant-referenced product data URLs found in markup. */
  productDataUrls: string[];
  notes: string[];
  /** True when this merchant is known-unavailable for direct enrichment. */
  unsupportedDirectEnrichment?: boolean;
};

export type MerchantAcquisitionAdapter = {
  id: MerchantAdapterId;
  matches(domainRoot: string): boolean;
  /**
   * Inspect already-fetched HTML (and optionally declare public follow-up URLs).
   * Must not invent endpoints.
   */
  enrichFromHtml(ctx: MerchantAdapterContext): MerchantAdapterResult;
};
