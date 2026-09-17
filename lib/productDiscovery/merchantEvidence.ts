/**
 * Generic merchant-page evidence extraction (standards-based).
 * No retailer-specific parsers. Model claims are never evidence.
 */
import type { EvidenceField, EvidenceKind } from "./productEvidence";
import {
  isUsableProductImageUrl,
  resolveAbsoluteHttpsUrl,
} from "@/lib/serp/productPageEnrichment";
import {
  discoverSameOriginProductDataUrls,
  extractEmbeddedStatePrices,
  extractHtmlProductPrices,
  extractLabeledHtmlPrices,
  extractMetaPrices,
  extractMicrodataPrices,
  extractPricesFromSameOriginJson,
  inferJsOnlyPriceFailure,
  normalizeCurrency,
  parsePriceNumber,
  selectVerifiedPurchasePrice,
  type MerchantPriceCandidate as PurchasePriceCandidate,
  type PriceFailureReason,
  type VerifiedMerchantPrice,
} from "./merchantPurchasePrice";

import type {
  FetchBlockReason,
  FetchSuccessKind,
  MerchantAcquisitionSource,
  MerchantAdapterId,
} from "./merchantAcquisitionDiagnostics";
import {
  extractionMethodFromSpecOrigin,
  normalizeDimensionToCm,
  sanitizeEvidenceExcerpt,
  safeSourcePath,
  type EvidenceExtractionMethod,
} from "./evidenceProvenance";

export type MerchantEvidenceDiagnostics = {
  status: string;
  httpStatus: number | null;
  jsonLdProductFound: boolean;
  canonicalFound: boolean;
  canonicalUrl?: string | null;
  productNameFound: boolean;
  productName?: {
    found: boolean;
    sourcePath?: string;
  };
  priceFound: boolean;
  price?: {
    found: boolean;
    amount?: number;
    currency?: string | null;
    extractionMethod?: EvidenceExtractionMethod;
    sourcePath?: string | null;
    excerpt?: string | null;
    evidenceKind?: VerifiedMerchantPrice["source"];
  };
  materialFound: boolean;
  colorFound: boolean;
  materialsFound?: number;
  colorsFound?: number;
  labeledDimensionsFound: number;
  extractionMethods: string[];
  priceFailureReason?: PriceFailureReason | null;
  priceSource?: VerifiedMerchantPrice["source"] | null;
  priceKind?: VerifiedMerchantPrice["kind"] | null;
  priceCandidatesConsidered?: number;
  sameOriginFollowUpAttempted?: boolean;
  sameOriginFollowUpHit?: boolean;
  fetchBlockReason?: FetchBlockReason | null;
  fetchSuccessKind?: FetchSuccessKind | null;
  acquisitionSource?: MerchantAcquisitionSource | null;
  adapterId?: MerchantAdapterId;
  unsupportedDirectEnrichment?: boolean;
};

export type MerchantSpecOrigin =
  | "json_ld"
  | "meta"
  | "product_spec_table"
  | "product_attribute"
  | "product_text";

export type MerchantSpecFact = {
  field: EvidenceField;
  label: string;
  value: string;
  kind: EvidenceKind;
  /** Labeled text suitable for evidence haystacks, e.g. "Širina: 600 mm". */
  text: string;
  unit?: string | null;
  confidence?: "high" | "medium" | "low";
  verifiedAt?: string;
  origin?: MerchantSpecOrigin;
  extractionMethod?: EvidenceExtractionMethod;
  sourcePath?: string | null;
  evidenceExcerpt?: string | null;
  /** Normalized single-axis dimension (cm). Ambiguous pairs stay null. */
  normalizedValue?: string | null;
};

/** @deprecated Prefer PurchasePriceCandidate / VerifiedMerchantPrice */
export type MerchantPriceCandidate = {
  price: number;
  currency: string | null;
  provenance:
    | "json_ld_offer"
    | "json_ld_aggregate_offer"
    | "meta_sale"
    | "meta_product"
    | "microdata"
    | "embedded";
  isSale?: boolean;
};

export type MerchantEvidenceFromHtml = {
  status: "success" | "partial";
  canonicalUrl: string | null;
  pageTitle: string | null;
  metaDescription: string | null;
  productName: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  priceProvenance: string | null;
  verifiedPrice: VerifiedMerchantPrice | null;
  priceFailureReason: PriceFailureReason | null;
  sameOriginProductDataUrls: string[];
  imageUrl: string | null;
  availability: string | null;
  sku: string | null;
  mpn: string | null;
  rawProductText: string | null;
  labeledSpecs: MerchantSpecFact[];
  jsonLdProductFound: boolean;
  extractionSources: {
    jsonLd: boolean;
    meta: boolean;
    html: boolean;
    embeddedStructuredData: boolean;
  };
  diagnostics: MerchantEvidenceDiagnostics;
};

export {
  discoverSameOriginProductDataUrls,
  extractPricesFromSameOriginJson,
  parsePriceNumber,
  normalizeCurrency,
  selectVerifiedPurchasePrice,
};
export type { PriceFailureReason, VerifiedMerchantPrice, PurchasePriceCandidate };

const MAX_PRODUCT_TEXT_CHARS = 6000;
const MAX_SPECS = 60;
const RELATED_KEY_RE =
  /\b(related|recommend|upsell|cross[-_]?sell|accessory|accessories|carousel|podobni|priporocen)\b/i;
