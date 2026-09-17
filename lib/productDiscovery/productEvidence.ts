/**
 * Shared trusted-evidence layer for Product Discovery acceptance.
 * Model output is a claim — never treated as evidence here.
 */
import type { CandidateEnrichment } from "./enrichCandidate";
import {
  contradictoryMaterialEvidence,
  hasGenuineMaterialEvidence,
  isAppearanceOnlyMaterialEvidence,
} from "./materialEvidence";
import { usesExactLanguage } from "./matchPolicy";
import { urlsEvidenceMatch } from "./domains";
import type { PriceEvidence, ProductDiscoverySource } from "./types";
import type { EvidenceExtractionMethod } from "./evidenceProvenance";

export type EvidenceKind =
  | "merchant_json_ld"
  | "merchant_page"
  | "merchant_metadata"
  | "web_search_source_title"
  | "web_search_source_snippet"
  | "web_search_citation"
  | "product_url"
  | "none";

export type EvidenceField =
  | "category"
  | "name"
  | "price"
  | "currency"
  | "material"
  | "color"
  | "dimension"
  | "brand"
  | "model"
  | "availability"
  | "other";

export type EvidenceFact = {
  kind: EvidenceKind;
  url: string | null;
  text: string | null;
  field: EvidenceField;
  value: string | number | null;
  /** Original merchant label when available (e.g. "Širina izdelka"). */
  label?: string | null;
  /** Normalized unit for dimensional facts (mm|cm|m). */
  unit?: string | null;
  verifiedAt?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  extractionMethod?: EvidenceExtractionMethod | null;
  sourcePath?: string | null;
  evidenceExcerpt?: string | null;
  /** Single-axis normalized dimension (cm). Ambiguous pairs stay null. */
  normalizedValue?: string | null;
};

export type ProductEvidence = {
  productUrl: string;
  productNameEvidence: EvidenceFact[];
  categoryEvidence: EvidenceFact[];
  priceEvidence: EvidenceFact[];
  materialEvidence: EvidenceFact[];
  colorEvidence: EvidenceFact[];
  dimensionEvidence: EvidenceFact[];
  generalTextEvidence: EvidenceFact[];
};

export type EvidenceDiagnostics = {
  groundedRequirements: string[];
  unsupportedModelClaims: string[];
  priceEvidenceKind: PriceEvidence;
  evidenceSourceCount: number;
  merchantEvidenceAvailable: boolean;
};

export type GroundedPriceResult = {
  price: number | null;
  currency: string | null;
  priceEvidence: PriceEvidence;
  modelReportedPrice: number | null;
};

const EXPLICIT_PRICE_PATTERN =
  /(?:€|eur)\s*(\d{1,6}(?:[.,]\d{1,2})?)|(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|eur)/gi;

const DIMENSION_CLAIM = /\b(\d+(?:[.,]\d+)?)\s*(?:cm|mm|m)\b/i;

const CLAIM_STOPWORDS = new Set([
  "confirmed",
  "exactly",
  "exact",
  "approx",
  "approximately",
  "around",
  "roughly",
  "width",
  "wide",
  "height",
  "diameter",
  "dimension",
  "dimensions",
  "product",
  "category",
  "construction",
  "material",
  "color",
  "colour",
  "finish",
  "with",
  "from",
  "this",
  "that",
  "listed",
  "direct",
  "merchant",
  "page",
  "verified",
  "available",
  "availability",
  "retailer",
  "online",
  "purchase",
  "purchasing",
  "option",
  "add",
  "cart",
  "main",
  "part",
  "size",
  "match",
  "requirement",
  "requirements",
  "within",
  "maximum",
  "budget",
  "price",
  "including",
  "effectively",
  "description",
  "confirms",
  "explicitly",
]);

