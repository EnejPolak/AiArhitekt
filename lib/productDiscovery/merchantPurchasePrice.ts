/**
 * Deterministic merchant purchase-price recovery.
 * Never executes JS. Never guesses. Uncertain → no verified price.
 */
import {
  extractionMethodFromPriceSource,
  sanitizeEvidenceExcerpt,
  safeSourcePath,
  type EvidenceExtractionMethod,
} from "./evidenceProvenance";

export type { EvidenceExtractionMethod };
export type MerchantPriceKind =
  | "current"
  | "sale"
  | "regular"
  | "old"
  | "compare_at"
  | "msrp"
  | "installment"
  | "unknown";

export type MerchantPriceSource =
  | "json_ld"
  | "meta"
  | "microdata"
  | "embedded_state"
  | "html_product_price"
  | "same_origin_product_data";

export type PriceFailureReason =
  | "PRICE_NONE_NO_PRICE_TOKEN"
  | "PRICE_NONE_JS_RENDERED"
  | "PRICE_NONE_MULTIPLE_AMBIGUOUS"
  | "PRICE_NONE_VARIANT_UNRESOLVED"
  | "PRICE_NONE_PRODUCT_ASSOCIATION_UNSAFE"
  | "PRICE_NONE_CURRENCY_MISSING"
  | "PRICE_NONE_ONLY_OLD_OR_MSRP"
  | "PRICE_NONE_INSTALLMENT_ONLY"
  | "PRICE_NONE_FETCH_BLOCKED"
  | "PRICE_NONE_PARSE_FAILURE";

export type VerifiedMerchantPrice = {
  amount: number;
  currency: string | null;
  kind: MerchantPriceKind;
  source: MerchantPriceSource;
  confidence: "verified";
  productAssociation: string;
  rawLabel?: string;
  sourcePath?: string | null;
  extractionMethod?: EvidenceExtractionMethod;
  evidenceExcerpt?: string | null;
};

export type MerchantPriceCandidate = {
  amount: number;
  currency: string | null;
  kind: MerchantPriceKind;
  source: MerchantPriceSource;
  productAssociation: string;
  rawLabel?: string;
  sourcePath?: string | null;
  extractionMethod?: EvidenceExtractionMethod;
  evidenceExcerpt?: string | null;
  sku?: string | null;
  variantId?: string | null;
};

const MAX_SCRIPT_CHARS = 400_000;
const MAX_WALK_NODES = 2_500;
const MAX_EMBEDDED_PRICES = 40;
const MAX_DEPTH = 10;

const INSTALLMENT_RE =
  /\b(installment|instalment|mese[cč]no|monthly|obrok|financ|per\s*month|\/mo|ratno|kredit)\b/i;
const OLD_PRICE_RE =
  /\b(old[-_ ]?price|was[-_ ]?price|regular[-_ ]?price|list[-_ ]?price|compare[-_ ]?at|msrp|rrp|uvp|strikethrough|pre[cč]j|prej|crossed|from[-_ ]?price|original[-_ ]?price)\b/i;
const SALE_PRICE_RE =
  /\b(sale[-_ ]?price|sales[-_ ]?price|special[-_ ]?price|final[-_ ]?price|current[-_ ]?price|now[-_ ]?price|akcijsk|zni[zž]an)\b/i;
const CURRENT_PRICE_RE =
  /\b(price[-_ ]?current|current[-_ ]?price|final[-_ ]?price|product[-_ ]?price|data[-_ ]?price|price[-_ ]?amount|pricebox)\b/i;
const SHIPPING_RE = /\b(shipping|dostava|postage|delivery[-_ ]?cost)\b/i;

export function normalizeCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (t === "€" || t === "eur" || t === "euro" || t === "euros") return "EUR";
  if (/^[a-z]{3}$/i.test(raw.trim())) return raw.trim().toUpperCase();
  return null;
}

export function looksLikeDimensionNotPrice(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/(?:€|eur\b|usd\b|gbp\b|\bprice\b|\bcena\b)/i.test(t)) return false;
  if (/\d(?:[.,]\d+)?\s*(?:mm|cm|m)\b/i.test(t)) return true;
  if (/\d+(?:[.,]\d+)?\s*[x×]\s*\d+/i.test(t)) return true;
  return false;
}

export function parsePriceNumber(raw: unknown): number | null {
  if (typeof raw === "string" && looksLikeDimensionNotPrice(raw)) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0 || raw >= 100_000) return null;
    return Math.round(raw * 100) / 100;
  }
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  let normalized = cleaned;
  if (/,/.test(cleaned) && /\./.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/,/.test(cleaned)) {
    normalized = cleaned.replace(",", ".");
  }
  const match = normalized.match(/^(\d{1,6})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const num = Number.parseFloat(`${match[1]}.${match[2] ?? "00"}`);
  if (!Number.isFinite(num) || num <= 0 || num >= 100_000) return null;
  return num;
}

