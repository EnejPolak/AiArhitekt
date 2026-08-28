import { validateAndNormalizeAllowlist, normalizeDomainToRoot } from "@/lib/serp/domains";
import { OPENAI_WEB_SEARCH_MAX_ALLOWED_DOMAINS } from "./constants";

export function normalizeProductDiscoveryAllowlist(domains: string[]): string[] {
  return validateAndNormalizeAllowlist(domains).slice(0, OPENAI_WEB_SEARCH_MAX_ALLOWED_DOMAINS);
}

export function domainAllowed(url: string, allowlistDomains: string[]): boolean {
  const domain = normalizeDomainToRoot(url);
  if (!domain) return false;
  return allowlistDomains.includes(domain);
}

export function normalizeUrlForEvidenceMatch(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    parsed.hash = "";
    const pathname = parsed.pathname.replace(/\/+$/, "") || "";
    return `${parsed.protocol}//${parsed.hostname}${pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function urlsEvidenceMatch(productUrl: string, sourceUrl: string): boolean {
  const product = normalizeUrlForEvidenceMatch(productUrl);
  const source = normalizeUrlForEvidenceMatch(sourceUrl);
  return product === source || product.startsWith(`${source}/`) || source.startsWith(`${product}/`);
}