const RELATED_REGION_RE =
  /<(section|div|aside|ul|ol)[^>]*(?:class|id)=["'][^"']*\b(?:related[-_\s]?products?|recommended|upsell|cross[-_]?sell|also[-_]?bought|podobni[-_\s]?izdelk\w*|priporo[cč]en\w*|recently[-_]?viewed|you[-_]?may[-_]?also)\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
const SHIPPING_OR_FINANCE_OFFER_RE =
  /\b(shipping|dostava|postage|delivery[-_ ]?cost|versand|shippingdetails|installment|instalment|mese[cč]no|monthly|financ|\/mo|obrok|kredit)\b/i;
const UNLABELED_PAIR_DIM_RE =
  /\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?\s*(?:mm|cm|m)\b/i;

const WIDTH_TOKEN = /(?:^|[^a-z0-9])(?:sirina|width|wide|breite|largeur|larghezza)(?:[^a-z0-9]|$)/i;
const HEIGHT_TOKEN = /(?:^|[^a-z0-9])(?:visina|height|hohe|hoehe)(?:[^a-z0-9]|$)/i;
const DEPTH_TOKEN =
  /(?:^|[^a-z0-9])(?:globina|depth|tiefe|dolzina|length|lange)(?:[^a-z0-9]|$)/i;
const DIAMETER_TOKEN = /(?:^|[^a-z0-9])(?:premer|diameter|durchmesser)(?:[^a-z0-9]|$)/i;
const THICKNESS_TOKEN = /(?:^|[^a-z0-9])(?:debelina|thickness|starke|staerke)(?:[^a-z0-9]|$)/i;
const MATERIAL_TOKEN =
  /(?:^|[^a-z0-9])(?:material(?:i|e|na\s+sestava)?|materijal|werkstoff|composition|sestava|frame\s+material|body\s+material|surface\s+material)(?:[^a-z0-9]|$)/i;
const COLOR_TOKEN = /(?:^|[^a-z0-9])(?:barva|colour|color|farbe)(?:[^a-z0-9]|$)/i;
const FINISH_TOKEN =
  /(?:^|[^a-z0-9])(?:finish|povrsina|obdelava|surface|struktura\s+materiala)(?:[^a-z0-9]|$)/i;
const BRAND_TOKEN =
  /(?:^|[^a-z0-9])(?:brand|znamka|blagovna\s*znamka|hersteller|manufacturer)(?:[^a-z0-9]|$)/i;
const PACKAGE_TOKEN =
  /(?:^|[^a-z0-9])(?:paket(?:a|u|om)?|package|shipping|karton|carton|embalaz|parcel|dostav[ae]|versand)(?:[^a-z0-9]|$)/i;
const WEIGHT_TOKEN = /(?:^|[^a-z0-9])(?:teza|weight|masa|netto|brutto|kg)(?:[^a-z0-9]|$)/i;
const PRODUCT_DIM_TOKEN = /(?:^|[^a-z0-9])(?:izdelk|product|artikel|article|item)(?:[^a-z0-9]|$)/i;
/** Cabinet niche / install clearance — not the product's own width. */
const NON_PRODUCT_WIDTH_TOKEN =
  /(?:^|[^a-z0-9])(?:omaric\w*|omara|cabinet|cupboard|minimaln[ae]?|min\.\s*sirina|einbau\w*|vgradn\w*)(?:[^a-z0-9]|$)/i;

function normalizeLabelKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(h, 16));
      } catch {
        return _;
      }
    })
    .replace(/&#(\d+);/g, (_, d: string) => {
      try {
        return String.fromCodePoint(Number(d));
      } catch {
        return _;
      }
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&apos;/gi, "'");
}

function stripTags(raw: string): string {
  return decodeHtmlEntities(raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function stripAttributeNoise(html: string): string {
  return html.replace(/\s(?:style|class|id|href|src|title|aria-[a-z-]+)=["'][^"']*["']/gi, "");
}

/**
 * Remove non-product page chrome before spec/text extraction.
 * Generic class tokens only — no retailer hostnames.
 */
export function stripNonProductChrome(html: string): string {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<(aside|menu)[\s\S]*?<\/\1>/gi, " ");
  const chromeRegion =
    /<(div|section|ul|ol|aside|nav)[^>]*(?:class|id)=["'][^"']*\b(?:flyout|megamenu|cookie|consent|gdpr|breadcrumb|newsletter|minicart|navigation|main-menu|nav-menu)\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
  out = out.replace(chromeRegion, " ");
  out = out.replace(RELATED_REGION_RE, " ");
  return stripAttributeNoise(out);
}

function selectProductLocalHtml(html: string): { html: string; scoped: boolean } {
  const stripped = stripNonProductChrome(html);
  const scopedPatterns = [
    /<main\b[^>]*>[\s\S]*?<\/main>/i,
    /<article\b[^>]*>[\s\S]*?<\/article>/i,
    /<[^>]+itemtype=["'][^"']*Product["'][^>]*>[\s\S]{0,80000}/i,
    /<(section|div)[^>]*(?:class|id)=["'][^"']*\b(?:product[-_]?(?:detail|info|main|content|specs?|data|view)|pdp[-_]?(?:content|main|info))\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/i,
  ];
  for (const re of scopedPatterns) {
    const match = stripped.match(re);
    if (match?.[0] && match[0].replace(/<[^>]+>/g, " ").trim().length >= 20) {
      return { html: match[0], scoped: true };
    }
  }
  return { html: stripped, scoped: false };
}

function isPackageOrShippingLabel(label: string): boolean {
  return PACKAGE_TOKEN.test(normalizeLabelKey(label));
}

function isWeightLabel(label: string): boolean {
  const key = normalizeLabelKey(label);
  return WEIGHT_TOKEN.test(key) && !/(?:^|[^a-z0-9])(?:mm|cm|m)(?:[^a-z0-9]|$)/i.test(key);
}

function parseMetaContent(html: string, attr: "property" | "name" | "itemprop", key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const direct = html.match(
    new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i")
  );
  if (direct?.[1]) return direct[1].trim();
  const reverse = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${escaped}["']`, "i")
  );
  return reverse?.[1]?.trim() ?? null;
}

function parseLinkCanonical(html: string): string | null {
  const match =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return match?.[1]?.trim() ?? null;
}

function parseHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function parseJsonLdValue(raw: string): unknown | null {
  let text = decodeHtmlEntities(raw)
    .replace(/^\s*<!--/, "")
    .replace(/-->\s*$/, "")
    .replace(/<!\[CDATA\[/gi, "")
    .replace(/\]\]>/g, "")
    .trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const relaxed = text.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(relaxed);
    } catch {
      return null;
    }
  }
}

function parseJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const parsed = parseJsonLdValue(raw);
    if (parsed != null) blocks.push(parsed);
  }
  return blocks;
}