function parseMetaContent(
  html: string,
  attr: "property" | "name" | "itemprop",
  key: string
): string | null {
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

function contextAround(html: string, needle: string, radius = 120): string {
  const idx = html.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return "";
  return html.slice(Math.max(0, idx - radius), idx + needle.length + radius);
}

function classifyKindFromContext(context: string, hint?: MerchantPriceKind): MerchantPriceKind {
  // Safety classifications always win over structural hints.
  if (INSTALLMENT_RE.test(context)) return "installment";
  if (OLD_PRICE_RE.test(context)) return "old";
  if (/\bmsrp|rrp|uvp\b/i.test(context)) return "msrp";
  if (/\bcompare[-_ ]?at\b/i.test(context)) return "compare_at";
  if (SALE_PRICE_RE.test(context)) return "sale";
  if (/\bregular[-_ ]?price\b/i.test(context)) return "regular";
  if (hint && hint !== "unknown") return hint;
  if (CURRENT_PRICE_RE.test(context)) return "current";
  return "unknown";
}

function isPurchasableKind(kind: MerchantPriceKind): boolean {
  return kind === "current" || kind === "sale";
}

function currencyFromContext(context: string, explicit: string | null): string | null {
  const fromExplicit = normalizeCurrency(explicit);
  if (fromExplicit) return fromExplicit;
  if (/€|eur\b|euro/i.test(context)) return "EUR";
  return null;
}

function priceAuditFields(input: {
  source: MerchantPriceSource;
  sourcePath?: string | null;
  rawLabel?: string;
  amount: number;
  currency: string | null;
  extractionMethod?: EvidenceExtractionMethod;
  evidenceExcerpt?: string | null;
}): {
  sourcePath: string | null;
  extractionMethod: EvidenceExtractionMethod;
  evidenceExcerpt: string | null;
} {
  const sourcePath = safeSourcePath(input.sourcePath);
  const extractionMethod =
    input.extractionMethod ?? extractionMethodFromPriceSource(input.source, sourcePath);
  const evidenceExcerpt =
    input.evidenceExcerpt ??
    sanitizeEvidenceExcerpt(
      input.rawLabel
        ? `${input.rawLabel}: ${input.amount}${input.currency ? " " + input.currency : ""}`
        : `"price":"${input.amount}","priceCurrency":"${input.currency ?? ""}"`
    );
  return { sourcePath, extractionMethod, evidenceExcerpt };
}

/** Collect meta / OpenGraph / sale prices. */
export function extractMetaPrices(html: string): MerchantPriceCandidate[] {
  const out: MerchantPriceCandidate[] = [];
  const pageCurrency =
    normalizeCurrency(parseMetaContent(html, "property", "product:price:currency")) ||
    normalizeCurrency(parseMetaContent(html, "property", "og:price:currency")) ||
    normalizeCurrency(parseMetaContent(html, "itemprop", "priceCurrency"));

  const pairs: Array<{ amountKey: string; currencyKey: string; kind: MerchantPriceKind; path: string }> =
    [
      {
        amountKey: "product:sale_price:amount",
        currencyKey: "product:sale_price:currency",
        kind: "sale",
        path: 'meta[property="product:sale_price:amount"]',
      },
      {
        amountKey: "og:sale_price:amount",
        currencyKey: "og:sale_price:currency",
        kind: "sale",
        path: 'meta[property="og:sale_price:amount"]',
      },
      {
        amountKey: "product:price:amount",
        currencyKey: "product:price:currency",
        kind: "current",
        path: 'meta[property="product:price:amount"]',
      },
      {
        amountKey: "og:price:amount",
        currencyKey: "og:price:currency",
        kind: "current",
        path: 'meta[property="og:price:amount"]',
      },
    ];
  for (const pair of pairs) {
    const amount = parseMetaContent(html, "property", pair.amountKey);
    if (!amount) continue;
    const parsed = parsePriceNumber(amount);
    if (parsed == null) continue;
    const currency =
      normalizeCurrency(parseMetaContent(html, "property", pair.currencyKey)) || pageCurrency;
    const audit = priceAuditFields({
      source: "meta",
      sourcePath: pair.path,
      rawLabel: pair.amountKey,
      amount: parsed,
      currency,
      extractionMethod: "meta",
      evidenceExcerpt: sanitizeEvidenceExcerpt(
        `"${pair.amountKey}":"${amount}","${pair.currencyKey}":"${currency ?? ""}"`
      ),
    });
    out.push({
      amount: parsed,
      currency,
      kind: pair.kind,
      source: "meta",
      productAssociation: "page_meta",
      rawLabel: pair.amountKey,
      ...audit,
    });
  }
  return out;
}

/** Microdata itemprop price / lowPrice with local context checks. */
export function extractMicrodataPrices(html: string): MerchantPriceCandidate[] {
  const out: MerchantPriceCandidate[] = [];
  const patterns = [
    /itemprop=["'](price|lowPrice)["'][^>]*content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]*itemprop=["'](price|lowPrice)["']/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const prop = (match[1] === "price" || match[1] === "lowPrice" ? match[1] : match[2]) ?? "price";
      const raw = (match[1] === "price" || match[1] === "lowPrice" ? match[2] : match[1]) ?? "";
      const parsed = parsePriceNumber(raw);
      if (parsed == null) continue;
      const ctx = contextAround(html, match[0]!);
      if (SHIPPING_RE.test(ctx)) continue;
      const kind = classifyKindFromContext(ctx, prop === "lowPrice" ? "sale" : "current");
      if (kind === "installment") continue;
      const currency = currencyFromContext(
        ctx,
        parseMetaContent(html, "itemprop", "priceCurrency")
      );
      const audit = priceAuditFields({
        source: "microdata",
        sourcePath: `[itemprop="${prop}"]`,
        rawLabel: prop,
        amount: parsed,
        currency,
        extractionMethod: "itemprop",
        evidenceExcerpt: sanitizeEvidenceExcerpt(match[0]),
      });
      out.push({
        amount: parsed,
        currency,
        kind: kind === "unknown" ? "current" : kind,
        source: "microdata",
        productAssociation: "microdata_itemprop",
        rawLabel: prop,
        ...audit,
      });
    }
  }
  return out;
}

/**
 * Semantic HTML / data-attribute purchase prices near product containers.
 * Avoids whole-page € regex.
 */
export function extractHtmlProductPrices(html: string): MerchantPriceCandidate[] {
  const out: MerchantPriceCandidate[] = [];
  const attrPatterns: Array<{ re: RegExp; kind: MerchantPriceKind; path: string }> = [
    {
      re: /data-(?:final-)?price(?:-amount)?=["']([^"']+)["']/gi,
      kind: "current",
      path: "[data-price]",
    },
    {
      re: /data-product-price=["']([^"']+)["']/gi,
      kind: "current",
      path: "[data-product-price]",
    },
    {
      re: /data-sale-price=["']([^"']+)["']/gi,
      kind: "sale",
      path: "[data-sale-price]",
    },
    {
      re: /data-compare-at-price=["']([^"']+)["']/gi,
      kind: "compare_at",
      path: "[data-compare-at-price]",
    },
    {
      re: /data-regular-price=["']([^"']+)["']/gi,
      kind: "regular",
      path: "[data-regular-price]",
    },
  ];

  for (const { re, kind, path } of attrPatterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
      const parsed = parsePriceNumber(match[1]!);
      if (parsed == null) continue;
      if (looksLikeDimensionNotPrice(match[1]!)) continue;
      const el = match[0]!;
      const ctx = contextAround(html, el);
      // Installment/shipping must be on the element itself — nearby financing ads must not poison product price attrs.
      if (SHIPPING_RE.test(el) || INSTALLMENT_RE.test(el) || /data-shipping/i.test(el)) continue;
      if (/\b(related|recommended|recently[-_ ]viewed|cross[-_ ]sell|also[-_ ]bought|podobni)\b/i.test(ctx)) {
        continue;
      }
      const localKind =
        kind === "compare_at" || kind === "regular"
          ? kind
          : OLD_PRICE_RE.test(el)
            ? "old"
            : SALE_PRICE_RE.test(el)
              ? "sale"
              : kind;
      out.push({
        amount: parsed,
        currency: currencyFromContext(el + " " + ctx.slice(0, 80), null),
        kind: localKind,
        source: "html_product_price",
        productAssociation: "html_data_attr",
        rawLabel: path,
        ...priceAuditFields({
          source: "html_product_price",
          sourcePath: path,
          rawLabel: path,
          amount: parsed,
          currency: currencyFromContext(el + " " + ctx.slice(0, 80), null),
          extractionMethod: "data_attribute",
          evidenceExcerpt: sanitizeEvidenceExcerpt(el),
        }),
      });
    }
  }

  // Woo/Magento-ish current price nodes with content or inner text amount attributes
  const classPrice =
    /<(?:span|div|p|meta)[^>]*(?:class|itemprop)=["'][^"']*(?:price(?:-current|_now|box)|amount\s+price|sales-price|special-price)[^"']*["'][^>]*(?:content=["']([^"']+)["']|[^>]*>)\s*([^<]{0,40})/gi;
  let m: RegExpExecArray | null;
  while ((m = classPrice.exec(html)) !== null && out.length < 30) {
    const raw = (m[1] || m[2] || "").trim();
    if (looksLikeDimensionNotPrice(raw)) continue;
    const parsed = parsePriceNumber(raw);
    if (parsed == null) continue;
    const ctx = contextAround(html, m[0]!);
    if (OLD_PRICE_RE.test(ctx) && !SALE_PRICE_RE.test(ctx) && !CURRENT_PRICE_RE.test(ctx)) {
      const currency = currencyFromContext(ctx, null);
      out.push({
        amount: parsed,
        currency,
        kind: "old",
        source: "html_product_price",
        productAssociation: "html_class_price",
        rawLabel: "class_price_old",
        ...priceAuditFields({
          source: "html_product_price",
          sourcePath: "html.class_price_old",
          rawLabel: "class_price_old",
          amount: parsed,
          currency,
          extractionMethod: "data_attribute",
          evidenceExcerpt: sanitizeEvidenceExcerpt(m[0]!),
        }),
      });
      continue;
    }
    if (INSTALLMENT_RE.test(ctx) || SHIPPING_RE.test(ctx)) continue;
    if (/\b(related|recommended|recently|cross[-_ ]sell|podobni)\b/i.test(ctx)) continue;
    {
      const currency = currencyFromContext(ctx, null);
      out.push({
        amount: parsed,
        currency,
        kind: classifyKindFromContext(ctx, "current"),
        source: "html_product_price",
        productAssociation: "html_class_price",
        rawLabel: "class_price",
        ...priceAuditFields({
          source: "html_product_price",
          sourcePath: "html.class_price",
          rawLabel: "class_price",
          amount: parsed,
          currency,
          extractionMethod: "data_attribute",
          evidenceExcerpt: sanitizeEvidenceExcerpt(m[0]!),
        }),
      });
    }
  }

  return out;
}

