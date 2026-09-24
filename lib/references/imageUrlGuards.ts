/**
 * Client-safe product image URL guards (no SSRF / node:dns).
 */
const REJECT_IMAGE_URL =
  /(?:^|\/)(?:logo|favicon|sprite|placeholder|tracking|pixel|spacer|blank|icon)(?:[-_/]|\b)|\/menu\/|(?:legal[-_]?guarantee|instruction(?:s|[-_]?sheet)?|datasheet|packing(?:[-_]?list)?|user[-_]?manual)|(?:^|\/)notice|\.(?:svg|ico)(?:$|[?#])/i;
const REJECT_IMAGE_EXT = /\.(?:svg|ico|gif)(?:$|[?#])/i;
const REJECT_UNRESOLVED_TEMPLATE = /[(){}]|\$\{|\{\{|<%/;

export function isCandidateProductImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (REJECT_IMAGE_URL.test(parsed.pathname) || REJECT_IMAGE_EXT.test(parsed.pathname)) return false;
    if (REJECT_IMAGE_URL.test(parsed.search)) return false;
    if (
      REJECT_UNRESOLVED_TEMPLATE.test(parsed.pathname) ||
      REJECT_UNRESOLVED_TEMPLATE.test(parsed.search)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * True only when the merchant fetch landed on the same direct product path.
 * Category / listing redirects (shorter ancestor paths) are rejected.
 */
export function isSameDirectProductPage(requestedUrl: string, finalUrl: string): boolean {
  try {
    const requested = new URL(requestedUrl);
    const finalPage = new URL(finalUrl);
    const hostA = requested.hostname.replace(/^www\./i, "").toLowerCase();
    const hostB = finalPage.hostname.replace(/^www\./i, "").toLowerCase();
    if (hostA !== hostB) return false;
    const pathA = requested.pathname.replace(/\/+$/, "") || "/";
    const pathB = finalPage.pathname.replace(/\/+$/, "") || "/";
    return pathA === pathB;
  } catch {
    return false;
  }
}
