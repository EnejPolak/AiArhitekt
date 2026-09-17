/**
 * Merchant acquisition diagnostics (fetch outcomes / page shapes).
 * No anti-bot evasion. Challenge pages are classified, not bypassed.
 */

export type FetchBlockReason =
  | "FETCH_BLOCKED_403"
  | "FETCH_BLOCKED_401"
  | "FETCH_BLOCKED_429"
  | "FETCH_BLOCKED_CHALLENGE_PAGE"
  | "FETCH_BLOCKED_ROBOTS_OR_POLICY"
  | "FETCH_BLOCKED_REDIRECT_LOOP"
  | "FETCH_BLOCKED_ACCESS_DENIED_HTML"
  | "FETCH_BLOCKED_TIMEOUT"
  | "FETCH_BLOCKED_OTHER";

export type FetchSuccessKind =
  | "FETCH_SUCCESS_PRODUCT_HTML"
  | "FETCH_SUCCESS_JS_SHELL"
  | "FETCH_SUCCESS_NON_PRODUCT_PAGE";

export type MerchantAcquisitionSource =
  | "merchant_html"
  | "embedded_state"
  | "merchant_public_product_json"
  | "merchant_domain_adapter";

export type MerchantAdapterId = "bauhaus" | "obi" | "xxxlesnina" | null;

export type FullEvidenceBlocker =
  | "MISSING_PRICE"
  | "MISSING_MATERIAL"
  | "MISSING_COLOR_FINISH"
  | "MISSING_DIMENSIONS"
  | "MISSING_VARIANT_IDENTITY"
  | "MISSING_MULTIPLE"
  | "HARD_CONSTRAINT_MISS"
  | "FETCH_BLOCKED";

const CHALLENGE_TITLE_RE =
  /\b(varnostni\s+pregled|just\s+a\s+moment|attention\s+required|captcha|cf-browser-verification|security\s+check|checking\s+your\s+browser|enable\s+javascript\s+and\s+cookies)\b/i;

const ACCESS_DENIED_RE =
  /\b(access\s+denied|403\s+forbidden|request\s+blocked|not\s+authorized|permission\s+denied)\b/i;

const ROBOTS_POLICY_RE =
  /\b(robots\.txt|automated\s+access|bot\s+detected|scraping\s+not\s+allowed)\b/i;

const JS_SHELL_RE =
  /\b(__NEXT_DATA__|data-reactroot|ng-version|id=["']root["']|id=["']__nuxt["']|id=["']app["'])\b/i;

/**
 * Classify blocked / error HTML bodies (and titles) without trying to bypass them.
 */
export function classifyFetchBlock(input: {
  httpStatus: number | null;
  bodySnippet?: string | null;
  errorMessage?: string | null;
}): FetchBlockReason {
  const status = input.httpStatus;
  const snippet = `${input.bodySnippet ?? ""}\n${input.errorMessage ?? ""}`.slice(0, 8_000);

  if (status === 401) return "FETCH_BLOCKED_401";
  if (status === 429) return "FETCH_BLOCKED_429";
  if (/timeout|abort/i.test(input.errorMessage ?? "")) return "FETCH_BLOCKED_TIMEOUT";
  if (/redirect/i.test(input.errorMessage ?? "")) return "FETCH_BLOCKED_REDIRECT_LOOP";

  if (CHALLENGE_TITLE_RE.test(snippet)) return "FETCH_BLOCKED_CHALLENGE_PAGE";
  if (ROBOTS_POLICY_RE.test(snippet)) return "FETCH_BLOCKED_ROBOTS_OR_POLICY";
  if (status === 403) {
    // Bauhaus "Varnostni pregled", Cloudflare interstitial, etc.
    if (CHALLENGE_TITLE_RE.test(snippet) || /cloudflare|cf-ray|challenge/i.test(snippet)) {
      return "FETCH_BLOCKED_CHALLENGE_PAGE";
    }
    return "FETCH_BLOCKED_403";
  }
  if (ACCESS_DENIED_RE.test(snippet)) return "FETCH_BLOCKED_ACCESS_DENIED_HTML";
  return "FETCH_BLOCKED_OTHER";
}

/**
 * Distinguish usable product HTML from empty JS shells / non-product pages.
 */
export function classifyFetchSuccessHtml(html: string, opts?: { hasProductSignals?: boolean }): FetchSuccessKind {
  const head = html.slice(0, 40_000);
  const hasProductSignals =
    opts?.hasProductSignals === true ||
    /itemtype=["'][^"']*Product["']/i.test(html) ||
    /property=["']og:type["'][^>]*content=["']product["']/i.test(html) ||
    /application\/ld\+json[\s\S]{0,200}@type["']?\s*:\s*["']Product["']/i.test(html) ||
    /itemprop=["']price["'][^>]*content=["']\d/i.test(html) ||
    /property=["']product:price:amount["']/i.test(html);

  if (hasProductSignals) return "FETCH_SUCCESS_PRODUCT_HTML";

  const looksShell =
    JS_SHELL_RE.test(head) &&
    html.length < 25_000 &&
    !/<h1[\s>]/i.test(html) &&
    !/itemprop=["']name["']/i.test(html);
  if (looksShell) return "FETCH_SUCCESS_JS_SHELL";

  return "FETCH_SUCCESS_NON_PRODUCT_PAGE";
}

export function isChallengeOrBlockedDomainUnsupported(domainRoot: string): boolean {
  const d = domainRoot.replace(/^www\./i, "").toLowerCase();
  // Domains where every probe returns challenge/403 with no public product-data path.
  return d === "bauhaus.si" || d === "xxxlesnina.si";
}