const LABELED_PRICE_RE = /^(?:cena|price|preis|prodajna\s+cena|nakupna\s+cena|product\s+price)$/i;

function normalizePriceLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[:：]\s*$/, "")
    .trim();
}

/** Clearly labeled product-price rows (table / dl), not arbitrary body numbers. */
export function extractLabeledHtmlPrices(html: string): MerchantPriceCandidate[] {
  const out: MerchantPriceCandidate[] = [];
  const pairs: Array<{ label: string; value: string; pathPrefix: "table" | "dl" }> = [];
  const rowPattern =
    /<tr[^>]*>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    pairs.push({
      label: match[1]!.replace(/<[^>]+>/g, " ").trim(),
      value: match[2]!.replace(/<[^>]+>/g, " ").trim(),
      pathPrefix: "table",
    });
  }
  const dlPattern = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  while ((match = dlPattern.exec(html)) !== null) {
    pairs.push({
      label: match[1]!.replace(/<[^>]+>/g, " ").trim(),
      value: match[2]!.replace(/<[^>]+>/g, " ").trim(),
      pathPrefix: "dl",
    });
  }
  for (const pair of pairs) {
    const label = normalizePriceLabel(pair.label);
    if (!LABELED_PRICE_RE.test(label)) continue;
    if (SHIPPING_RE.test(pair.label) || INSTALLMENT_RE.test(pair.label + " " + pair.value)) continue;
    if (looksLikeDimensionNotPrice(pair.value)) continue;
    const parsed = parsePriceNumber(pair.value);
    if (parsed == null) continue;
    const currency = currencyFromContext(pair.value, null);
    const displayLabel = pair.label.replace(/\s+/g, " ").trim();
    const sourcePath = `${pair.pathPrefix} > ${displayLabel}`;
    const extractionMethod = pair.pathPrefix === "dl" ? "definition_list" : "spec_table";
    out.push({
      amount: parsed,
      currency,
      kind: "current",
      source: "html_product_price",
      productAssociation: "labeled_product_price",
      rawLabel: displayLabel,
      ...priceAuditFields({
        source: "html_product_price",
        sourcePath,
        rawLabel: displayLabel,
        amount: parsed,
        currency,
        extractionMethod,
        evidenceExcerpt: sanitizeEvidenceExcerpt(`${displayLabel}: ${pair.value}`),
      }),
    });
  }
  return out;
}

