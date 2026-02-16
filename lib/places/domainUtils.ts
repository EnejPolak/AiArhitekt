/**
 * Domain normalization and reject list for D) Places.
 * Extract root domain (eTLD+1 style); reject social/directory/aggregator.
 */

/** Domains that must never appear in allowlists (social, directories, aggregators, maps). */
export const REJECTED_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "google.com",
  "maps.google.com",
  "youtu.be",
  "youtube.com",
  "bizi.si",
  "najdi.si",
  "bolha.com",
  "avto.net",
  "mimovrste.com",
  "yelp.com",
  "foursquare.com",
  "tripadvisor.com",
  "rumene-strani.si",
  "cylex.si",
  "biznis.si",
  "cylex.at",
  "cylex.de",
  "slovenskenovice.si",
  "podjetnik.com",
  "zrs.si",
  "mojepodjetje.si",
  "pg.si",
  "hotfrog.",
  "brownbook.net",
  "tuugo.",
  "yell.com",
  "thomsonlocal.com",
  "find-open.co.uk",
  "eniro.",
  "11880.com",
  "dasoertliche.",
  "goldenpages.",
] as const;

/**
 * Normalize URL to root domain: strip protocol, www, path, query, fragment.
 * Punycode-safe (URL API handles IDN). Returns lowercase hostname.
 */
export function normalizeDomainToRoot(urlOrDomain: string): string {
  if (!urlOrDomain || !String(urlOrDomain).trim()) return "";
  let s = String(urlOrDomain).trim();
  try {
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    const u = new URL(s);
    let host = u.hostname.replace(/^www\./, "").toLowerCase();
    return host;
  } catch {
    const fallback = s.replace(/^https?:\/\//i, "").split("/")[0].split("?")[0].replace(/^www\./, "").toLowerCase();
    return fallback || "";
  }
}

/**
 * True if domain is on the reject list (social, directory, aggregator, maps).
 */
export function isRejectedDomain(domain: string): boolean {
  const d = normalizeDomainToRoot(domain);
  if (!d) return true;
  for (const rej of REJECTED_DOMAINS) {
    if (d === rej || d.endsWith("." + rej) || (rej.endsWith(".") && d.includes(rej))) return true;
  }
  return false;
}
