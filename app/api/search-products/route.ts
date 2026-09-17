import { NextResponse } from "next/server";
import { normalizeSerpApiResponse } from "@/lib/serp/normalize";
import { requireSpendRouteAuth } from "@/lib/api/spendAuth";
import { sanitizedInternalErrorResponse } from "@/lib/api/publicError";

export const runtime = "nodejs";

// Hard limits
const MAX_SERP_CALLS = 12;
const RESULTS_PER_CALL = 10;
const PAGES = 1;

// Category to store mapping
const CATEGORY_STORE_MAPPING: Record<string, string[]> = {
  "Paint & Wall Finishes": ["Merkur", "Bauhaus"],
  "Flooring": ["Bauhaus", "Merkur"],
  "Furniture": ["IKEA", "JYSK", "mömax", "Lesnina"],
  "Lighting": ["IKEA", "JYSK", "Harvey Norman"],
  "Decor & Accessories": ["IKEA", "JYSK", "Lesnina"],
};

export async function POST(req: Request) {
  const auth = await requireSpendRouteAuth();
  if (!auth.ok) return auth.response;
  try {
    if (!process.env.SERPAPI_KEY) {
      return NextResponse.json({ error: "SERPAPI_KEY not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { roomType, selectedDesign, preferences, budgetPlan, localStores } = body;

    if (!budgetPlan?.caps || !localStores || !Array.isArray(localStores)) {
      return NextResponse.json({ error: "budgetPlan.caps and localStores are required" }, { status: 400 });
    }

    const candidatesByCategory: Record<string, Array<{
      name: string;
      price: number;
      url: string;
      imageUrl: string | null;
      store: string;
    }>> = {};

    let serpCallCount = 0;

    // For each category in budget plan
    for (const [category, cap] of Object.entries(budgetPlan.caps)) {
      const capValue = cap as { max: number; qty: number };
      if (serpCallCount >= MAX_SERP_CALLS) break;

      const storesForCategory = CATEGORY_STORE_MAPPING[category] || [];
      const relevantStores = localStores.filter((s: any) =>
        storesForCategory.some((storeName) => s.name.toLowerCase().includes(storeName.toLowerCase()))
      );

      if (relevantStores.length === 0) continue;

      // Take top 1-2 stores for this category
      const storesToSearch = relevantStores.slice(0, 2);

      for (const store of storesToSearch) {
        if (serpCallCount >= MAX_SERP_CALLS) break;

        // Build search query
        const query = `${category} ${roomType} site:${store.website || store.name}`;
        
        try {
          const serpUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${process.env.SERPAPI_KEY}&num=${RESULTS_PER_CALL}`;
          
          const response = await fetch(serpUrl);
          const data = await response.json();

          serpCallCount++;

          const organic = normalizeSerpApiResponse(data);
          if (organic.length === 0) continue;

          const products: Array<{
            name: string;
            price: number;
            url: string;
            imageUrl: string | null;
            store: string;
          }> = [];

          for (const result of organic) {
            if (!result.title?.trim() || !result.link) continue;

            let price = 0;
            const priceMatch = `${result.title} ${result.snippet || ""} ${result.price || ""}`.match(
              /[\d,]+\.?\d*\s*€/
            );
            if (priceMatch) {
              price = parseFloat(priceMatch[0].replace(/[^\d.,]/g, "").replace(",", "."));
            }

            // Hard filter: price must be <= per_item_max; skip if price is unavailable
            if (price > 0 && price <= capValue.max) {
              products.push({
                name: result.title,
                price,
                url: result.link,
                imageUrl: result.image ?? null,
                store: store.name,
              });
            }

            if (products.length >= 3) break;
          }

          if (!candidatesByCategory[category]) {
            candidatesByCategory[category] = [];
          }
          candidatesByCategory[category].push(...products);

          // Deduplicate by URL
          const seen = new Set<string>();
          candidatesByCategory[category] = candidatesByCategory[category].filter((p) => {
            if (seen.has(p.url)) return false;
            seen.add(p.url);
            return true;
          });
        } catch (err) {
          console.warn(`SERP search failed for ${store.name}:`, err);
        }
      }
    }

    return NextResponse.json({ candidatesByCategory });
  } catch (error: unknown) {
    return sanitizedInternalErrorResponse("Search products error:", error);
  }
}