type WalkCtx = {
  pageUrl: string;
  pagePath: string;
  pageSku: string | null;
  selectedVariantId: string | null;
  nodes: number;
  prices: MerchantPriceCandidate[];
};

function scoreAssociation(
  record: Record<string, unknown>,
  ctx: WalkCtx,
  path: string
): { score: number; association: string; sku: string | null; variantId: string | null } {
  let score = 1;
  let association = "embedded_product_like";
  const sku =
    typeof record.sku === "string"
      ? record.sku
      : typeof record.SKU === "string"
        ? record.SKU
        : null;
  const variantId =
    record.variant_id != null
      ? String(record.variant_id)
      : record.variantId != null
        ? String(record.variantId)
        : record.id != null && /variant/i.test(path)
          ? String(record.id)
          : null;

  const url =
    typeof record.url === "string"
      ? record.url
      : typeof record.handle === "string"
        ? record.handle
        : null;

  try {
    if (url) {
      const resolved = new URL(url, ctx.pageUrl);
      if (resolved.pathname.replace(/\/+$/, "") === ctx.pagePath.replace(/\/+$/, "")) {
        score += 20;
        association = "url_match";
      } else if (resolved.pathname.includes(ctx.pagePath.split("/").filter(Boolean).slice(-1)[0] ?? "___")) {
        score += 8;
        association = "path_token_match";
      } else if (resolved.hostname === new URL(ctx.pageUrl).hostname) {
        score += 2;
      } else {
        score -= 20;
        association = "cross_host";
      }
    }
  } catch {
    /* ignore */
  }

  if (ctx.pageSku && sku && ctx.pageSku === sku) {
    score += 25;
    association = "sku_match";
  }
  if (ctx.selectedVariantId && variantId && ctx.selectedVariantId === variantId) {
    score += 25;
    association = "selected_variant";
  }

  // Related / recommendation markers
  if (/\b(related|recommend|upsell|cross|recently|complementary)\b/i.test(path)) {
    score -= 30;
    association = "related_path";
  }

  return { score, association, sku, variantId };
}

