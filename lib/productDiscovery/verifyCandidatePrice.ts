import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ParsedResponse } from "openai/resources/responses/responses";
import { TTLCache } from "@/lib/cache";
import { normalizeDomainToRoot } from "@/lib/serp/domains";
import {
  OPENAI_PRODUCT_SEARCH_MODEL,
  OPENAI_PRODUCT_SEARCH_TIMEOUT_MS,
} from "./constants";
import { normalizeUrlForEvidenceMatch, urlsEvidenceMatch } from "./domains";
import {
  enrichCandidatePage,
  getCachedCandidateEnrichment,
  type CandidateEnrichment,
} from "./enrichCandidate";
import {
  buildPriceVerificationUserMessage,
  PRICE_VERIFICATION_SYSTEM_PROMPT,
} from "./priceVerificationPrompt";
import {
  priceVerificationModelSchema,
  type PriceVerificationModelOutput,
} from "./priceVerificationSchema";
import { extractWebSearchSources, responseUsedWebSearch } from "./sources";
import type { PriceEvidence, ProductDiscoveryProduct, ProductDiscoverySource } from "./types";

export type CandidatePriceVerificationStatus = "verified" | "not_found" | "conflicting" | "error";

export type CandidatePriceVerification = {
  status: CandidatePriceVerificationStatus;
  price: number | null;
  currency: string | null;
  evidenceUrl: string | null;
  evidenceType: PriceEvidence;
  productIdentityConfirmed: boolean;
  evidenceText: string | null;
  usedDedicatedSearch: boolean;
  identityConfirmationMethod: string | null;
};

const PRICE_VERIFICATION_CACHE_TTL_MS = 10 * 60 * 1000;
const priceVerificationCache = new TTLCache<CandidatePriceVerification>(PRICE_VERIFICATION_CACHE_TTL_MS);

const FROM_PRICE_PATTERN = /\b(?:from|od|ab)\s*[€]?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|eur)?/i;
const EXPLICIT_PRICE_PATTERN =
  /(?:€|eur)\s*(\d{1,6}(?:[.,]\d{1,2})?)|(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|eur)/gi;

function verificationCacheKey(url: string): string {
  return normalizeUrlForEvidenceMatch(url);
}

export function getCachedCandidatePriceVerification(url: string): CandidatePriceVerification | null {
  return priceVerificationCache.get(verificationCacheKey(url));
}

export function clearCandidatePriceVerificationCache(): void {
  priceVerificationCache.clear();
}

function parseEuroAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\s+/g, "").replace(",", ".");
  const match = normalized.match(/^(\d{1,6})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const num = Number.parseFloat(`${match[1]}.${match[2] ?? "00"}`);
  if (!Number.isFinite(num) || num <= 0 || num >= 100_000) return null;
  return num;
}

function extractPricesFromText(text: string): number[] {
  const prices: number[] = [];
  for (const match of text.matchAll(EXPLICIT_PRICE_PATTERN)) {
    const raw = match[1] ?? match[2];
    if (!raw) continue;
    const parsed = parseEuroAmount(raw);
    if (parsed != null) prices.push(parsed);
  }
  return prices;
}

function significantNumbers(text: string): string[] {
  return [...text.matchAll(/\b(\d{2,4})\b/g)].map((match) => match[1] ?? "").filter(Boolean);
}

function hasVariantNumberMismatch(candidateText: string, evidenceText: string): boolean {
  const candidateNumbers = new Set(significantNumbers(candidateText));
  const evidenceNumbers = significantNumbers(evidenceText);
  if (candidateNumbers.size === 0 || evidenceNumbers.length === 0) return false;
  return evidenceNumbers.some((num) => !candidateNumbers.has(num));
}

