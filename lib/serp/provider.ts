/**
 * SERP provider client
 * Fetches results from SerpAPI; optional domain allowlist filters results
 */

import { normalizeDomainToRoot } from "./domains";
import type { SerpOrganicResult } from "./pickBest";

export interface FetchSerpOptions {
  /** When set, only results from these domains are returned */
  allowedDomains?: string[];
  /** Request timeout in ms (default 18000). Use 10000 for fast mode. */
  timeoutMs?: number;
}

/**
 * Fetch SERP results from SerpAPI; optionally filter by allowedDomains
 */
export async function fetchSerp(
  query: string,
  options: FetchSerpOptions = {}
): Promise<SerpOrganicResult[]> {
  if (!process.env.SERPAPI_KEY) {
    throw new Error("SERPAPI_KEY not configured");
  }

  const results = await fetchSerpInternal(query, false, options.timeoutMs);
  const { allowedDomains } = options;
  if (!allowedDomains || allowedDomains.length === 0) {
    return results;
  }
  const allowedSet = new Set(allowedDomains.map(normalizeDomainToRoot).filter(Boolean));
  return results.filter((r) => {
    const d = normalizeDomainToRoot(r.link);
    return d != null && allowedSet.has(d);
  });
}

const DEFAULT_TIMEOUT_MS = 18000; // 18s — SerpAPI can be slow under load

/**
 * Internal fetch function (with one retry on timeout).
 */
async function fetchSerpInternal(
  query: string,
  retried = false,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<SerpOrganicResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://serpapi.com/search.json?engine=google&q=${encodedQuery}&location=Slovenia&hl=sl&gl=si&num=10&api_key=${process.env.SERPAPI_KEY}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`SERP API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const organic: SerpOrganicResult[] = (data.organic_results || [])
      .map((item: any) => {
        const priceRaw = item.price ?? item.rich_snippet?.price ?? item.rich_snippets?.top?.price;
        const priceStr = typeof priceRaw === "string" ? priceRaw : priceRaw?.value ?? undefined;
        return {
          title: item.title || "",
          link: item.link || "",
          snippet: item.snippet || "",
          price: priceStr ?? (typeof item.price === "string" ? item.price : undefined),
          image: item.thumbnail ?? item.image ?? undefined,
          richSnippetPrice: typeof priceRaw === "string" ? priceRaw : priceRaw?.value ?? undefined,
        };
      })
      .filter((item: SerpOrganicResult) => item.link.length > 0);

    return organic;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      if (!retried) {
        return fetchSerpInternal(query, true, timeoutMs);
      }
      throw new Error("SERP API request timeout");
    }
    throw error;
  }
}