const CLAIM_ALIASES: Record<string, string[]> = {
  metal: ["metal", "kovin", "steel", "jekl", "aluminium", "aluminum", "brass", "meden", "iron", "zelez"],
  black: ["black", "crna", "crno", "crni", "crn"],
  white: ["white", "bela", "belo", "beli", "bel"],
  chrome: ["chrome", "krom", "kromiran", "chromed"],
  ceramic: ["ceramic", "keramik"],
  stainless: ["stainless", "inox", "nerjav", "nerjave"],
  steel: ["steel", "inox", "nerjav", "jekl"],
  pendant: ["pendant", "viseca", "visilka", "hanging"],
  sink: ["sink", "korito", "pomival"],
  kitchen: ["kitchen", "kuhinj"],
  radiator: ["radiator", "ogrev", "brisac"],
  towel: ["towel", "brisac"],
  vase: ["vase", "vaza"],
  oak: ["oak", "hrast"],
  gold: ["gold", "golden", "zlat"],
  marble: ["marble", "marmor"],
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseEuroAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\s+/g, "").replace(",", ".");
  const match = normalized.match(/^(\d{1,6})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const num = Number.parseFloat(`${match[1]}.${match[2] ?? "00"}`);
  if (!Number.isFinite(num) || num <= 0 || num >= 100_000) return null;
  return num;
}

export function extractEuroPricesFromText(text: string): number[] {
  const prices: number[] = [];
  for (const match of text.matchAll(EXPLICIT_PRICE_PATTERN)) {
    const raw = match[1] ?? match[2];
    if (!raw) continue;
    const parsed = parseEuroAmount(raw);
    if (parsed != null) prices.push(parsed);
  }
  return prices;
}

/**
 * URL path tokens as weak evidence. Drops pure numeric IDs and trivial segments.
 */