function normalizeIdentityText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenOverlapScore(a: string, b: string): number {
  const tokensA = new Set(normalizeIdentityText(a).split(/\s+/).filter((token) => token.length >= 3));
  const tokensB = new Set(normalizeIdentityText(b).split(/\s+/).filter((token) => token.length >= 3));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  return overlap / Math.min(tokensA.size, tokensB.size);
}

function readSku(product: ProductDiscoveryProduct, enrichment?: CandidateEnrichment | null): string | null {
  const specSku = product.specifications?.SKU ?? product.specifications?.sku;
  if (typeof specSku === "string" && specSku.trim()) return specSku.trim();
  if (typeof specSku === "number") return String(specSku);
  return enrichment?.sku ?? null;
}

function readBrand(product: ProductDiscoveryProduct, enrichment?: CandidateEnrichment | null): string | null {
  const specBrand = product.specifications?.Brand ?? product.specifications?.brand;
  if (typeof specBrand === "string" && specBrand.trim()) return specBrand.trim();
  return enrichment?.brand ?? null;
}

export function confirmCandidateProductIdentity(input: {
  candidate: ProductDiscoveryProduct;
  evidenceText: string;
  evidenceUrl?: string | null;
  enrichment?: CandidateEnrichment | null;
}): { confirmed: boolean; method: string | null } {
  const sku = readSku(input.candidate, input.enrichment);
  const haystack = normalizeIdentityText(
    [input.evidenceText, input.evidenceUrl ?? "", input.enrichment?.productName ?? ""].join(" ")
  );

  if (sku && haystack.includes(normalizeIdentityText(sku))) {
    return { confirmed: true, method: "sku" };
  }

  if (urlsEvidenceMatch(input.candidate.productUrl, input.evidenceUrl ?? "")) {
    if (!hasVariantNumberMismatch(input.candidate.name, input.evidenceText)) {
      return { confirmed: true, method: "canonical_url" };
    }
  }

  const overlap = tokenOverlapScore(input.candidate.name, input.evidenceText);
  if (overlap >= 0.5 && !hasVariantNumberMismatch(input.candidate.name, input.evidenceText)) {
    return { confirmed: true, method: "title_overlap" };
  }

  return { confirmed: false, method: null };
}

function isCategoryLikeEvidence(url: string, text: string, candidateName: string): boolean {
  const lowerUrl = url.toLowerCase();
  const categoryHints = /\/(category|kategorij|trgovina|search|iskanje|catalog|katalog)(\/|$)/i;
  if (categoryHints.test(lowerUrl)) return true;
  if (FROM_PRICE_PATTERN.test(text) && tokenOverlapScore(candidateName, text) < 0.35) return true;
  return false;
}

function buildVerificationResult(input: {
  status: CandidatePriceVerificationStatus;
  price: number | null;
  currency: string | null;
  evidenceUrl: string | null;
  evidenceType: PriceEvidence;
  productIdentityConfirmed: boolean;
  evidenceText: string | null;
  usedDedicatedSearch: boolean;
  identityConfirmationMethod: string | null;
}): CandidatePriceVerification {
  return {
    status: input.status,
    price: input.price,
    currency: input.currency,
    evidenceUrl: input.evidenceUrl,
    evidenceType: input.evidenceType,
    productIdentityConfirmed: input.productIdentityConfirmed,
    evidenceText: input.evidenceText,
    usedDedicatedSearch: input.usedDedicatedSearch,
    identityConfirmationMethod: input.identityConfirmationMethod,
  };
}

function merchantEnrichmentToVerification(
  candidate: ProductDiscoveryProduct,
  enrichment: CandidateEnrichment
): CandidatePriceVerification | null {
  if (enrichment.status !== "success" || enrichment.price == null) return null;

  const evidenceText = [
    enrichment.productName,
    enrichment.pageTitle,
    enrichment.productText,
  ]
    .filter(Boolean)
    .join("\n");

  const identity = confirmCandidateProductIdentity({
    candidate,
    evidenceText,
    evidenceUrl: candidate.productUrl,
    enrichment,
  });
  if (!identity.confirmed) return null;

  return buildVerificationResult({
    status: "verified",
    price: enrichment.price,
    currency: enrichment.currency ?? "EUR",
    evidenceUrl: candidate.productUrl,
    evidenceType: "merchant_page",
    productIdentityConfirmed: true,
    evidenceText,
    usedDedicatedSearch: false,
    identityConfirmationMethod: identity.method,
  });
}

