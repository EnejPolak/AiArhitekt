/**
 * Lightweight check: does the website homepage suggest a product catalog?
 * Returns a 3-state signal so fetch instability does not flip classification.
 */

const CATALOG_PATTERNS = [
  "shop",
  "product",
  "catalog",
  "store",
  "webshop",
  "eshop",
  "cart",
  "checkout",
];

const SCHEMA_PATTERNS = ['"@type":"Product"', '"@type":"Offer"', '"@type": "Product"', '"@type": "Offer"'];

const FETCH_TIMEOUT_MS = 3000;
const MAX_BODY_LENGTH = 120000; // ~120KB

export type CatalogSignalResult = true | false | "unknown";

export interface CatalogProbe {
  ok: boolean;
  status?: number;
  finalUrl?: string;
  reason?: string;
}

export interface CatalogCheckResult {
  signal: CatalogSignalResult;
  probe?: CatalogProbe;
}

interface CacheEntry {
  signal: CatalogSignalResult;
  probe?: CatalogProbe;
  expiresAt: number;
}

const cacheByDomain = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch homepage HTML (lightweight) and detect product/catalog signals.
 * Returns { signal: true | false | "unknown", probe? }.
 * "unknown" when HTTP fetch fails (timeout, non-200, blocked, too many redirects).
 */
export async function checkProductCatalogSignal(websiteUrl: string): Promise<CatalogCheckResult> {
  if (!websiteUrl || !websiteUrl.trim()) {
    return { signal: "unknown", probe: { ok: false, reason: "empty_url" } };
  }
  let domain: string;
  try {
    const u = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`);
    domain = u.hostname.toLowerCase();
  } catch {
    return { signal: "unknown", probe: { ok: false, reason: "invalid_url" } };
  }

  const now = Date.now();
  const cached = cacheByDomain.get(domain);
  if (cached && cached.expiresAt > now) {
    return { signal: cached.signal, probe: cached.probe };
  }

  let result: CatalogCheckResult = { signal: "unknown", probe: { ok: false, reason: "fetch_failed" } };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PlaceCatalogCheck/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    const finalUrl = res.url || url;
    const status = res.status;

    if (!res.ok) {
      result = {
        signal: "unknown",
        probe: { ok: false, status, finalUrl, reason: `http_${status}` },
      };
      cacheByDomain.set(domain, { signal: "unknown", probe: result.probe, expiresAt: now + CACHE_TTL_MS });
      return result;
    }

    const text = await res.text();
    const slice = text.slice(0, MAX_BODY_LENGTH).toLowerCase();
    let signal: boolean = false;

    for (const p of CATALOG_PATTERNS) {
      if (slice.includes(p)) {
        signal = true;
        break;
      }
    }
    if (!signal) {
      for (const p of SCHEMA_PATTERNS) {
        if (text.includes(p)) {
          signal = true;
          break;
        }
      }
    }

    result = {
      signal: signal ? true : false,
      probe: { ok: true, status, finalUrl },
    };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.name : "error";
    result = {
      signal: "unknown",
      probe: { ok: false, reason: reason === "AbortError" ? "timeout" : reason },
    };
  }

  cacheByDomain.set(domain, {
    signal: result.signal,
    probe: result.probe,
    expiresAt: now + CACHE_TTL_MS,
  });
  return result;
}

/**
 * @deprecated Use checkProductCatalogSignal for 3-state + probe. Kept for backward compat.
 */
export async function hasProductCatalogSignal(websiteUrl: string): Promise<boolean> {
  const { signal } = await checkProductCatalogSignal(websiteUrl);
  return signal === true;
}
