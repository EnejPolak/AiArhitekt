/**
 * Cache-key helpers for merchant enrichment.
 * Strip tracking params; preserve variant-identifying query params.
 */
const TRACKING_PARAM_RE =
  /^(utm_|utm$|gclid|fbclid|mc_|msclkid|yclid|_ga|igshid|ref$|referrer$|srsltid)/i;

const VARIANT_IDENTITY_PARAM_RE =
  /^(sku|variant|vid|pid|product[_-]?id|color|colour|size|material|finish|option|selected|attribute)/i;

export function enrichmentCacheKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    let pathname = parsed.pathname.replace(/\/{2,}/g, "/");
    if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "");
    // Keep only variant/identity params; drop tracking and unrelated noise.
    const kept: Array<[string, string]> = [];
    for (const [key, value] of parsed.searchParams.entries()) {
      if (TRACKING_PARAM_RE.test(key)) continue;
      if (!VARIANT_IDENTITY_PARAM_RE.test(key)) continue;
      kept.push([key.toLowerCase(), value]);
    }
    kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
    const search = kept.length
      ? `?${kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`
      : "";
    const protocol = parsed.protocol === "http:" ? "http:" : "https:";
    return `${protocol}//${host}${pathname || "/"}${search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}