function extractPriceFields(
  record: Record<string, unknown>,
  ctx: WalkCtx,
  path: string
): void {
  if (ctx.prices.length >= MAX_EMBEDDED_PRICES) return;
  const assoc = scoreAssociation(record, ctx, path);
  if (assoc.score < 0) return;
  const unit = String(record.unit ?? record.uom ?? record.unitCode ?? "");
  const dimName = String(record.name ?? record.label ?? record.code ?? path);
  if (/\b(mm|cm)\b/i.test(unit) || /\b(sirina|width|visina|height|globina|depth|dimension|dimenz)\b/i.test(dimName)) {
    return;
  }
  if (looksLikeDimensionNotPrice(dimName)) return;

  const entries: Array<{ key: string; kind: MerchantPriceKind }> = [
    { key: "price", kind: "current" },
    { key: "price_amount", kind: "current" },
    { key: "amount", kind: "current" },
    { key: "currentPrice", kind: "current" },
    { key: "finalPrice", kind: "current" },
    { key: "final_price", kind: "current" },
    { key: "salePrice", kind: "sale" },
    { key: "sale_price", kind: "sale" },
    { key: "specialPrice", kind: "sale" },
    { key: "special_price", kind: "sale" },
    { key: "compare_at_price", kind: "compare_at" },
    { key: "compareAtPrice", kind: "compare_at" },
    { key: "regularPrice", kind: "regular" },
    { key: "regular_price", kind: "regular" },
    { key: "listPrice", kind: "msrp" },
    { key: "msrp", kind: "msrp" },
    { key: "price_min", kind: "unknown" },
    { key: "price_max", kind: "unknown" },
  ];

  const currencyRaw =
    typeof record.currency === "string"
      ? record.currency
      : typeof record.priceCurrency === "string"
        ? record.priceCurrency
        : typeof record.currencyCode === "string"
          ? record.currencyCode
          : null;

  for (const { key, kind } of entries) {
    if (!(key in record)) continue;
    if (key === "amount" && !currencyRaw && !/price|offer/i.test(path)) continue;
    const raw = record[key];
    // Shopify often stores cents as integer under price
    let parsed: number | null = null;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      parsed = raw;
      // Shopify variant prices are integer cents (e.g. 19900). Avoid dividing euro amounts like 199.
      const compareAt = record.compare_at_price;
      const looksLikeShopifyCents =
        key === "price" &&
        Number.isInteger(raw) &&
        raw >= 1000 &&
        (typeof compareAt === "number" ||
          record.inventory_quantity != null ||
          (record.available != null && raw >= 1000 && raw % 100 === 0 && raw < 10_000_000));
      if (looksLikeShopifyCents) {
        parsed = raw / 100;
      }
    } else if (typeof raw === "string") {
      if (looksLikeDimensionNotPrice(raw)) continue;
      parsed = parsePriceNumber(raw);
    } else if (raw && typeof raw === "object") {
      const nested = raw as Record<string, unknown>;
      if (typeof nested.amount === "string" || typeof nested.amount === "number") {
        parsed =
          typeof nested.amount === "number"
            ? nested.amount
            : parsePriceNumber(String(nested.amount));
      }
      if (typeof nested.value === "string" || typeof nested.value === "number") {
        parsed =
          typeof nested.value === "number" ? nested.value : parsePriceNumber(String(nested.value));
      }
    }
    if (parsed == null || parsed <= 0 || parsed >= 100_000) continue;
    const currency = normalizeCurrency(currencyRaw);
    const rawSnippet =
      typeof raw === "string" || typeof raw === "number"
        ? `"${key}":${JSON.stringify(raw)}`
        : `"${key}":${JSON.stringify(raw).slice(0, 180)}`;
    const candidate = {
      amount: parsed,
      currency,
      source: "embedded_state" as const,
      productAssociation: assoc.association,
      rawLabel: key,
      sku: assoc.sku,
      variantId: assoc.variantId,
      ...priceAuditFields({
        source: "embedded_state",
        sourcePath: `${path}.${key}`,
        rawLabel: key,
        amount: parsed,
        currency,
        extractionMethod: "product_attribute",
        evidenceExcerpt: sanitizeEvidenceExcerpt(rawSnippet),
      }),
    };
    if (kind === "unknown" && (key === "price_min" || key === "price_max")) {
      ctx.prices.push({ ...candidate, kind: "unknown" });
      continue;
    }
    ctx.prices.push({ ...candidate, kind });
  }
}