export function meaningfulUrlPathText(url: string): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const parts = path
      .split("/")
      .filter(Boolean)
      .filter((part) => {
        const lower = part.toLowerCase();
        if (lower === "p" || lower === "product" || lower === "products" || lower === "izdelek") {
          return false;
        }
        // Pure catalog IDs prove nothing.
        if (/^\d{4,}$/.test(part)) return false;
        return true;
      });
    return parts.join(" ").replace(/[-_+.]+/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function pushFact(list: EvidenceFact[], fact: EvidenceFact): void {
  if (!fact.text?.trim() && fact.value == null) return;
  list.push(fact);
}

function sourcesForProduct(
  productUrl: string,
  sources: ProductDiscoverySource[]
): ProductDiscoverySource[] {
  return sources.filter((source) => urlsEvidenceMatch(productUrl, source.url));
}

/**
 * Build inspectable trusted evidence for a selected candidate.
 * Does not include model prose, model specs, or model price.
 */
export function buildProductEvidence(input: {
  productUrl: string;
  sources: ProductDiscoverySource[];
  enrichment?: CandidateEnrichment | null;
  /** Trusted display name from merchant/source title — never model-only. */
  trustedDisplayName?: string | null;
}): ProductEvidence {
  const evidence: ProductEvidence = {
    productUrl: input.productUrl,
    productNameEvidence: [],
    categoryEvidence: [],
    priceEvidence: [],
    materialEvidence: [],
    colorEvidence: [],
    dimensionEvidence: [],
    generalTextEvidence: [],
  };

  const pathText = meaningfulUrlPathText(input.productUrl);
  if (pathText) {
    pushFact(evidence.generalTextEvidence, {
      kind: "product_url",
      url: input.productUrl,
      text: pathText,
      field: "other",
      value: pathText,
    });
    pushFact(evidence.categoryEvidence, {
      kind: "product_url",
      url: input.productUrl,
      text: pathText,
      field: "category",
      value: pathText,
    });
    pushFact(evidence.dimensionEvidence, {
      kind: "product_url",
      url: input.productUrl,
      text: pathText,
      field: "dimension",
      value: pathText,
    });
    pushFact(evidence.materialEvidence, {
      kind: "product_url",
      url: input.productUrl,
      text: pathText,
      field: "material",
      value: pathText,
    });
    pushFact(evidence.colorEvidence, {
      kind: "product_url",
      url: input.productUrl,
      text: pathText,
      field: "color",
      value: pathText,
    });
  }

  for (const source of sourcesForProduct(input.productUrl, input.sources)) {
    if (source.title?.trim()) {
      pushFact(evidence.generalTextEvidence, {
        kind: "web_search_source_title",
        url: source.url,
        text: source.title.trim(),
        field: "other",
        value: source.title.trim(),
      });
      pushFact(evidence.productNameEvidence, {
        kind: "web_search_source_title",
        url: source.url,
        text: source.title.trim(),
        field: "name",
        value: source.title.trim(),
      });
      for (const price of extractEuroPricesFromText(source.title)) {
        pushFact(evidence.priceEvidence, {
          kind: "web_search_source_title",
          url: source.url,
          text: source.title,
          field: "price",
          value: price,
        });
      }
    }
    if (source.snippet?.trim()) {
      pushFact(evidence.generalTextEvidence, {
        kind: "web_search_source_snippet",
        url: source.url,
        text: source.snippet.trim(),
        field: "other",
        value: source.snippet.trim(),
      });
      for (const price of extractEuroPricesFromText(source.snippet)) {
        pushFact(evidence.priceEvidence, {
          kind: "web_search_source_snippet",
          url: source.url,
          text: source.snippet,
          field: "price",
          value: price,
        });
      }
    }
  }

  if (input.trustedDisplayName?.trim()) {
    pushFact(evidence.productNameEvidence, {
      kind: "merchant_metadata",
      url: input.productUrl,
      text: input.trustedDisplayName.trim(),
      field: "name",
      value: input.trustedDisplayName.trim(),
    });
    pushFact(evidence.generalTextEvidence, {
      kind: "merchant_metadata",
      url: input.productUrl,
      text: input.trustedDisplayName.trim(),
      field: "name",
      value: input.trustedDisplayName.trim(),
    });
  }

  const enrichment = input.enrichment;
  if (enrichment?.status === "success") {
    const labeledSpecs = enrichment.labeledSpecs ?? [];
    const labeledBlock = labeledSpecs.map((s) => s.text).join("\n");
    const merchantBits = [
      enrichment.pageTitle,
      enrichment.productName,
      enrichment.brand,
      enrichment.availability,
      enrichment.sku,
      labeledBlock || null,
      enrichment.productText?.slice(0, 2500) ?? null,
    ].filter(Boolean);
    const merchantText = merchantBits.join("\n");
    if (merchantText) {
      pushFact(evidence.generalTextEvidence, {
        kind: "merchant_page",
        url: input.productUrl,
        text: merchantText,
        field: "other",
        value: merchantText,
      });
    }
    if (enrichment.productName?.trim()) {
      pushFact(evidence.productNameEvidence, {
        kind: enrichment.jsonLdProductFound ? "merchant_json_ld" : "merchant_metadata",
        url: input.productUrl,
        text: enrichment.productName.trim(),
        field: "name",
        value: enrichment.productName.trim(),
        sourcePath: enrichment.merchantEvidenceDiagnostics?.productName?.sourcePath ?? null,
        extractionMethod: enrichment.jsonLdProductFound ? "json_ld" : "meta",
        evidenceExcerpt: enrichment.productName.trim(),
      });
    } else if (enrichment.pageTitle?.trim()) {
      pushFact(evidence.productNameEvidence, {
        kind: "merchant_metadata",
        url: input.productUrl,
        text: enrichment.pageTitle.trim(),
        field: "name",
        value: enrichment.pageTitle.trim(),
      });
    }
    if (enrichment.price != null) {
      const verified = enrichment.verifiedPrice;
      pushFact(evidence.priceEvidence, {
        kind: enrichment.jsonLdProductFound ? "merchant_json_ld" : "merchant_page",
        url: input.productUrl,
        text: `${enrichment.price} ${enrichment.currency ?? ""}`.trim(),
        field: "price",
        value: enrichment.price,
        extractionMethod: verified?.extractionMethod ?? null,
        sourcePath: verified?.sourcePath ?? null,
        evidenceExcerpt: verified?.evidenceExcerpt ?? null,
      });
    }
    for (const spec of labeledSpecs) {
      const fact: EvidenceFact = {
        kind: spec.kind,
        url: input.productUrl,
        text: spec.text,
        field: spec.field,
        value: spec.value,
        label: spec.label,
        unit: spec.unit ?? null,
        verifiedAt: spec.verifiedAt ?? new Date().toISOString(),
        confidence: spec.confidence ?? "high",
        extractionMethod: spec.extractionMethod ?? null,
        sourcePath: spec.sourcePath ?? null,
        evidenceExcerpt: spec.evidenceExcerpt ?? spec.text,
        normalizedValue: spec.normalizedValue ?? null,
      };
      if (spec.field === "material") pushFact(evidence.materialEvidence, fact);
      else if (spec.field === "color") pushFact(evidence.colorEvidence, fact);
      else if (spec.field === "dimension") pushFact(evidence.dimensionEvidence, fact);
      else if (spec.field === "name") pushFact(evidence.productNameEvidence, fact);
      else pushFact(evidence.generalTextEvidence, { ...fact, field: "other" });
    }
  }

  return evidence;
}

export function trustedEvidenceHaystack(evidence: ProductEvidence): string {
  const parts = [
    ...evidence.productNameEvidence,
    ...evidence.categoryEvidence,
    ...evidence.priceEvidence,
    ...evidence.materialEvidence,
    ...evidence.colorEvidence,
    ...evidence.dimensionEvidence,
    ...evidence.generalTextEvidence,
  ]
    .map((fact) => fact.text)
    .filter(Boolean);
  return [...new Set(parts)].join("\n");
}

export function resolveTrustedDisplayName(input: {
  enrichment?: CandidateEnrichment | null;
  sources: ProductDiscoverySource[];
  productUrl: string;
  modelName?: string | null;
}): { name: string; verified: boolean } {
  const enrichment = input.enrichment;
  if (enrichment?.status === "success" && enrichment.productName?.trim()) {
    return { name: enrichment.productName.trim(), verified: true };
  }
  if (enrichment?.status === "success" && enrichment.pageTitle?.trim()) {
    return { name: enrichment.pageTitle.trim(), verified: true };
  }
  const related = sourcesForProduct(input.productUrl, input.sources);
  const titled = related.find((source) => source.title?.trim());
  if (titled?.title?.trim()) {
    return { name: titled.title.trim(), verified: true };
  }
  if (input.modelName?.trim()) {
    return { name: input.modelName.trim(), verified: false };
  }
  return { name: "Unknown product", verified: false };
}

/**
 * Ground price to merchant / provider-visible web evidence only.
 * Model-claimed price alone is never enough.
 */
export function resolveGroundedPrice(input: {
  evidence: ProductEvidence;
  modelClaimedPrice: number | null;
  serpSnippetPrice?: number | null;
}): GroundedPriceResult {
  const modelReportedPrice = input.modelClaimedPrice;

  const merchantPrices = input.evidence.priceEvidence.filter(
    (fact) =>
      (fact.kind === "merchant_json_ld" || fact.kind === "merchant_page") && typeof fact.value === "number"
  );
  if (merchantPrices[0] && typeof merchantPrices[0].value === "number") {
    return {
      price: merchantPrices[0].value,
      currency: "EUR",
      priceEvidence: "merchant_page",
      modelReportedPrice,
    };
  }

  if (
    input.serpSnippetPrice != null &&
    Number.isFinite(input.serpSnippetPrice) &&
    input.serpSnippetPrice > 0
  ) {
    if (
      modelReportedPrice == null ||
      Math.abs(modelReportedPrice - input.serpSnippetPrice) < 0.02
    ) {
      return {
        price: input.serpSnippetPrice,
        currency: "EUR",
        priceEvidence: "serp",
        modelReportedPrice,
      };
    }
  }

  const webPrices = input.evidence.priceEvidence
    .filter(
      (fact) =>
        (fact.kind === "web_search_source_title" ||
          fact.kind === "web_search_source_snippet" ||
          fact.kind === "web_search_citation") &&
        typeof fact.value === "number"
    )
    .map((fact) => fact.value as number);
  const unique = [...new Set(webPrices.map((p) => Math.round(p * 100) / 100))];
  if (unique.length === 1) {
    const price = unique[0]!;
    if (modelReportedPrice == null || Math.abs(modelReportedPrice - price) < 0.02) {
      return {
        price,
        currency: "EUR",
        priceEvidence: "web_search",
        modelReportedPrice,
      };
    }
  }

  if (modelReportedPrice != null && unique.some((p) => Math.abs(p - modelReportedPrice) < 0.02)) {
    return {
      price: modelReportedPrice,
      currency: "EUR",
      priceEvidence: "web_search",
      modelReportedPrice,
    };
  }

  return {
    price: null,
    currency: null,
    priceEvidence: "none",
    modelReportedPrice,
  };
}

export function tokensForClaim(claim: string): string[] {
  const n = normalize(claim);
  const tokens: string[] = [];

  for (const [key, aliases] of Object.entries(CLAIM_ALIASES)) {
    if (n.includes(key) || aliases.some((alias) => n.includes(normalize(alias)))) {
      tokens.push(key, ...aliases);
    }
  }

  for (const word of n.split(/[^a-z0-9]+/)) {
    if (word.length >= 4 && !CLAIM_STOPWORDS.has(word)) tokens.push(word);
  }

  return [...new Set(tokens)];
}

export type ClaimEvidenceStatus = "supported" | "unsupported" | "contradicted";

/**
 * Exact-dimension claims require oriented/safe width evidence.
 * Ambiguous pairs like "800 x 600 mm" or bare "600x500" do NOT confirm exact width.
 * Substring matches like includes("60") inside "600" are rejected.
 */
export function classifyExactDimensionAgainstEvidence(input: {
  valueCm: string;
  haystack: string;
}): ClaimEvidenceStatus {
  const hay = normalize(input.haystack);
  const value = input.valueCm.replace(",", ".");
  const mm = (() => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return String(Math.round(n * 10));
  })();

  // Ignore cabinet niche / install clearance widths (not the product width).
  const productHay = hay
    .replace(
      /(?:minimaln[ae]?\s+)?(?:sirina|width)\s+(?:omaric\w*|omare|cabinet|cupboard)[^.\n]{0,40}/gi,
      " "
    )
    .replace(/(?:cabinet|cupboard|omaric\w*)\s*(?:width|sirina)[^.\n]{0,40}/gi, " ");

  const hasLabeledWidth = (cmValue: string, mmValue: string | null): boolean => {
    if (
      new RegExp(`\\b(?:sirina|width|wide)[^.]{0,24}${cmValue}(?:[.,]\\d+)?\\s*cm\\b`).test(productHay)
    ) {
      return true;
    }
    // English "60 cm wide". Do not treat Magento "DOLŽINA 50 CM ŠIRINA 60 CM"
    // as width=50 just because širina follows the previous spec value.
    if (new RegExp(`\\b${cmValue}(?:[.,]\\d+)?\\s*cm\\b\\s*(?:wide|width)\\b`).test(productHay)) {
      return true;
    }
    if (new RegExp(`\\b${cmValue}(?:[.,]\\d+)?\\s*cm\\b\\s*sirina\\b(?!\\s*:?\\s*\\d)`).test(productHay)) {
      return true;
    }
    if (!mmValue) return false;
    if (new RegExp(`\\b(?:sirina|width|wide)[^.]{0,24}${mmValue}\\s*mm\\b`).test(productHay)) {
      return true;
    }
    if (new RegExp(`\\b${mmValue}\\s*mm\\b\\s*(?:wide|width)\\b`).test(productHay)) return true;
    return new RegExp(`\\b${mmValue}\\s*mm\\b\\s*sirina\\b(?!\\s*:?\\s*\\d)`).test(productHay);
  };

  const hasMatchingLabeledWidth = hasLabeledWidth(value, mm);
  const otherWidthsCm = ["40", "50", "55", "70", "80", "90", "100", "120"].filter((w) => w !== value);
  for (const other of otherWidthsCm) {
    const otherMm = String(Number(other) * 10);
    if (!hasLabeledWidth(other, otherMm)) continue;
    if (!hasMatchingLabeledWidth) return "contradicted";
    // Conflicting explicit width labels (širina 50 cm and širina 60 cm).
    if (
      new RegExp(`\\b(?:sirina|width|wide)[^.]{0,24}${other}(?:[.,]\\d+)?\\s*cm\\b`).test(productHay) ||
      (mm && new RegExp(`\\b(?:sirina|width|wide)[^.]{0,24}${otherMm}\\s*mm\\b`).test(productHay))
    ) {
      return "contradicted";
    }
  }

  if (hasMatchingLabeledWidth) return "supported";

  // Depth/length labeled as the requested value → not width unless width also matches.
  if (
    new RegExp(
      `\\b(?:dolzina|length|depth|proti\\s+steni|globina)[^.]{0,24}${value}(?:[.,]\\d+)?\\s*cm\\b`
    ).test(productHay)
  ) {
    return "unsupported";
  }

  // Ambiguous overall size pairs (A x B) — do not assume which side is width.
  if (
    /\b\d{2,4}(?:[.,]\d+)?\s*(?:cm|mm)?\s*[x×]\s*\d{2,4}(?:[.,]\d+)?\s*(?:cm|mm)?\b/.test(productHay) ||
    /\b\d{3,4}\s*x\s*\d{3,4}\b/.test(productHay)
  ) {
    return "unsupported";
  }

  // Safe standalone dimension with unit (not part of an A x B pair — already excluded above).
  // Do not treat bare "60 cm" as exact width when a contradicting product width exists elsewhere.
  if (new RegExp(`\\b${value}(?:[.,]\\d+)?\\s*cm\\b`).test(productHay)) {
    return "supported";
  }
  if (mm && new RegExp(`\\b${mm}\\s*mm\\b`).test(productHay)) {
    return "supported";
  }

  return "unsupported";
}

