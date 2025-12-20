/**
 * ============================================
 * SEARCH MODULE (SerpAPI)
 * ============================================
 * 
 * Responsibility: Perform REAL Google searches for products.
 * 
 * RULES:
 * - SerpAPI is the ONLY source of real product links
 * - URLs are NEVER guessed or constructed
 * - If no exact product page exists → product DOES NOT EXIST
 * - Filter ONLY product pages
 */

import { getJson } from "serpapi";
import { SearchIntent, VerifiedProduct } from "./types";

// Known Slovenian stores to search
const SLOVENIAN_STORES = [
  "merkur.si",
  "bauhaus.si",
  "jysk.si",
  "lesnina.si",
  "momax.si",
  "jub.si",
  "helios.si",
  "ikea.com", // IKEA delivers to Slovenia
];

/**
 * Builds site filter for SerpAPI query
 */
function buildSiteFilter(): string {
  return SLOVENIAN_STORES.map((store) => `site:${store}`).join(" OR ");
}

/**
 * Checks if URL is a product page (not category, blog, homepage)
 */
function isProductPage(url: string): boolean {
  // Reject homepages
  if (url.match(/^https?:\/\/[^/]+\/?$/)) {
    return false;
  }

  // Reject search pages
  if (url.includes("/search") || url.includes("?q=") || url.includes("&q=")) {
    return false;
  }

  // Reject category pages (common patterns)
  const categoryPatterns = [
    "/kategorije/",
    "/categories/",
    "/kategorija/",
    "/category/",
    "/katalog/",
    "/catalog/",
  ];
  
  if (categoryPatterns.some((pattern) => url.toLowerCase().includes(pattern))) {
    return false;
  }

  // Reject blog pages
  if (url.includes("/blog/") || url.includes("/novice/") || url.includes("/news/")) {
    return false;
  }

  // Accept if it's from a known store and looks like a product page
  const isFromKnownStore = SLOVENIAN_STORES.some((store) => url.includes(store));
  
  return isFromKnownStore;
}

/**
 * Extracts store name from URL
 */
function extractStoreName(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // Extract store name from domain
    for (const store of SLOVENIAN_STORES) {
      if (hostname.includes(store.replace(".si", "").replace(".com", ""))) {
        return store.split(".")[0].charAt(0).toUpperCase() + store.split(".")[0].slice(1);
      }
    }
    
    return hostname.split(".")[0] || "Unknown";
  } catch {
    return "Unknown";
  }
}

/**
 * Searches for products using SerpAPI
 */
export async function searchProducts(
  intent: SearchIntent,
  apiKey: string
): Promise<VerifiedProduct[]> {
  const allProducts: VerifiedProduct[] = [];

  // Process each category
  for (const [category, queries] of Object.entries(intent.categories)) {
    // Process each query in the category
    for (const query of queries) {
      try {
        // Build query with site filter
        const siteFilter = buildSiteFilter();
        const fullQuery = `${query} (${siteFilter})`;

        console.log(`[SEARCH] Searching: "${fullQuery}" (category: ${category})`);

        const params = {
          engine: "google",
          q: fullQuery,
          api_key: apiKey,
          google_domain: "google.si",
          gl: "si", // Country: Slovenia
          hl: "sl", // Language: Slovenian
          device: "desktop",
          num: 20, // Get more results to filter
        };

        const response = await getJson(params);

        // Extract organic results
        if (response.organic_results && Array.isArray(response.organic_results)) {
          for (const result of response.organic_results) {
            const link = result.link || "";
            
            // Only keep product pages
            if (isProductPage(link)) {
              allProducts.push({
                title: result.title || "",
                link: link,
                snippet: result.snippet || "",
                source: extractStoreName(link),
                category: category,
                query: query,
              });
            }
          }
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error: any) {
        console.error(`[SEARCH] Error searching "${query}":`, error.message);
        // Continue with other queries even if one fails
      }
    }
  }

  console.log(`[SEARCH] Found ${allProducts.length} verified product pages`);
  return allProducts;
}