function sourceEvidenceToVerification(
  candidate: ProductDiscoveryProduct,
  sources: ProductDiscoverySource[]
): CandidatePriceVerification | null {
  const relatedSources = sources.filter((source) => urlsEvidenceMatch(candidate.productUrl, source.url));
  const prices: Array<{ price: number; source: ProductDiscoverySource }> = [];

  for (const source of relatedSources) {
    const text = [source.title, source.url].filter(Boolean).join(" ");
    if (!text || isCategoryLikeEvidence(source.url, text, candidate.name)) continue;
    if (FROM_PRICE_PATTERN.test(text) && !urlsEvidenceMatch(candidate.productUrl, source.url)) continue;

    const identity = confirmCandidateProductIdentity({
      candidate,
      evidenceText: text,
      evidenceUrl: source.url,
    });
    if (!identity.confirmed) continue;

    for (const price of extractPricesFromText(text)) {
      prices.push({ price, source });
    }
  }

  const uniquePrices = [...new Set(prices.map((entry) => entry.price))];
  if (uniquePrices.length === 0) return null;
  if (uniquePrices.length > 1) {
    return buildVerificationResult({
      status: "conflicting",
      price: null,
      currency: null,
      evidenceUrl: prices[0]?.source.url ?? null,
      evidenceType: "none",
      productIdentityConfirmed: true,
      evidenceText: prices.map((entry) => `${entry.price} @ ${entry.source.url}`).join("; "),
      usedDedicatedSearch: false,
      identityConfirmationMethod: "source_text",
    });
  }

  const winner = prices[0];
  if (!winner) return null;

  return buildVerificationResult({
    status: "verified",
    price: winner.price,
    currency: "EUR",
    evidenceUrl: winner.source.url,
    evidenceType: "web_search",
    productIdentityConfirmed: true,
    evidenceText: winner.source.title,
    usedDedicatedSearch: false,
    identityConfirmationMethod: "source_text",
  });
}