function collectJsonLdNodes(value: unknown, out: Record<string, unknown>[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdNodes(item, out);
    return;
  }
  if (typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record["@graph"]) collectJsonLdNodes(record["@graph"], out);
  out.push(record);
  for (const [key, nested] of Object.entries(record)) {
    if (key === "@graph") continue;
    if (RELATED_KEY_RE.test(key)) continue;
    if (nested && typeof nested === "object") collectJsonLdNodes(nested, out);
  }
}

function typeMatches(typeValue: unknown, pattern: RegExp): boolean {
  if (typeof typeValue === "string") return pattern.test(typeValue);
  if (Array.isArray(typeValue)) {
    return typeValue.some((item) => typeof item === "string" && pattern.test(item));
  }
  return false;
}

function isProductType(typeValue: unknown): boolean {
  return typeMatches(typeValue, /product/i) && !typeMatches(typeValue, /productgroup|productmodel/i);
}

function readStringOrName(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readStringOrName(item);
      if (parsed) return parsed;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return readStringOrName(record.name ?? record.value ?? record.text ?? null);
  }
  return null;
}

function readBrand(value: unknown): string | null {
  return readStringOrName(value);
}

function isNonProductOffer(record: Record<string, unknown>): boolean {
  const blob = [record.name, record.category, record.description, record["@type"]]
    .map((part) => (typeof part === "string" ? part : Array.isArray(part) ? part.join(" ") : ""))
    .join(" ");
  return SHIPPING_OR_FINANCE_OFFER_RE.test(blob);
}

function readOfferFields(offer: unknown): {
  price: number | null;
  currency: string | null;
  availability: string | null;
  isAggregate: boolean;
} {
  if (Array.isArray(offer)) {
    for (const item of offer) {
      const fields = readOfferFields(item);
      if (fields.price != null) return fields;
    }
    return { price: null, currency: null, availability: null, isAggregate: false };
  }
  if (!offer || typeof offer !== "object") {
    return { price: null, currency: null, availability: null, isAggregate: false };
  }
  const record = offer as Record<string, unknown>;
  if (isNonProductOffer(record)) {
    return { price: null, currency: null, availability: null, isAggregate: false };
  }
  const isAggregate = typeMatches(record["@type"], /aggregateoffer/i);
  const isOffer =
    typeMatches(record["@type"], /offer/i) ||
    record.price != null ||
    record.lowPrice != null;

  if (!isOffer && !isAggregate) {
    return { price: null, currency: null, availability: null, isAggregate: false };
  }

  // Prefer sale/current-like fields before list/high.
  const candidates = isAggregate
    ? [record.lowPrice, record.price, record.highPrice]
    : [record.price, record.lowPrice];

  let price: number | null = null;
  for (const candidate of candidates) {
    if (typeof candidate === "number" && candidate > 0) {
      price = candidate;
      break;
    }
    if (typeof candidate === "string") {
      const parsed = parsePriceNumber(candidate);
      if (parsed != null) {
        price = parsed;
        break;
      }
    }
  }

  const currency = normalizeCurrency(
    typeof record.priceCurrency === "string"
      ? record.priceCurrency
      : typeof record.currency === "string"
        ? record.currency
        : null
  );

  const availability =
    typeof record.availability === "string"
      ? record.availability.split("/").pop()?.trim() ?? record.availability
      : null;

  return { price, currency, availability, isAggregate };
}

function readJsonLdImage(value: unknown, baseUrl: string): string | null {
  if (typeof value === "string") return resolveAbsoluteHttpsUrl(value, baseUrl);
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readJsonLdImage(item, baseUrl);
      if (parsed) return parsed;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const url = (value as Record<string, unknown>).url;
    if (typeof url === "string") return resolveAbsoluteHttpsUrl(url, baseUrl);
  }
  return null;
}

