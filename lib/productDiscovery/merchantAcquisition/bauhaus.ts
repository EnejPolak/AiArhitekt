/**
 * Bauhaus.si acquisition adapter.
 *
 * Investigation result (offline CONTROL corpus + live probes):
 * - Entire host returns HTTP 403 "Varnostni pregled" (security challenge)
 *   for product pages, robots.txt, sitemap, and homepage alike.
 * - No legitimate public product JSON / feed path was reachable without
 *   bypassing the challenge (which we refuse to do).
 *
 * Therefore: classify as unsupported for direct merchant enrichment.
 */
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import type { MerchantAcquisitionAdapter, MerchantAdapterResult } from "./types";

export const bauhausAcquisitionAdapter: MerchantAcquisitionAdapter = {
  id: "bauhaus",
  matches(domainRoot: string) {
    return normalizeDomainToRoot(domainRoot) === "bauhaus.si";
  },
  enrichFromHtml(ctx): MerchantAdapterResult {
    return {
      adapter: "bauhaus",
      acquisitionSource: "merchant_domain_adapter",
      extraPriceCandidates: [],
      productDataUrls: [],
      notes: [
        "bauhaus.si returns site-wide security challenge (Varnostni pregled); no safe public product-data path",
      ],
      unsupportedDirectEnrichment: true,
    };
  },
};