function dedicatedOutputToVerification(
  candidate: ProductDiscoveryProduct,
  parsed: PriceVerificationModelOutput,
  sources: ProductDiscoverySource[]
): CandidatePriceVerification {
  if (parsed.status === "conflicting") {
    return buildVerificationResult({
      status: "conflicting",
      price: null,
      currency: null,
      evidenceUrl: null,
      evidenceType: "none",
      productIdentityConfirmed: parsed.productIdentityConfirmed,
      evidenceText: parsed.reasoningSummary,
      usedDedicatedSearch: true,
      identityConfirmationMethod: null,
    });
  }

  if (parsed.status !== "verified" || parsed.price == null || !parsed.productIdentityConfirmed) {
    return buildVerificationResult({
      status: "not_found",
      price: null,
      currency: null,
      evidenceUrl: null,
      evidenceType: "none",
      productIdentityConfirmed: parsed.productIdentityConfirmed,
      evidenceText: parsed.reasoningSummary,
      usedDedicatedSearch: true,
      identityConfirmationMethod: null,
    });
  }

  const source =
    parsed.evidenceSourceIndex != null ? sources[parsed.evidenceSourceIndex] ?? null : null;
  if (!source) {
    return buildVerificationResult({
      status: "not_found",
      price: null,
      currency: null,
      evidenceUrl: null,
      evidenceType: "none",
      productIdentityConfirmed: false,
      evidenceText: parsed.reasoningSummary,
      usedDedicatedSearch: true,
      identityConfirmationMethod: null,
    });
  }

  const retailerDomain = normalizeDomainToRoot(candidate.productUrl);
  if (!retailerDomain || normalizeDomainToRoot(source.url) !== retailerDomain) {
    return buildVerificationResult({
      status: "not_found",
      price: null,
      currency: null,
      evidenceUrl: null,
      evidenceType: "none",
      productIdentityConfirmed: false,
      evidenceText: parsed.reasoningSummary,
      usedDedicatedSearch: true,
      identityConfirmationMethod: null,
    });
  }

  if (!urlsEvidenceMatch(candidate.productUrl, source.url) && isCategoryLikeEvidence(source.url, source.title ?? "", candidate.name)) {
    return buildVerificationResult({
      status: "not_found",
      price: null,
      currency: null,
      evidenceUrl: null,
      evidenceType: "none",
      productIdentityConfirmed: false,
      evidenceText: parsed.reasoningSummary,
      usedDedicatedSearch: true,
      identityConfirmationMethod: null,
    });
  }

  const identity = confirmCandidateProductIdentity({
    candidate,
    evidenceText: [source.title, parsed.reasoningSummary].filter(Boolean).join("\n"),
    evidenceUrl: source.url,
  });
  if (!identity.confirmed) {
    return buildVerificationResult({
      status: "not_found",
      price: null,
      currency: null,
      evidenceUrl: null,
      evidenceType: "none",
      productIdentityConfirmed: false,
      evidenceText: parsed.reasoningSummary,
      usedDedicatedSearch: true,
      identityConfirmationMethod: null,
    });
  }

  return buildVerificationResult({
    status: "verified",
    price: parsed.price,
    currency: parsed.currency?.trim().toUpperCase() === "EUR" ? "EUR" : "EUR",
    evidenceUrl: source.url,
    evidenceType: "web_search",
    productIdentityConfirmed: true,
    evidenceText: [source.title, parsed.reasoningSummary].filter(Boolean).join("\n"),
    usedDedicatedSearch: true,
    identityConfirmationMethod: identity.method,
  });
}

async function dedicatedPriceVerificationSearch(input: {
  client: OpenAI;
  requestedItem: string;
  candidate: ProductDiscoveryProduct;
  allowlistDomains: string[];
}): Promise<CandidatePriceVerification> {
  const retailerDomain =
    normalizeDomainToRoot(input.candidate.retailerDomain || input.candidate.productUrl) ??
    input.candidate.retailerDomain;

  if (!retailerDomain) {
    return buildVerificationResult({
      status: "error",
      price: null,
      currency: null,
      evidenceUrl: null,
      evidenceType: "none",
      productIdentityConfirmed: false,
      evidenceText: null,
      usedDedicatedSearch: true,
      identityConfirmationMethod: null,
    });
  }

  const cachedEnrichment = getCachedCandidateEnrichment(input.candidate.productUrl);
  const sku = readSku(input.candidate, cachedEnrichment);
  const brand = readBrand(input.candidate, cachedEnrichment);

  try {
    const response: ParsedResponse<PriceVerificationModelOutput> = await input.client.responses.parse({
      model: OPENAI_PRODUCT_SEARCH_MODEL,
      instructions: PRICE_VERIFICATION_SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPriceVerificationUserMessage({
                requestedItem: input.requestedItem,
                productName: input.candidate.name,
                productUrl: input.candidate.productUrl,
                retailerDomain,
                sku,
                brand,
              }),
            },
          ],
        },
      ],
      tools: [
        {
          type: "web_search",
          search_context_size: "low",
          filters: { allowed_domains: [retailerDomain] },
        },
      ],
      tool_choice: "required",
      reasoning: { effort: "low" },
      include: ["web_search_call.action.sources"],
      text: { format: zodTextFormat(priceVerificationModelSchema, "price_verification_result") },
    });

    const sources = extractWebSearchSources(response);
    if (!responseUsedWebSearch(response) || !response.output_parsed) {
      return buildVerificationResult({
        status: "error",
        price: null,
        currency: null,
        evidenceUrl: null,
        evidenceType: "none",
        productIdentityConfirmed: false,
        evidenceText: null,
        usedDedicatedSearch: true,
        identityConfirmationMethod: null,
      });
    }

    return dedicatedOutputToVerification(input.candidate, response.output_parsed, sources);
  } catch {
    return buildVerificationResult({
      status: "error",
      price: null,
      currency: null,
      evidenceUrl: null,
      evidenceType: "none",
      productIdentityConfirmed: false,
      evidenceText: null,
      usedDedicatedSearch: true,
      identityConfirmationMethod: null,
    });
  }
}

