/**
 * OBI.si Magento/Alpine storefront adapter.
 *
 * Static HTML often embeds Offer microdata late in a large page
 * (`itemprop="price" content="…"` past ~512KB). Generic parsers work once
 * enough HTML is read; this adapter recovers Magento priceBox / Offer
 * microdata and SKU association from the fetched HTML without JS execution.
 */
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import {
  normalizeCurrency,
  parsePriceNumber,
  type MerchantPriceCandidate,
} from "../merchantPurchasePrice";
import type { MerchantAcquisitionAdapter, MerchantAdapterResult } from "./types";

function extractObiSku(html: string): string | null {
  const meta =
    html.match(/itemprop=["']sku["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/content=["']([^"']+)["'][^>]*itemprop=["']sku["']/i)?.[1];
  if (meta?.trim()) return meta.trim();
  const json = html.match(/"sku"\s*:\s*"([^"]+)"/);
  return json?.[1]?.trim() || null;
}

function extractObiProductId(html: string): string | null {
  const fromPriceBox = html.match(/data-product-id=["'](\d+)["']/i)?.[1];
  if (fromPriceBox) return fromPriceBox;
  const fromSpan = html.match(/id=["']product-price-(\d+)["']/i)?.[1];
  return fromSpan || null;
}

/**
 * Prefer numeric itemprop price content; ignore Vue/Alpine `:content` bindings.
 */
export function extractObiOfferMicrodataPrices(html: string): MerchantPriceCandidate[] {
  const out: MerchantPriceCandidate[] = [];
  const sku = extractObiSku(html);
  const productId = extractObiProductId(html);
  const currency =
    normalizeCurrency(
      html.match(/itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
        html.match(/content=["']([^"']+)["'][^>]*itemprop=["']priceCurrency["']/i)?.[1] ||
        null
    ) || "EUR";

  const patterns = [
    /itemprop=["']price["']\s+content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["']\s+itemprop=["']price["']/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1]!;
      // Skip Alpine/Vue bindings accidentally captured
      if (/searchResult|activeProducts|\{|\}/.test(raw)) continue;
      const amount = parsePriceNumber(raw);
      if (amount == null) continue;
      out.push({
        amount,
        currency,
        kind: "current",
        source: "microdata",
        productAssociation: productId || sku ? "obi_offer_microdata" : "microdata_itemprop",
        sourcePath: "obi.itemprop.price",
        rawLabel: "obi_offer_price",
        sku,
        variantId: productId,
      });
    }
  }

  // Magento visible price wrapper near product-price-{id}
  const wrapper = html.match(
    /id=["']product-price-(\d+)["'][^>]*>[\s\S]{0,400}?itemprop=["']price["']\s+content=["']([^"']+)["']/i
  );
  if (wrapper?.[2]) {
    const amount = parsePriceNumber(wrapper[2]);
    if (amount != null) {
      out.push({
        amount,
        currency,
        kind: "current",
        source: "html_product_price",
        productAssociation: "obi_price_wrapper",
        sourcePath: `obi.product-price-${wrapper[1]}`,
        sku,
        variantId: wrapper[1],
      });
    }
  }

  return out;
}

/**
 * Discover only product-data URLs explicitly present in markup (no guessing).
 */
export function discoverObiProductDataUrls(html: string, pageUrl: string): string[] {
  const urls = new Set<string>();
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  const patterns = [
    /["'](https?:\/\/www\.obi\.si\/[^"']+\.json[^"']*)["']/gi,
    /["'](\/[^"']*product[^"']*\.json[^"']*)["']/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      try {
        const resolved = new URL(m[1]!, pageUrl);
        if (resolved.origin !== origin) continue;
        if (!/\.json(\?|$)/i.test(resolved.pathname + resolved.search)) continue;
        urls.add(resolved.toString());
      } catch {
        /* ignore */
      }
    }
  }
  return [...urls].slice(0, 2);
}

export const obiAcquisitionAdapter: MerchantAcquisitionAdapter = {
  id: "obi",
  matches(domainRoot: string) {
    return normalizeDomainToRoot(domainRoot) === "obi.si";
  },
  enrichFromHtml(ctx): MerchantAdapterResult {
    const extraPriceCandidates = extractObiOfferMicrodataPrices(ctx.html);
    const productDataUrls = discoverObiProductDataUrls(ctx.html, ctx.pageUrl);
    return {
      adapter: "obi",
      acquisitionSource:
        extraPriceCandidates.length > 0 ? "merchant_domain_adapter" : "merchant_html",
      extraPriceCandidates,
      productDataUrls,
      notes:
        extraPriceCandidates.length > 0
          ? [`obi adapter recovered ${extraPriceCandidates.length} offer microdata price(s)`]
          : ["obi adapter found no numeric offer microdata in fetched HTML"],
    };
  },
};