function walkEmbedded(value: unknown, ctx: WalkCtx, path: string, depth: number): void {
  if (depth > MAX_DEPTH || ctx.nodes > MAX_WALK_NODES || ctx.prices.length >= MAX_EMBEDDED_PRICES) {
    return;
  }
  if (value == null) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, 80); i++) {
      walkEmbedded(value[i], ctx, `${path}[${i}]`, depth + 1);
    }
    return;
  }
  if (typeof value !== "object") return;
  ctx.nodes += 1;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const looksProduct =
    keys.some((k) =>
      /^(price|offers|product|sku|mpn|variants|selectedVariant|selected_or_first_available_variant)$/i.test(
        k
      )
    ) &&
    (keys.some((k) => /name|title|product|handle|sku|id/i.test(k)) ||
      /product|variant|offer/i.test(path));

  if (looksProduct) {
    extractPriceFields(record, ctx, path);
    if (record.offers) walkEmbedded(record.offers, ctx, `${path}.offers`, depth + 1);
    if (record.variants) walkEmbedded(record.variants, ctx, `${path}.variants`, depth + 1);
    if (record.selected_or_first_available_variant) {
      walkEmbedded(
        record.selected_or_first_available_variant,
        ctx,
        `${path}.selected_or_first_available_variant`,
        depth + 1
      );
    }
    if (record.selectedVariant) {
      walkEmbedded(record.selectedVariant, ctx, `${path}.selectedVariant`, depth + 1);
    }
  }

  for (const [key, nested] of Object.entries(record)) {
    if (nested && typeof nested === "object") {
      // Skip huge unrelated trees
      if (/^(props|query|pageProps)$/i.test(key) || /product|variant|offer|price|commerce|cart/i.test(key)) {
        walkEmbedded(nested, ctx, `${path}.${key}`, depth + 1);
      } else if (depth < 4) {
        walkEmbedded(nested, ctx, `${path}.${key}`, depth + 1);
      }
    }
  }
}

function extractJsonScriptBlocks(html: string): Array<{ id: string | null; json: unknown }> {
  const out: Array<{ id: string | null; json: unknown }> = [];
  const patterns = [
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]*id=["'](__NEXT_DATA__|__NUXT_DATA__|ProductJson-[^"']+|product-json|data-product)["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]*id=["'][^"']*["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const raw = (match[2] ?? match[1] ?? "").trim();
      if (!raw || raw.length > MAX_SCRIPT_CHARS) continue;
      const idMatch = match[0]!.match(/id=["']([^"']+)["']/i);
      try {
        out.push({ id: idMatch?.[1] ?? null, json: JSON.parse(raw) });
      } catch {
        /* ignore malformed */
      }
    }
  }

  // Narrow assignment forms: window.__PRELOADED_STATE__ = {...};
  const assignPattern =
    /(?:window\.)?(__NEXT_DATA__|__PRELOADED_STATE__|__INITIAL_STATE__|__APOLLO_STATE__|__NUXT__)\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/gi;
  let am: RegExpExecArray | null;
  while ((am = assignPattern.exec(html)) !== null) {
    const raw = am[2]!;
    if (raw.length > MAX_SCRIPT_CHARS) continue;
    try {
      out.push({ id: am[1]!, json: JSON.parse(raw) });
    } catch {
      /* ignore — may be non-JSON JS */
    }
  }

  return out;
}