export function applyVerifiedPriceToCandidate(
  candidate: ProductDiscoveryProduct,
  verification: CandidatePriceVerification
): ProductDiscoveryProduct {
  return {
    ...candidate,
    productUrl: candidate.productUrl,
    name: candidate.name,
    retailerDomain: candidate.retailerDomain,
    price: verification.price,
    currency: verification.currency,
    priceEvidence: verification.evidenceType === "none" ? "none" : verification.evidenceType,
  };
}

export async function verifyCandidatePrice(input: {
  client?: OpenAI;
  requestedItem: string;
  candidate: ProductDiscoveryProduct;
  allowlistDomains: string[];
  sources: ProductDiscoverySource[];
  allowDedicatedSearch?: boolean;
}): Promise<CandidatePriceVerification> {
  const cacheKey = verificationCacheKey(input.candidate.productUrl);
  const cached = priceVerificationCache.get(cacheKey);
  if (cached) return cached;

  const frozenCandidate: ProductDiscoveryProduct = {
    ...input.candidate,
    productUrl: input.candidate.productUrl,
    name: input.candidate.name,
    retailerDomain: input.candidate.retailerDomain,
  };

  const cachedEnrichment = getCachedCandidateEnrichment(frozenCandidate.productUrl);
  if (cachedEnrichment?.status === "success" && cachedEnrichment.price != null) {
    const fromCache = merchantEnrichmentToVerification(frozenCandidate, cachedEnrichment);
    if (fromCache) {
      priceVerificationCache.set(cacheKey, fromCache);
      return fromCache;
    }
  }

  const enrichment =
    cachedEnrichment ??
    (await enrichCandidatePage(frozenCandidate.productUrl, {
      allowlistDomains: input.allowlistDomains,
    }));
  const fromMerchant = merchantEnrichmentToVerification(frozenCandidate, enrichment);
  if (fromMerchant) {
    priceVerificationCache.set(cacheKey, fromMerchant);
    return fromMerchant;
  }

  const fromSources = sourceEvidenceToVerification(frozenCandidate, input.sources);
  if (fromSources) {
    priceVerificationCache.set(cacheKey, fromSources);
    return fromSources;
  }

  if (input.allowDedicatedSearch === false || !input.client) {
    const notFound = buildVerificationResult({
      status: "not_found",
      price: null,
      currency: null,
      evidenceUrl: null,
      evidenceType: "none",
      productIdentityConfirmed: false,
      evidenceText: null,
      usedDedicatedSearch: false,
      identityConfirmationMethod: null,
    });
    priceVerificationCache.set(cacheKey, notFound);
    return notFound;
  }

  const client =
    input.client ??
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY?.trim(),
      timeout: OPENAI_PRODUCT_SEARCH_TIMEOUT_MS,
      maxRetries: 0,
    });

  const dedicated = await dedicatedPriceVerificationSearch({
    client,
    requestedItem: input.requestedItem,
    candidate: frozenCandidate,
    allowlistDomains: input.allowlistDomains,
  });
  priceVerificationCache.set(cacheKey, dedicated);
  return dedicated;
}
