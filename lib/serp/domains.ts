/**
 * Domain normalization and cache key for SERP (query + allowlist)
 */

/**
 * Normalize URL or domain to a comparable form: lowercase, strip www, no path
 */
export function normalizeDomain(urlOrDomain: string): string {
  if (!urlOrDomain || !urlOrDomain.trim()) return "";
  let s = urlOrDomain.trim().toLowerCase();
  try {
    if (!s.startsWith("http")) s = `https://${s}`;
    const u = new URL(s);
    let host = u.hostname.replace(/^www\./, "");
    return host;
  } catch {
    // Not a URL; treat as domain
    return s.replace(/^www\./, "").split("/")[0];
  }
}

/**
 * Build cache key for SERP: query + sorted normalized allowlist (stable hash)
 */
export function serpCacheKey(query: string, allowedDomains: string[]): string {
  const normalized = [...new Set(allowedDomains.map(normalizeDomain).filter(Boolean))].sort();
  const allowlistPart = normalized.length ? normalized.join(",") : "";
  return `serp:${query}:${allowlistPart}`;
}