function detectSelectedVariantId(html: string): string | null {
  const patterns = [
    /data-selected-variant(?:-id)?=["']([^"']+)["']/i,
    /"selected_or_first_available_variant"\s*:\s*\{[^{}]{0,200}?"id"\s*:\s*(\d+)/i,
    /"selectedVariantId"\s*:\s*"?([^",}\s]+)"?/i,
    /name=["']id["'][^>]*value=["'](\d+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function extractEmbeddedStatePrices(input: {
  html: string;
  pageUrl: string;
  pageSku?: string | null;
}): MerchantPriceCandidate[] {
  let pagePath = "/";
  try {
    pagePath = new URL(input.pageUrl).pathname;
  } catch {
    /* ignore */
  }
  const ctx: WalkCtx = {
    pageUrl: input.pageUrl,
    pagePath,
    pageSku: input.pageSku ?? null,
    selectedVariantId: detectSelectedVariantId(input.html),
    nodes: 0,
    prices: [],
  };

  for (const block of extractJsonScriptBlocks(input.html)) {
    const rootPath = block.id ?? "script_json";
    walkEmbedded(block.json, ctx, rootPath, 0);
  }

  return ctx.prices;
}

/**
 * Discover explicit same-origin product JSON endpoints declared in HTML.
 */
export function discoverSameOriginProductDataUrls(html: string, pageUrl: string): string[] {
  const urls = new Set<string>();
  let origin: string;
  let page: URL;
  try {
    page = new URL(pageUrl);
    origin = page.origin;
  } catch {
    return [];
  }

  const candidates: string[] = [];
  const patterns = [
    /(?:href|src|data-url|data-product-url)=["']([^"']+)["']/gi,
    /["'](https?:\/\/[^"']+\/products\/[^"']+\.js)["']/gi,
    /["'](\/products\/[^"']+\.js)["']/gi,
    /["'](\/[^"']*product[^"']*\.json(?:\?[^"']*)?)["']/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      candidates.push(m[1]!);
    }
  }

  // Shopify convention: current product handle .js
  if (/\/products\//i.test(page.pathname)) {
    candidates.push(page.pathname.replace(/\/$/, "") + ".js");
  }

  for (const raw of candidates) {
    try {
      const resolved = new URL(raw, pageUrl);
      if (resolved.origin !== origin) continue;
      if (!/^https?:$/i.test(resolved.protocol)) continue;
      const path = resolved.pathname.toLowerCase();
      if (
        path.endsWith(".js") ||
        path.endsWith(".json") ||
        /\/products\/.+/.test(path) ||
        /product.*\.(js|json)$/.test(path)
      ) {
        // Avoid HTML product pages themselves
        if (!path.endsWith(".js") && !path.endsWith(".json") && !resolved.search.includes("json")) {
          continue;
        }
        urls.add(resolved.toString());
      }
    } catch {
      /* ignore */
    }
  }
  return [...urls].slice(0, 2);
}

export function extractPricesFromSameOriginJson(
  json: unknown,
  pageUrl: string,
  pageSku?: string | null
): MerchantPriceCandidate[] {
  const ctx: WalkCtx = {
    pageUrl,
    pagePath: (() => {
      try {
        return new URL(pageUrl).pathname;
      } catch {
        return "/";
      }
    })(),
    pageSku: pageSku ?? null,
    selectedVariantId: null,
    nodes: 0,
    prices: [],
  };
  walkEmbedded(json, ctx, "same_origin_json", 0);
  // Prefer selected/first available variant for Shopify product.js
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    if (Array.isArray(record.variants)) {
      const variants = record.variants as Array<Record<string, unknown>>;
      const selected =
        variants.find((v) => v.available === true) ??
        variants.find((v) => v.id != null) ??
        null;
      if (selected) {
        extractPriceFields(selected, ctx, "same_origin_json.selected_variant");
      } else if (variants.length > 1) {
        // multiple unresolved variants — mark unknowns
        for (const v of variants.slice(0, 5)) {
          extractPriceFields(v, { ...ctx, selectedVariantId: null }, "same_origin_json.variant_unresolved");
        }
      }
    }
  }
  return ctx.prices.map((p) => ({ ...p, source: "same_origin_product_data" as const }));
}

export type SelectVerifiedPriceResult = {
  verified: VerifiedMerchantPrice | null;
  failureReason: PriceFailureReason | null;
  candidatesConsidered: number;
};

/**
 * Select a single verified CURRENT purchasable price, or reject with reason.
 */
export function selectVerifiedPurchasePrice(
  candidates: MerchantPriceCandidate[],
  opts?: { requireCurrency?: boolean; pageSku?: string | null; selectedVariantId?: string | null }
): SelectVerifiedPriceResult {
  const requireCurrency = opts?.requireCurrency ?? true;
  if (candidates.length === 0) {
    return { verified: null, failureReason: "PRICE_NONE_NO_PRICE_TOKEN", candidatesConsidered: 0 };
  }

  const installmentOnly = candidates.every((c) => c.kind === "installment");
  if (installmentOnly) {
    return {
      verified: null,
      failureReason: "PRICE_NONE_INSTALLMENT_ONLY",
      candidatesConsidered: candidates.length,
    };
  }

  const purchasable = candidates.filter(
    (c) => isPurchasableKind(c.kind) || (c.kind === "unknown" && c.source === "json_ld")
  );

  // Promote json_ld unknown to current when sole clear offer
  const normalized = purchasable.map((c) =>
    c.kind === "unknown" && c.source === "json_ld" ? { ...c, kind: "current" as const } : c
  );

  const oldOnly =
    normalized.length === 0 &&
    candidates.some((c) => c.kind === "old" || c.kind === "msrp" || c.kind === "compare_at" || c.kind === "regular");
  if (oldOnly) {
    return {
      verified: null,
      failureReason: "PRICE_NONE_ONLY_OLD_OR_MSRP",
      candidatesConsidered: candidates.length,
    };
  }

  if (normalized.length === 0) {
    return {
      verified: null,
      failureReason: "PRICE_NONE_NO_PRICE_TOKEN",
      candidatesConsidered: candidates.length,
    };
  }

  // Variant unresolved: multiple distinct amounts with different variant IDs and no selection
  const withVariants = normalized.filter((c) => c.variantId);
  const uniqueVariantIds = new Set(withVariants.map((c) => c.variantId!));
  const uniqueAmounts = new Set(normalized.map((c) => c.amount.toFixed(2)));
  if (
    uniqueVariantIds.size > 1 &&
    uniqueAmounts.size > 1 &&
    !opts?.selectedVariantId &&
    !opts?.pageSku
  ) {
    return {
      verified: null,
      failureReason: "PRICE_NONE_VARIANT_UNRESOLVED",
      candidatesConsidered: candidates.length,
    };
  }

  // Prefer selected variant / sku match
  let pool = normalized;
  if (opts?.selectedVariantId) {
    const matched = pool.filter((c) => c.variantId === opts.selectedVariantId);
    if (matched.length) pool = matched;
  }
  if (opts?.pageSku) {
    const matched = pool.filter((c) => c.sku === opts.pageSku);
    if (matched.length) pool = matched;
  }

  // When an explicit sale price exists, prefer it over a higher "current"/regular list price.
  const sales = pool.filter((c) => c.kind === "sale");
  if (sales.length > 0) {
    const saleAmounts = new Set(sales.map((c) => c.amount.toFixed(2)));
    if (saleAmounts.size === 1) {
      pool = sales;
    }
  }

  // Prefer currency-bearing candidates when currency is required.
  if (requireCurrency) {
    const withCurrency = pool.filter((c) => Boolean(c.currency));
    if (withCurrency.length > 0) {
      pool = withCurrency;
    }
  }

  // Prefer sale/current over unknown; prefer stronger association
  const rank = (c: MerchantPriceCandidate): number => {
    let s = 0;
    if (c.kind === "sale") s += 30;
    if (c.kind === "current") s += 25;
    if (c.source === "json_ld") s += 20;
    if (c.source === "same_origin_product_data") s += 18;
    if (c.source === "meta") s += 15;
    if (c.source === "microdata") s += 12;
    if (c.source === "embedded_state") s += 14;
    if (c.source === "html_product_price") s += 10;
    if (c.productAssociation === "sku_match" || c.productAssociation === "selected_variant") s += 20;
    if (c.productAssociation === "url_match") s += 15;
    if (c.productAssociation === "related_path" || c.productAssociation === "cross_host") s -= 40;
    return s;
  };

  pool = [...pool].sort((a, b) => rank(b) - rank(a));
  const best = pool[0]!;

  if (
    best.productAssociation === "related_path" ||
    best.productAssociation === "cross_host" ||
    best.productAssociation === "product_association_unsafe"
  ) {
    return {
      verified: null,
      failureReason: "PRICE_NONE_PRODUCT_ASSOCIATION_UNSAFE",
      candidatesConsidered: candidates.length,
    };
  }

  // Ambiguous: top candidates disagree on amount with similar rank
  const topAmount = best.amount.toFixed(2);
  const contenders = pool.filter((c) => rank(c) >= rank(best) - 5);
  const contenderAmounts = new Set(contenders.map((c) => c.amount.toFixed(2)));
  if (contenderAmounts.size > 1) {
    // Allow sale vs regular if we clearly prefer sale/current
    const purchasableContenders = contenders.filter((c) => isPurchasableKind(c.kind));
    const purchasableAmounts = new Set(purchasableContenders.map((c) => c.amount.toFixed(2)));
    if (purchasableAmounts.size > 1) {
      return {
        verified: null,
        failureReason: "PRICE_NONE_MULTIPLE_AMBIGUOUS",
        candidatesConsidered: candidates.length,
      };
    }
  }

  const currency = best.currency;
  if (requireCurrency && !currency) {
    return {
      verified: null,
      failureReason: "PRICE_NONE_CURRENCY_MISSING",
      candidatesConsidered: candidates.length,
    };
  }

  void topAmount;
  const audit = priceAuditFields({
    source: best.source,
    sourcePath: best.sourcePath,
    rawLabel: best.rawLabel,
    amount: best.amount,
    currency,
    extractionMethod: best.extractionMethod,
    evidenceExcerpt: best.evidenceExcerpt,
  });
  return {
    verified: {
      amount: best.amount,
      currency,
      kind: best.kind === "sale" ? "sale" : "current",
      source: best.source,
      confidence: "verified",
      productAssociation: best.productAssociation,
      rawLabel: best.rawLabel,
      ...audit,
    },
    failureReason: null,
    candidatesConsidered: candidates.length,
  };
}

export function inferJsOnlyPriceFailure(html: string, hadAnyToken: boolean): PriceFailureReason {
  if (hadAnyToken) return "PRICE_NONE_PARSE_FAILURE";
  if (
    /__NEXT_DATA__|Shopify\.analytics|priceBox|wc-price|data-product-json/i.test(html) &&
    !/<meta[^>]+product:price:amount/i.test(html)
  ) {
    return "PRICE_NONE_JS_RENDERED";
  }
  return "PRICE_NONE_NO_PRICE_TOKEN";
}