export function classifyClaimAgainstEvidence(input: {
  claim: string;
  haystack: string;
  requestedItem: string;
  dimensionHaystack?: string;
}): ClaimEvidenceStatus {
  const claim = input.claim;
  const haystack = normalize(input.haystack);
  const dimensionHaystack = normalize(input.dimensionHaystack ?? input.haystack);

  if (/\b(max|budget|under|price)\b/i.test(claim) && /\b(satisf|within|under|below|met)\b/i.test(claim)) {
    return "unsupported";
  }

  // Budget label itself is validated via verified price, not text tokens.
  if (/\bmax\b/i.test(claim) && /eur|€/i.test(claim)) {
    return "supported";
  }

  const dimensionMatch = claim.match(DIMENSION_CLAIM);
  if (dimensionMatch?.[1]) {
    const value = dimensionMatch[1].replace(",", ".");
    if (usesExactLanguage(input.requestedItem)) {
      return classifyExactDimensionAgainstEvidence({
        valueCm: value,
        haystack: dimensionHaystack,
      });
    }
    // Approximate dimensions: allow token/mm aliases without requiring orientation.
    const source = haystack;
    if (new RegExp(`\\b${value}(?:[.,]\\d+)?\\s*cm\\b`).test(source)) return "supported";
    if (value === "60" && /\b600\s*mm\b|\b600\s*[x×]|\b600x/.test(source)) return "supported";
    if (value === "40" && (/\b400\s*mm\b/.test(source) || /\b40\s*[/x]/.test(source))) {
      return "supported";
    }
    if (new RegExp(`\\b${value}\\b`).test(source)) return "supported";
    return "unsupported";
  }

  if (
    /\b(exactly|exact|precisely|must be)\b/i.test(claim) &&
    /\b(width|wide|diameter|dimension|cm|mm)\b/i.test(claim)
  ) {
    const numeric = claim.match(/(\d+(?:[.,]\d+)?)/);
    if (numeric?.[1]) {
      return classifyExactDimensionAgainstEvidence({
        valueCm: numeric[1].replace(",", "."),
        haystack: dimensionHaystack,
      });
    }
    return "unsupported";
  }

  const materialKeys = ["gold", "oak", "marble", "leather", "brass", "stone", "wood", "titanium", "metal", "chrome", "stainless", "steel", "ceramic"];
  for (const material of materialKeys) {
    if (!normalize(claim).includes(material) && !CLAIM_ALIASES[material]?.some((a) => normalize(claim).includes(normalize(a)))) {
      continue;
    }

    // Requests that explicitly ask for appearance products (e.g. "oak laminate")
    // are not treated as solid-material identity claims.
    if (/\b(laminate|laminat|look|effect|dekor|finish|foil|folij)\b/i.test(claim)) {
      const aliases = CLAIM_ALIASES[material] ?? [material];
      if (aliases.some((alias) => haystack.includes(normalize(alias)))) return "supported";
      return "unsupported";
    }

    if (contradictoryMaterialEvidence(material, haystack) || isAppearanceOnlyMaterialEvidence(material, haystack)) {
      if (/\bsolid\b/i.test(claim) || material === "oak" || material === "gold" || material === "marble") {
        return "contradicted";
      }
    }
    if (
      material === "metal" ||
      material === "chrome" ||
      material === "stainless" ||
      material === "steel" ||
      material === "ceramic"
    ) {
      const aliases = CLAIM_ALIASES[material] ?? [material];
      if (aliases.some((alias) => haystack.includes(normalize(alias)))) return "supported";
      return "unsupported";
    }
    if (hasGenuineMaterialEvidence(material, haystack)) return "supported";
    return "unsupported";
  }

  const tokens = tokensForClaim(claim);
  if (tokens.length === 0) return "unsupported";
  const hit = tokens.some((token) => token.length >= 3 && haystack.includes(normalize(token)));
  return hit ? "supported" : "unsupported";
}