function scoreProductNode(
  node: Record<string, unknown>,
  pageUrl: string,
  extras?: { canonicalUrl?: string | null; pageTitle?: string | null }
): number {
  const name = typeof node.name === "string" ? node.name.toLowerCase() : "";
  let score = 0;
  if (name) score += 10;
  if (node.offers) score += 8;
  if (node.sku || node.mpn || node.gtin || node.gtin13) score += 6;
  try {
    const page = new URL(pageUrl);
    const slug = decodeURIComponent(page.pathname).toLowerCase();
    for (const token of name.split(/\s+/).filter((t) => t.length >= 4)) {
      if (slug.includes(token)) score += 5;
    }
    const sku = typeof node.sku === "string" ? node.sku.toLowerCase() : "";
    if (sku && (slug.includes(sku) || pageUrl.toLowerCase().includes(sku))) score += 15;
    const pageTitle = extras?.pageTitle?.toLowerCase() ?? "";
    if (pageTitle && name) {
      const tokens = name.split(/\s+/).filter((t) => t.length >= 4);
      const hits = tokens.filter((token) => pageTitle.includes(token)).length;
      if (hits >= 2 || (tokens.length > 0 && hits === tokens.length)) score += 15;
      else if (hits === 1) score += 4;
    }
    const urlField =
      typeof node.url === "string"
        ? node.url
        : typeof (node as { "@id"?: string })["@id"] === "string"
          ? (node as { "@id": string })["@id"]
          : null;
    const compareUrls = [pageUrl, extras?.canonicalUrl].filter(Boolean) as string[];
    if (urlField) {
      try {
        const productUrl = new URL(urlField, pageUrl);
        let hostMatch = false;
        let pathMatch = false;
        for (const compare of compareUrls) {
          const base = new URL(compare);
          if (
            productUrl.hostname.replace(/^www\./i, "") !==
            base.hostname.replace(/^www\./i, "")
          ) {
            continue;
          }
          hostMatch = true;
          if (productUrl.pathname.replace(/\/+$/, "") === base.pathname.replace(/\/+$/, "")) {
            pathMatch = true;
          }
        }
        if (pathMatch) score += 32;
        else if (hostMatch) score += 12;
        else score -= 30;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return score;
}

function additionalPropertySpecs(node: Record<string, unknown>): MerchantSpecFact[] {
  const props = node.additionalProperty;
  if (!props) return [];
  const list = Array.isArray(props) ? props : [props];
  const out: MerchantSpecFact[] = [];
  for (const prop of list) {
    if (!prop || typeof prop !== "object") continue;
    const record = prop as Record<string, unknown>;
    const label = typeof record.name === "string" ? record.name.trim() : "";
    const value =
      typeof record.value === "string" || typeof record.value === "number"
        ? String(record.value).trim()
        : "";
    if (!label || !value) continue;
    const mapped = mapLabelValueToSpec(label, value, "merchant_json_ld", "json_ld");
    if (mapped) out.push(mapped);
  }
  return out;
}

function appendUnitFromLabel(label: string, value: string): string {
  if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) return value;
  const key = normalizeLabelKey(label);
  if (/\(\s*v\s*mm\s*\)|(?:^|[^a-z0-9])mm(?:[^a-z0-9]|$)/i.test(key) && !/\bcm\b/i.test(key)) {
    return `${value.trim()} mm`;
  }
  if (/\(\s*v\s*cm\s*\)|(?:^|[^a-z0-9])cm(?:[^a-z0-9]|$)/i.test(key)) {
    return `${value.trim()} cm`;
  }
  if (/\(\s*v\s*m\s*\)|(?:^|[^a-z0-9])(?:v\s+m)(?:[^a-z0-9]|$)/i.test(key)) {
    return `${value.trim()} m`;
  }
  return value;
}

function defaultSpecSourcePath(origin: MerchantSpecOrigin, label: string): string {
  if (origin === "json_ld") return `Product.additionalProperty.${label}`;
  if (origin === "meta") return `meta.${label}`;
  if (origin === "product_spec_table") return `table > ${label}`;
  if (origin === "product_attribute") return `product_attribute.${label}`;
  return `product_text > ${label}`;
}

function withSpecProvenance(
  spec: MerchantSpecFact,
  provenance?: { sourcePath?: string; extractionMethod?: EvidenceExtractionMethod }
): MerchantSpecFact {
  const sourcePath = safeSourcePath(
    provenance?.sourcePath ?? spec.sourcePath ?? defaultSpecSourcePath(spec.origin ?? "product_text", spec.label)
  );
  const extractionMethod =
    provenance?.extractionMethod ??
    spec.extractionMethod ??
    extractionMethodFromSpecOrigin(spec.origin);
  return {
    ...spec,
    extractionMethod,
    sourcePath,
    evidenceExcerpt: sanitizeEvidenceExcerpt(spec.text),
    normalizedValue:
      spec.field === "dimension" ? normalizeDimensionToCm(spec.value) : spec.normalizedValue ?? null,
  };
}

function mapLabelValueToSpec(
  label: string,
  value: string,
  kind: EvidenceKind,
  origin: MerchantSpecOrigin = "product_text",
  provenance?: { sourcePath?: string; extractionMethod?: EvidenceExtractionMethod }
): MerchantSpecFact | null {
  const cleanLabel = decodeHtmlEntities(label.replace(/[:：]\s*$/, "").trim());
  let cleanValue = decodeHtmlEntities(value.trim());
  cleanValue = appendUnitFromLabel(cleanLabel, cleanValue);
  if (!cleanLabel || !cleanValue) return null;
  if (cleanValue.length > 120) return null;
  if (isWeightLabel(cleanLabel)) return null;
  if (isPackageOrShippingLabel(cleanLabel) && /\d/.test(cleanValue)) return null;
  // CSS / layout / navigation noise
  if (/^\d+(?:[.,]\d+)?\s*%/.test(cleanValue)) return null;
  if (/!important|calc\(|px\b|rgba?\(|[;{}]|opacity\s*:|display\s*:|height\s*:/i.test(cleanValue)) {
    return null;
  }
  if (/[<>]|class=|href=|title=|flyout|javascript:/i.test(cleanValue)) return null;
  if (/\/["']|\.html?\b/i.test(cleanValue)) return null;
  if (
    /^(?:0|auto|none|inherit|hidden|block|flex)$/i.test(cleanValue) &&
    (WIDTH_TOKEN.test(normalizeLabelKey(cleanLabel)) || HEIGHT_TOKEN.test(normalizeLabelKey(cleanLabel)))
  ) {
    return null;
  }
  if (NON_PRODUCT_WIDTH_TOKEN.test(normalizeLabelKey(cleanLabel))) return null;

  let field: EvidenceField = "other";
  const labelKey = normalizeLabelKey(cleanLabel);
  const isProductDimContext =
    PRODUCT_DIM_TOKEN.test(labelKey) || !PACKAGE_TOKEN.test(labelKey);

  if (
    isProductDimContext &&
    (WIDTH_TOKEN.test(labelKey) ||
      HEIGHT_TOKEN.test(labelKey) ||
      DEPTH_TOKEN.test(labelKey) ||
      DIAMETER_TOKEN.test(labelKey) ||
      THICKNESS_TOKEN.test(labelKey))
  ) {
    field = "dimension";
  } else if (MATERIAL_TOKEN.test(labelKey)) {
    field = "material";
  } else if (COLOR_TOKEN.test(labelKey) || FINISH_TOKEN.test(labelKey)) {
    field = "color";
  } else if (BRAND_TOKEN.test(labelKey)) {
    field = "brand";
  } else if (/^(?:size|dimenz(?:ije)?|mere|dimensions?)$/i.test(labelKey)) {
    field = "dimension";
  } else if (/\d+(?:[.,]\d+)?\s*(?:cm|mm|m)\b/i.test(cleanValue) && /dimenz|mere|size/i.test(labelKey)) {
    field = "dimension";
  } else {
    return null;
  }

  if (field === "color" && MATERIAL_TOKEN.test(labelKey) && !COLOR_TOKEN.test(labelKey)) {
    field = "material";
  }

  const text = `${cleanLabel}: ${cleanValue}`;
  const unitMatch = cleanValue.match(/\b(mm|cm|m)\b/i);
  return withSpecProvenance(
    {
      field,
      label: cleanLabel,
      value: cleanValue,
      kind,
      text,
      unit: field === "dimension" ? unitMatch?.[1]?.toLowerCase() ?? null : null,
      confidence: "high",
      verifiedAt: new Date().toISOString(),
      origin,
    },
    provenance
  );
}

/**
 * Split combined color/finish values into separate facts when safely labeled.
 * Example: label "Color" value "matte black" → color black + finish matte.
 */
export function expandColorFinishSpecs(spec: MerchantSpecFact): MerchantSpecFact[] {
  if (spec.field !== "color") return [spec];
  const value = spec.value.toLowerCase();
  const finishWords = value.match(/\b(matte|matt|mat|gloss(?:y)?|satin|brushed|polished|rough|smooth)\b/i);
  const colorWords = value.match(
    /\b(black|white|chrome|krom|crn[ae]?|bel[ae]?|gold|silver|grey|gray|anthracite|antracit)\b/i
  );
  if (!finishWords && !colorWords) return [spec];
  if (FINISH_TOKEN.test(spec.label) && !COLOR_TOKEN.test(spec.label) && finishWords && !colorWords) {
    return [spec];
  }
  if (COLOR_TOKEN.test(spec.label) && colorWords && finishWords) {
    return [
      {
        ...spec,
        label: spec.label,
        value: colorWords[0]!,
        text: `${spec.label}: ${colorWords[0]}`,
      },
      {
        ...spec,
        label: "Finish",
        value: finishWords[0]!,
        text: `Finish: ${finishWords[0]}`,
      },
    ];
  }
  return [spec];
}

function extractVisibleText(html: string): string {
  const scoped = selectProductLocalHtml(html).html;
  const text = stripTags(scoped).replace(/\s+/g, " ").trim();
  return text.slice(0, MAX_PRODUCT_TEXT_CHARS);
}

/** Generic label/value pairs from tables, dl/dt/dd, data-th, and structured rows. */
export function extractLabeledHtmlSpecs(html: string): MerchantSpecFact[] {
  const scoped = selectProductLocalHtml(html);
  const cleaned = scoped.html;
  const specs: MerchantSpecFact[] = [];
  const push = (
    label: string,
    value: string,
    kind: EvidenceKind = "merchant_page",
    origin: MerchantSpecOrigin = "product_spec_table",
    provenance?: { sourcePath?: string; extractionMethod?: EvidenceExtractionMethod }
  ) => {
    const mapped = mapLabelValueToSpec(label, value, kind, origin, provenance);
    if (!mapped) return;
    for (const expanded of expandColorFinishSpecs(mapped)) {
      specs.push(
        withSpecProvenance(expanded, {
          sourcePath: provenance?.sourcePath ?? expanded.sourcePath ?? mapped.sourcePath ?? undefined,
          extractionMethod: provenance?.extractionMethod ?? expanded.extractionMethod,
        })
      );
    }
  };

  // <tr><th>Širina</th><td>600 mm</td></tr> and td/td variants
  const rowPattern =
    /<tr[^>]*>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(cleaned)) !== null && specs.length < MAX_SPECS) {
    const label = stripTags(match[1]!);
    push(label, stripTags(match[2]!), "merchant_page", "product_spec_table", {
      sourcePath: `table > ${label}`,
      extractionMethod: "spec_table",
    });
  }

  // Magento data-th="MATERIAL">KOVINA
  const dataThPattern = /<(?:td|th|span|div)[^>]*data-th=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:td|th|span|div)>/gi;
  while ((match = dataThPattern.exec(cleaned)) !== null && specs.length < MAX_SPECS) {
    const label = stripTags(match[1]!);
    push(label, stripTags(match[2]!), "merchant_page", "product_attribute", {
      sourcePath: `[data-th="${label}"]`,
      extractionMethod: "data_attribute",
    });
  }

  // <dl><dt>Material</dt><dd>Keramika</dd>
  const dlPattern = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  while ((match = dlPattern.exec(cleaned)) !== null && specs.length < MAX_SPECS) {
    const label = stripTags(match[1]!);
    push(label, stripTags(match[2]!), "merchant_page", "product_spec_table", {
      sourcePath: `dl > ${label}`,
      extractionMethod: "definition_list",
    });
  }

  // Product-local labeled pairs only (not nav/filter lists).
  const strongPattern =
    /<(?:strong|b|span)[^>]*>\s*([^<]{2,60}?)\s*:?\s*<\/(?:strong|b|span)>\s*([^<]{1,80})/gi;
  while ((match = strongPattern.exec(cleaned)) !== null && specs.length < MAX_SPECS) {
    const label = stripTags(match[1]!);
    const value = stripTags(match[2]!);
    if (
      MATERIAL_TOKEN.test(normalizeLabelKey(label)) ||
      COLOR_TOKEN.test(normalizeLabelKey(label)) ||
      FINISH_TOKEN.test(normalizeLabelKey(label)) ||
      WIDTH_TOKEN.test(normalizeLabelKey(label)) ||
      HEIGHT_TOKEN.test(normalizeLabelKey(label)) ||
      DEPTH_TOKEN.test(normalizeLabelKey(label))
    ) {
      push(label, value, "merchant_page", "product_text", {
        sourcePath: `product_text > ${label}`,
        extractionMethod: "product_text",
      });
    }
  }

  const inlinePattern =
    /(?:^|[^A-Za-z0-9])((?:Širina|Sirina|Width|Breite|Largeur|Larghezza|Višina|Visina|Height|Globina|Depth|Dolžina|Dolzina|Length|Premer|Diameter|Debelina|Thickness|Material|Materiali|Materijal|Barva|Colour|Color|Površina|Povrsina|Finish|Obdelava)(?:\s+(?:izdelka|product|paketa|package))?(?:\s*\([^)]{0,40}\))?)\s*[:\-–]\s*([^<\n|]{1,80})/gi;
  while ((match = inlinePattern.exec(cleaned)) !== null && specs.length < MAX_SPECS) {
    const label = stripTags(match[1]!);
    push(label, stripTags(match[2]!), "merchant_page", "product_text", {
      sourcePath: `product_text > ${label}`,
      extractionMethod: "product_text",
    });
  }

  const seen = new Set<string>();
  return specs.filter((s) => {
    const key = `${s.field}|${s.label.toLowerCase()}|${s.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Safely extract labeled specs from embedded JSON product attributes (no JS exec).
 */
export function extractEmbeddedProductSpecs(html: string): MerchantSpecFact[] {
  const specs: MerchantSpecFact[] = [];
  const jsonBlocks: unknown[] = [];
  const patterns = [
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1]?.trim();
      if (!raw || raw.length > 400_000) continue;
      try {
        jsonBlocks.push(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
  }

  let nodes = 0;
  const walk = (value: unknown, depth: number) => {
    if (depth > 8 || nodes > 2_000 || specs.length >= MAX_SPECS) return;
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 80)) walk(item, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    nodes += 1;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    // attribute objects: { name/code/label, value }
    const label =
      (typeof record.name === "string" && record.name) ||
      (typeof record.label === "string" && record.label) ||
      (typeof record.code === "string" && record.code) ||
      null;
    const rawValue = record.value ?? record.option_label ?? record.text;
    if (label && (typeof rawValue === "string" || typeof rawValue === "number")) {
      // Skip recommendation / related nests
      const pathHint = keys.join(" ");
      if (!/\b(related|recommend|upsell|crosssell)\b/i.test(pathHint)) {
        const mapped = mapLabelValueToSpec(label, String(rawValue), "merchant_page", "product_attribute");
        if (mapped) {
          for (const expanded of expandColorFinishSpecs(mapped)) specs.push(expanded);
        }
      }
    }
    // Magento custom_attributes: [{attribute_code, value}]
    if (Array.isArray(record.custom_attributes)) {
      for (const attr of record.custom_attributes.slice(0, 40)) {
        if (!attr || typeof attr !== "object") continue;
        const a = attr as Record<string, unknown>;
        if (typeof a.attribute_code === "string" && a.value != null) {
          const mapped = mapLabelValueToSpec(
            a.attribute_code.replace(/_/g, " "),
            String(a.value),
            "merchant_page",
            "product_attribute"
          );
          if (mapped) specs.push(mapped);
        }
      }
    }
    for (const [key, nested] of Object.entries(record).slice(0, 40)) {
      if (RELATED_KEY_RE.test(key)) continue;
      if (nested && typeof nested === "object") walk(nested, depth + 1);
    }
  };
  for (const block of jsonBlocks.slice(0, 12)) walk(block, 0);

  const seen = new Set<string>();
  return specs.filter((s) => {
    const key = `${s.field}|${s.label.toLowerCase()}|${s.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractJsonLdPrices(
  offer: unknown,
  isAggregateHint: boolean
): PurchasePriceCandidate[] {
  const out: PurchasePriceCandidate[] = [];
  const list = Array.isArray(offer) ? offer : offer ? [offer] : [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") continue;
    const fields = readOfferFields(item);
    if (fields.price == null) continue;
    const record = item as Record<string, unknown>;
    const offerTypes = Array.isArray(record["@type"])
      ? record["@type"].map(String)
      : record["@type"]
        ? [String(record["@type"])]
        : [];
    const isAgg =
      isAggregateHint || offerTypes.some((t) => /aggregateoffer/i.test(t));
    if (isNonProductOffer(record)) continue;
    const offerKey = Array.isArray(offer) ? `offers[${i}]` : "offers";
    const priceKey = isAgg ? "price" : "price";
    out.push({
      amount: fields.price,
      currency: fields.currency,
      kind: "current",
      source: "json_ld",
      productAssociation: "json_ld_product_offer",
      sourcePath: `Product.${offerKey}.${priceKey}`,
      rawLabel: isAgg ? "AggregateOffer" : "Offer",
      extractionMethod: "json_ld",
      evidenceExcerpt: sanitizeEvidenceExcerpt(
        `"price":"${fields.price}","priceCurrency":"${fields.currency ?? ""}"`
      ),
    });
  }
  return out;
}

/**
 * Legacy wrapper — prefer extractEmbeddedStatePrices + selectVerifiedPurchasePrice.
 */
export function extractEmbeddedProductPrice(html: string): {
  price: number;
  currency: string | null;
  provenance: "embedded";
} | null {
  const candidates = extractEmbeddedStatePrices({ html, pageUrl: "https://example.invalid/p" });
  const selected = selectVerifiedPurchasePrice(candidates, { requireCurrency: false });
  if (!selected.verified) return null;
  return {
    price: selected.verified.amount,
    currency: selected.verified.currency,
    provenance: "embedded",
  };
}

function parseJsonLdProductBundle(
  html: string,
  pageUrl: string,
  extras?: { canonicalUrl?: string | null; pageTitle?: string | null }
): {
  found: boolean;
  productName: string | null;
  nameSourcePath: string | null;
  brand: string | null;
  prices: PurchasePriceCandidate[];
  imageUrl: string | null;
  availability: string | null;
  sku: string | null;
  mpn: string | null;
  material: string | null;
  color: string | null;
  size: string | null;
  specs: MerchantSpecFact[];
} {
  const empty = {
    found: false,
    productName: null,
    nameSourcePath: null,
    brand: null,
    prices: [] as PurchasePriceCandidate[],
    imageUrl: null,
    availability: null,
    sku: null,
    mpn: null,
    material: null,
    color: null,
    size: null,
    specs: [] as MerchantSpecFact[],
  };
  const nodes: Record<string, unknown>[] = [];
  for (const block of parseJsonLdBlocks(html)) collectJsonLdNodes(block, nodes);

  const products: Array<{ node: Record<string, unknown>; score: number }> = [];
  for (const node of nodes) {
    if (!isProductType(node["@type"])) continue;
    products.push({
      node,
      score: scoreProductNode(node, pageUrl, extras),
    });
  }
  products.sort((a, b) => b.score - a.score);
  const bestEntry = products[0];
  const second = products[1];
  const bestHasIdentity =
    bestEntry != null &&
    (bestEntry.score >= 30 ||
      (typeof bestEntry.node.url === "string" &&
        extras?.canonicalUrl != null &&
        bestEntry.node.url.replace(/\/+$/, "") === extras.canonicalUrl.replace(/\/+$/, "")));
  if (
    bestEntry &&
    second &&
    bestEntry.score - second.score < 8 &&
    !bestHasIdentity
  ) {
    return { ...empty, found: true };
  }
  const best = bestEntry?.node ?? null;
  const bestScore = bestEntry?.score ?? -1;
  if (!best || bestScore < 0) return empty;

  const offers = best.offers;
  const offerFields = readOfferFields(offers);
  const prices = extractJsonLdPrices(offers, offerFields.isAggregate);

  const image = readJsonLdImage(best.image, pageUrl);
  const specs = additionalPropertySpecs(best);
  const material = readStringOrName(best.material);
  const color = readStringOrName(best.color);
  const size = readStringOrName(best.size);
  if (material) {
    specs.push(
      withSpecProvenance({
        field: "material",
        label: "Material",
        value: material,
        kind: "merchant_json_ld",
        text: `Material: ${material}`,
        origin: "json_ld",
      }, { sourcePath: "Product.material", extractionMethod: "json_ld" })
    );
  }
  if (color) {
    specs.push(
      withSpecProvenance({
        field: "color",
        label: "Color",
        value: color,
        kind: "merchant_json_ld",
        text: `Color: ${color}`,
        origin: "json_ld",
      }, { sourcePath: "Product.color", extractionMethod: "json_ld" })
    );
  }
  if (size && !UNLABELED_PAIR_DIM_RE.test(size)) {
    specs.push(
      withSpecProvenance({
        field: "dimension",
        label: "Size",
        value: size,
        kind: "merchant_json_ld",
        text: `Size: ${size}`,
        origin: "json_ld",
      }, { sourcePath: "Product.size", extractionMethod: "json_ld" })
    );
  }

  const productName = typeof best.name === "string" ? best.name.trim() : null;
  return {
    found: true,
    productName,
    nameSourcePath: productName ? "Product.name" : null,
    brand: readBrand(best.brand),
    prices,
    imageUrl: isUsableProductImageUrl(image) ? image : null,
    availability: offerFields.availability,
    sku: typeof best.sku === "string" ? best.sku.trim() : null,
    mpn: typeof best.mpn === "string" ? best.mpn.trim() : null,
    material,
    color,
    size,
    specs,
  };
}

export type AcquireMerchantEvidenceOptions = {
  /** Extra price candidates from same-origin product JSON follow-up. */
  extraPriceCandidates?: PurchasePriceCandidate[];
  sameOriginFollowUpAttempted?: boolean;
  sameOriginFollowUpHit?: boolean;
};

/**
 * Parse merchant HTML into structured evidence channels.
 */
export function acquireMerchantEvidenceFromHtml(
  html: string,
  pageUrl: string,
  options: AcquireMerchantEvidenceOptions = {}
): MerchantEvidenceFromHtml {
  const methods: string[] = [];
  const pageTitle = parseHtmlTitle(html);
  const metaDescription =
    parseMetaContent(html, "name", "description") ??
    parseMetaContent(html, "property", "og:description");
  const ogTitle = parseMetaContent(html, "property", "og:title");
  const ogUrl = parseMetaContent(html, "property", "og:url");
  const canonicalRaw = parseLinkCanonical(html) ?? ogUrl;
  let canonicalUrl: string | null = null;
  if (canonicalRaw) {
    try {
      const resolved = new URL(canonicalRaw, pageUrl);
      const page = new URL(pageUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        if (resolved.hostname.replace(/^www\./i, "") === page.hostname.replace(/^www\./i, "")) {
          canonicalUrl = resolved.toString();
        }
      }
    } catch {
      canonicalUrl = null;
    }
  }

  const jsonLd = parseJsonLdProductBundle(html, pageUrl, {
    canonicalUrl,
    pageTitle: pageTitle ?? ogTitle,
  });
  if (jsonLd.found) methods.push("json_ld");

  const ogImage = parseMetaContent(html, "property", "og:image");
  const metaPriceAmount = parseMetaContent(html, "property", "product:price:amount");
  const metaSaleAmount =
    parseMetaContent(html, "property", "product:sale_price:amount") ||
    parseMetaContent(html, "property", "og:sale_price:amount");

  const productHtml = selectProductLocalHtml(html).html;
  const metaPrices = extractMetaPrices(html);
  const microPrices = extractMicrodataPrices(productHtml);
  const htmlPrices = extractHtmlProductPrices(productHtml);
  const labeledPrices = extractLabeledHtmlPrices(productHtml);
  const embeddedPrices = extractEmbeddedStatePrices({ html, pageUrl, pageSku: jsonLd.sku });

  const priceCandidates: PurchasePriceCandidate[] = [
    ...jsonLd.prices,
    ...metaPrices,
    ...microPrices,
    ...htmlPrices,
    ...labeledPrices,
    ...embeddedPrices,
    ...(options.extraPriceCandidates ?? []),
  ];

  if (jsonLd.prices.length) methods.push("json_ld_price");
  if (metaPrices.length) methods.push("meta");
  if (metaSaleAmount) methods.push("meta_sale");
  if (microPrices.length) methods.push("microdata");
  if (htmlPrices.length || labeledPrices.length) methods.push("html_product_price");
  if (embeddedPrices.length) methods.push("embedded");
  if ((options.extraPriceCandidates?.length ?? 0) > 0) methods.push("same_origin_product_data");

  const embeddedHit = embeddedPrices.length > 0;

  const htmlSpecs = extractLabeledHtmlSpecs(html);
  const embeddedSpecs = extractEmbeddedProductSpecs(html);
  if (htmlSpecs.length > 0) methods.push("html_specs");
  if (embeddedSpecs.length > 0) methods.push("embedded_specs");

  const allSpecs = [...jsonLd.specs, ...htmlSpecs, ...embeddedSpecs];
  const seenSpec = new Set<string>();
  const labeledSpecs = allSpecs.filter((s) => {
    const key = `${s.field}|${s.text.toLowerCase()}`;
    if (seenSpec.has(key)) return false;
    seenSpec.add(key);
    return true;
  });

  const selectedVariantId = (() => {
    const m =
      html.match(/data-selected-variant(?:-id)?=["']([^"']+)["']/i) ||
      html.match(/"selectedVariantId"\s*:\s*"?([^",}\s]+)"?/i);
    return m?.[1] ?? null;
  })();

  const selected = selectVerifiedPurchasePrice(priceCandidates, {
    requireCurrency: true,
    pageSku: jsonLd.sku,
    selectedVariantId,
  });
  let failureReason = selected.failureReason;
  if (!selected.verified && selected.failureReason === "PRICE_NONE_NO_PRICE_TOKEN") {
    failureReason = inferJsOnlyPriceFailure(html, priceCandidates.length > 0);
  }

  const productName = jsonLd.productName ?? ogTitle ?? pageTitle;
  const productNameSourcePath = jsonLd.productName
    ? jsonLd.nameSourcePath ?? "Product.name"
    : ogTitle
      ? 'meta[property="og:title"]'
      : pageTitle
        ? "html.title"
        : undefined;
  const image =
    jsonLd.imageUrl ??
    (isUsableProductImageUrl(resolveAbsoluteHttpsUrl(ogImage, pageUrl))
      ? resolveAbsoluteHttpsUrl(ogImage, pageUrl)
      : null);

  const labeledBlock = labeledSpecs.map((s) => s.text).join("\n");
  const visible = extractVisibleText(html);
  const rawProductText = [labeledBlock, visible].filter(Boolean).join("\n").slice(0, MAX_PRODUCT_TEXT_CHARS);

  const hasCore =
    Boolean(productName) ||
    selected.verified != null ||
    labeledSpecs.length > 0 ||
    Boolean(jsonLd.found);

  const extractionSources = {
    jsonLd: jsonLd.found,
    meta: Boolean(ogTitle || metaPriceAmount || metaSaleAmount || metaDescription),
    html: htmlSpecs.length > 0 || Boolean(visible),
    embeddedStructuredData: embeddedHit,
  };

  const sameOriginUrls = discoverSameOriginProductDataUrls(html, pageUrl);

  const provenance =
    selected.verified?.source === "meta" && metaSaleAmount
      ? "meta_sale"
      : selected.verified?.source ?? null;

  const materialsFound = labeledSpecs.filter((s) => s.field === "material").length;
  const colorsFound = labeledSpecs.filter((s) => s.field === "color").length;
  const labeledDimensionsFound = labeledSpecs.filter((s) => s.field === "dimension").length;

  const diagnostics: MerchantEvidenceDiagnostics = {
    status: hasCore ? "success" : "partial",
    httpStatus: null,
    jsonLdProductFound: jsonLd.found,
    canonicalFound: Boolean(canonicalUrl),
    canonicalUrl,
    productNameFound: Boolean(productName),
    productName: {
      found: Boolean(productName),
      sourcePath: productNameSourcePath,
    },
    priceFound: selected.verified != null,
    price: selected.verified
      ? {
          found: true,
          amount: selected.verified.amount,
          currency: selected.verified.currency,
          extractionMethod: selected.verified.extractionMethod,
          sourcePath: selected.verified.sourcePath ?? null,
          excerpt: selected.verified.evidenceExcerpt ?? null,
          evidenceKind: selected.verified.source,
        }
      : { found: false },
    materialFound: materialsFound > 0,
    colorFound: colorsFound > 0,
    materialsFound,
    colorsFound,
    labeledDimensionsFound,
    extractionMethods: [...new Set(methods)],
    priceFailureReason: selected.verified ? null : failureReason,
    priceSource: selected.verified?.source ?? null,
    priceKind: selected.verified?.kind ?? null,
    priceCandidatesConsidered: selected.candidatesConsidered,
    sameOriginFollowUpAttempted: options.sameOriginFollowUpAttempted ?? false,
    sameOriginFollowUpHit: options.sameOriginFollowUpHit ?? false,
  };

  return {
    status: hasCore ? "success" : "partial",
    canonicalUrl,
    pageTitle,
    metaDescription,
    productName,
    brand: jsonLd.brand,
    price: selected.verified?.amount ?? null,
    currency: selected.verified?.currency ?? null,
    priceProvenance: provenance,
    verifiedPrice: selected.verified,
    priceFailureReason: selected.verified ? null : failureReason,
    sameOriginProductDataUrls: sameOriginUrls,
    imageUrl: image,
    availability: jsonLd.availability,
    sku: jsonLd.sku,
    mpn: jsonLd.mpn,
    rawProductText,
    labeledSpecs,
    jsonLdProductFound: jsonLd.found,
    extractionSources,
    diagnostics,
  };
}
