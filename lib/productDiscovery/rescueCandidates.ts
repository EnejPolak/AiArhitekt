import { normalizeDomainToRoot } from "@/lib/serp/domains";
import type { CandidateEnrichment } from "./enrichCandidate";
import { RESCUE_MAX_CANDIDATES } from "./constants";
import { enrichmentCacheKey } from "./enrichmentCacheKey";
import {
  diversifyDiscoveryCandidates,
  scoreConstraintAwareDiscovery,
} from "./discoveryScore";
import { domainAllowed } from "./domains";
import type { ProductDiscoverySource } from "./types";

export type RescueCandidate = {
  id: string;
  url: string;
  domain: string;
  sourceTitle: string | null;
  sourceEvidence: string | null;
  preRankScore: number;
  enrichment: CandidateEnrichment | null;
  /** Serp snippet price when candidate originates from SerpAPI fallback. */
  serpSnippetPrice?: number | null;
  serpSnippetCurrency?: string | null;
};

const PRODUCT_PATH_PATTERN =
  /\/(p|product|products|izdelek|artikel|prod|item|sku|trgovina)\/|\/p\/[^/?#]+/i;
const JUNK_PATH_PATTERN =
  /(\.pdf$|\/blog\b|\/news\b|\/inspir|\/clanek|\/search\b|\/kategorij|\/category\b|\/c\/\d|\/media\/|\/datoteke\/|\/wp-content\/)/i;

function evidenceFromSource(url: string, title: string | null): string | null {
  const parts: string[] = [];
  if (title?.trim()) parts.push(title.trim());
  try {
    const path = decodeURIComponent(new URL(url).pathname)
      .split("/")
      .filter(Boolean)
      .slice(-2)
      .join(" ")
      .replace(/[-_+.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (path) parts.push(path);
  } catch {
    // ignore malformed URLs
  }
  return parts.length ? parts.join(" — ") : null;
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

export function scoreProductPageLikelihood(url: string, title: string | null): number {
  let score = 0;
  const path = pathnameOf(url);

  if (PRODUCT_PATH_PATTERN.test(path) || PRODUCT_PATH_PATTERN.test(url)) score += 35;
  if (/\/p\/[^/?#]+/i.test(path)) score += 15;
  if (JUNK_PATH_PATTERN.test(url) || JUNK_PATH_PATTERN.test(path)) score -= 60;
  if (!path || path === "/") score -= 50;
  if (title && title.trim().length > 3) score += 5;

  return score;
}

export function scoreCandidateRelevance(
  url: string,
  title: string | null,
  requestedItem: string,
  snippet?: string | null
): number {
  // Constraint-aware discovery score (enrichment priority only — not acceptance).
  return scoreConstraintAwareDiscovery({
    url,
    title,
    snippet: snippet ?? null,
    requestedItem,
  }).score;
}

export function isConfidentNonProductUrl(url: string): boolean {
  const path = pathnameOf(url);
  if (!path || path === "/") return true;
  if (/\.pdf$/i.test(url)) return true;
  if (/\/(blog|news|inspir|clanek)\b/i.test(path)) return true;
  if (/\/c\/\d/i.test(path)) return true;
  if (/\/c\/[^/]+/i.test(path) && !PRODUCT_PATH_PATTERN.test(path)) return true;
  return false;
}

export function buildRescueCandidates(input: {
  sources: ProductDiscoverySource[];
  allowlistDomains: string[];
  requestedItem: string;
  maxCandidates?: number;
}): RescueCandidate[] {
  const maxCandidates = input.maxCandidates ?? RESCUE_MAX_CANDIDATES;
  const seen = new Set<string>();
  const scored: RescueCandidate[] = [];

  for (const source of input.sources) {
    if (!source.url?.startsWith("http")) continue;
    if (!domainAllowed(source.url, input.allowlistDomains)) continue;
    if (isConfidentNonProductUrl(source.url)) continue;

    const key = enrichmentCacheKey(source.url);
    if (seen.has(key)) continue;
    seen.add(key);

    const domain = normalizeDomainToRoot(source.url);
    if (!domain) continue;

    const preRankScore = scoreCandidateRelevance(
      source.url,
      source.title,
      input.requestedItem,
      source.snippet
    );
    scored.push({
      id: "",
      url: source.url,
      domain,
      sourceTitle: source.title,
      sourceEvidence: evidenceFromSource(source.url, source.title),
      preRankScore,
      enrichment: null,
    });
  }

  scored.sort((a, b) => b.preRankScore - a.preRankScore);
  const top = diversifyDiscoveryCandidates(scored, maxCandidates, {
    maxPerDomain: 2,
    maxUnsupported: 2,
  });
  return top.map((candidate, index) => ({
    ...candidate,
    id: `candidate_${index + 1}`,
  }));
}

export function rescueCandidateMap(
  candidates: RescueCandidate[]
): Map<string, RescueCandidate> {
  return new Map(candidates.map((candidate) => [candidate.id, candidate]));
}

export function merchantEvidenceText(candidate: RescueCandidate): string {
  const parts: string[] = [];
  if (candidate.sourceTitle) parts.push(`Source title: ${candidate.sourceTitle}`);
  if (candidate.sourceEvidence) parts.push(`Source evidence: ${candidate.sourceEvidence}`);

  const e = candidate.enrichment;
  if (e?.status === "success") {
    parts.push("Merchant page enrichment:");
    if (e.pageTitle) parts.push(`Page title: ${e.pageTitle}`);
    if (e.productName) parts.push(`Product name: ${e.productName}`);
    if (e.brand) parts.push(`Brand: ${e.brand}`);
    if (e.price != null && e.currency) parts.push(`Price: ${e.price} ${e.currency}`);
    if (e.availability) parts.push(`Availability: ${e.availability}`);
    if (e.sku) parts.push(`SKU: ${e.sku}`);
    const labeled = (e.labeledSpecs ?? [])
      .map((spec) => spec.text)
      .filter(Boolean)
      .slice(0, 24);
    if (labeled.length > 0) parts.push(`Labeled specs: ${labeled.join(" | ")}`);
    if (e.productText) parts.push(`Page text: ${e.productText.slice(0, 2500)}`);
  } else if (e) {
    parts.push(`Merchant enrichment status: ${e.status}`);
  }

  return parts.join("\n");
}

export function verifiedMerchantPrice(candidate: RescueCandidate): {
  price: number | null;
  currency: string | null;
} {
  if (candidate.enrichment?.status === "success" && candidate.enrichment.price != null) {
    return {
      price: candidate.enrichment.price,
      currency: candidate.enrichment.currency,
    };
  }
  return { price: null, currency: null };
}

export function verifiedMerchantImage(candidate: RescueCandidate): string | null {
  if (candidate.enrichment?.status === "success" && candidate.enrichment.imageUrl) {
    return candidate.enrichment.imageUrl;
  }
  return null;
}

/** @deprecated use merchantEvidenceText */
export function priceSupportedByCandidateEvidence(
  price: number | null,
  candidate: RescueCandidate
): boolean {
  if (price == null) return true;
  const haystack = merchantEvidenceText(candidate).toLowerCase();
  const variants = [
    price.toFixed(2),
    price.toFixed(2).replace(".", ","),
    String(Math.round(price)),
  ];
  return variants.some((variant) => haystack.includes(variant));
}