export function buildEvidenceDiagnostics(input: {
  evidence: ProductEvidence;
  matchedRequirements: string[];
  unsupportedModelClaims: string[];
  priceEvidence: PriceEvidence;
}): EvidenceDiagnostics {
  return {
    groundedRequirements: input.matchedRequirements,
    unsupportedModelClaims: input.unsupportedModelClaims,
    priceEvidenceKind: input.priceEvidence,
    evidenceSourceCount: input.evidence.generalTextEvidence.length + input.evidence.priceEvidence.length,
    merchantEvidenceAvailable: input.evidence.priceEvidence.some(
      (fact) => fact.kind === "merchant_json_ld" || fact.kind === "merchant_page"
    ) ||
      input.evidence.generalTextEvidence.some(
        (fact) => fact.kind === "merchant_json_ld" || fact.kind === "merchant_page"
      ),
  };
}

/** Trusted evidence text for acceptance — never includes model whyItMatches/specs. */
export function buildTrustedEvidenceText(input: {
  productUrl: string;
  sources: ProductDiscoverySource[];
  enrichment?: CandidateEnrichment | null;
  trustedDisplayName?: string | null;
}): string {
  return trustedEvidenceHaystack(
    buildProductEvidence({
      productUrl: input.productUrl,
      sources: input.sources,
      enrichment: input.enrichment,
      trustedDisplayName: input.trustedDisplayName,
    })
  );
}
