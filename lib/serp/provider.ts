/**
 * SERP provider client
 * Fetches results from SerpAPI
 */

import type { SerpOrganicResult } from "./pickBest";

/**
 * Fetch SERP results from SerpAPI with domain fallback
 */
export async function fetchSerp(query: string): Promise<SerpOrganicResult[]> {
  if (!process.env.SERPAPI_KEY) {
    throw new Error("SERPAPI_KEY not configured");
  }

  // Check if query uses lesnina.si (unreliable) and needs fallback
  const hasLesninaSi = /site:lesnina\.si/i.test(query);
  
  // Try primary query
  let organic = await fetchSerpInternal(query);
  
  // If query uses lesnina.si and got 0 results, retry with xxxlesnina.si
  if (hasLesninaSi && organic.length === 0) {
    const fallbackQuery = query.replace(/site:lesnina\.si/gi, "site:xxxlesnina.si");
    organic = await fetchSerpInternal(fallbackQuery);
  }
  
  return organic;
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

    // Parse organic results
    const organic: SerpOrganicResult[] = (data.organic_results || [])
      .map((item: any) => ({
        title: item.title || "",
        link: item.link || "",
        snippet: item.snippet || "",
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
