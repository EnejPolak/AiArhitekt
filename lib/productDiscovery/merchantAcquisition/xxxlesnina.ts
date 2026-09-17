/**
 * XXXLutz / xxxlesnina.si acquisition adapter.
 *
 * Live probes: Cloudflare "Just a moment..." challenge on product + homepage.
 * No safe public product-data path without bypassing bot protection.
 */
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import type { MerchantAcquisitionAdapter, MerchantAdapterResult } from "./types";

export const xxxlesninaAcquisitionAdapter: MerchantAcquisitionAdapter = {
  id: "xxxlesnina",
  matches(domainRoot: string) {
    return normalizeDomainToRoot(domainRoot) === "xxxlesnina.si";
  },
  enrichFromHtml(): MerchantAdapterResult {
    return {
      adapter: "xxxlesnina",
      acquisitionSource: "merchant_domain_adapter",
      extraPriceCandidates: [],
      productDataUrls: [],
      notes: [
        "xxxlesnina.si returns Cloudflare challenge interstitial; no safe public product-data path",
      ],
      unsupportedDirectEnrichment: true,
    };
  },
};
