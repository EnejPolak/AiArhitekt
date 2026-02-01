/**
 * SERP provider client
 * Fetches results from SerpAPI; optional domain allowlist filters results
 */

import { normalizeDomain } from "./domains";
import type { SerpOrganicResult } from "./pickBest";

export interface FetchSerpOptions {
  /** When set, only results from these domains are returned */
  allowedDomains?: string[];
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

  const results = await fetchSerpInternal(query);
  const { allowedDomains } = options;
  if (!allowedDomains || allowedDomains.length === 0) {
    return results;
  }
  const allowedSet = new Set(allowedDomains.map(normalizeDomain).filter(Boolean));
  return results.filter((r) => {
    const d = normalizeDomain(r.link);
    return d != null && allowedSet.has(d);
  });
}

/**
 * Internal fetch function
 */
async function fetchSerpInternal(query: string): Promise<SerpOrganicResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://serpapi.com/search.json?engine=google&q=${encodedQuery}&location=Slovenia&hl=sl&gl=si&num=10&api_key=${process.env.SERPAPI_KEY}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

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
      .map((item: any) => ({
        title: item.title || "",
        link: item.link || "",
        snippet: item.snippet || "",
        price: item.price ?? undefined,
        image: item.thumbnail ?? item.image ?? undefined,
      }))
      .filter((item: SerpOrganicResult) => item.link.length > 0);

    return organic;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      throw new Error("SERP API request timeout");
    }
    throw error;
  }
}
