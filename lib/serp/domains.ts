/**
 * Domain normalization and cache key for SERP (query + allowlist).
 * Uses tldts for registrable domain (ccTLD-safe: co.uk, com.au, etc.).
 */

import { parse } from "tldts";
import crypto from "crypto";

/**
 * Normalize URL or domain to registrable root: lowercase, strip www, no path.
 * Returns only p.domain (registrable domain); if empty, returns "" so filter/allowlist drop it.
 * No hostname fallback — we want root domain, not random host or IP.
 */
export function normalizeDomainToRoot(urlOrDomain: string): string {
  if (!urlOrDomain || !urlOrDomain.trim()) return "";
  const s = urlOrDomain.trim().toLowerCase();
  const p = parse(s.startsWith("http") ? s : `https://${s}`);
  return (p.domain || "").replace(/^www\./, "").trim();
}

/** Alias for callers that still use the old name. */
export const normalizeDomain = normalizeDomainToRoot;

/**
 * Require at least 2 labels (e.g. example.com); reject localhost, single-word, and IPs.
 */
export function isSaneHostname(domain: string): boolean {
  const d = normalizeDomainToRoot(domain);
  if (!d || d.length > 253) return false;
  if (/\s/.test(d)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) return false; // reject IP for allowlist
  const labels = d.split(".");
  if (labels.length < 2) return false;
  return labels.every(
    (l) =>
      l.length > 0 &&
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(l)
  );
}

/**
 * Validate and normalize allowlist: keeps only sane hostnames, lowercase, no www, dedupe.
 * Invalid entries are ignored.
 */
export function validateAndNormalizeAllowlist(domains: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of domains) {
    const n = normalizeDomainToRoot(d);
    if (!n) continue;
    if (!isSaneHostname(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function hash(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
}

/**
 * Cache key for SERP: hashed query + hashed normalized allowlist (keeps keys short).
 */
export function serpCacheKey(query: string, allowedDomains: string[]): string {
  const normalized = [...new Set(allowedDomains.map(normalizeDomainToRoot).filter(Boolean))].sort();
  return `serp:q=${hash(query)}:a=${hash(normalized.join(","))}`;
}
