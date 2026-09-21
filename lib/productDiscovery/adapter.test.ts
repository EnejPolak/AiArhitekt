import { describe, expect, it } from "vitest";
import { productDiscoveryResultToCanonicalItem, STEP_C_MAX_CANDIDATES } from "./adapter";
import { buildStepCCandidateProducts } from "./stepCCandidates";
import type { ProductDiscoveryProduct, ProductDiscoveryResult } from "./types";
import { rankRequirementCandidates } from "@/lib/discovery/style/rankCandidates";
import type { SearchableRequirement } from "@/lib/discovery/itemSpecs";
import type { PlaceResult } from "@/lib/places/placesService";

function product(name: string, url: string, score: number, extras: Partial<ProductDiscoveryProduct> = {}): ProductDiscoveryProduct {
  return {
    name,
    retailer: "Local Home",
    retailerDomain: "localhome.si",
    productUrl: url,
    price: 199,
    currency: "EUR",
    priceUnit: null,
    imageUrl: `https://cdn.localhome.si/${name}.jpg`,
    specifications: {},
    matchScore: score,
    matchedRequirements: ["sofa"],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: "sofa",
    category: "sofa",
    ...extras,
  };
}

const store: PlaceResult = {
  name: "Local Home Store",
  place_id: "place-1",
  rating: 4.4,
  user_ratings_total: 12,
  distanceKm: 2.1,
  website: "https://www.localhome.si",
  websiteDomain: "localhome.si",
  categoryBucket: "store",
  types: ["furniture_store"],
  qualityFlags: {
    officialSite: true,
    hasCatalogSignal: true,
    isDirectoryOrSocial: false,
    isAggregator: false,
  },
};

const sofaRequirement: SearchableRequirement = {
  requirementType: "furniture",
  requirementKey: "furniture:sofa:0",
  itemSpec: "sofa",
  queryPlan: ["sofa"],
  snapshot: { category: "sofa", quantity: 1, placementNotes: null, constraints: [] },
};

describe("productDiscoveryResultToCanonicalItem", () => {
  it("G. OpenAI Step C candidate parsing supports 3–5 candidates", () => {
    const result: ProductDiscoveryResult = {
      requestedItem: "sofa",
      status: "found",
      product: product("Sofa A", "https://www.localhome.si/p/a", 0.9, { sku: "SOFA-A" }),
      candidates: [
        product("Sofa B", "https://www.localhome.si/p/b", 0.8, { sku: "SOFA-B" }),
        product("Sofa C", "https://www.localhome.si/p/c", 0.7),
        product("Sofa D", "https://www.localhome.si/p/d", 0.6),
        product("Sofa E", "https://www.localhome.si/p/e", 0.5),
        product("Sofa F overflow", "https://www.localhome.si/p/f", 0.4),
      ],
      sources: [{ title: "Sofa A", url: "https://www.localhome.si/p/a" }],
    };
    const canonical = productDiscoveryResultToCanonicalItem(result);
    expect(STEP_C_MAX_CANDIDATES).toBe(5);
    expect(canonical.picked?.url).toBe("https://www.localhome.si/p/a");
    expect(canonical.topCandidates).toHaveLength(5);
    expect(canonical.topCandidates.map((item) => item.url)).toEqual([
      "https://www.localhome.si/p/a",
      "https://www.localhome.si/p/b",
      "https://www.localhome.si/p/c",
      "https://www.localhome.si/p/d",
      "https://www.localhome.si/p/e",
    ]);
    expect(buildStepCCandidateProducts(result).every((item) => item.rank && item.category === "sofa")).toBe(
      true
    );
  });

  it("builds a bounded pool from product-like sources when the model returns only a winner", () => {
    const result: ProductDiscoveryResult = {
      requestedItem: "sofa",
      status: "found",
      product: product("Sofa A", "https://www.localhome.si/p/a", 0.9),
      sources: [
        { title: "Sofa A", url: "https://www.localhome.si/p/a" },
        { title: "Sofa B", url: "https://www.localhome.si/p/b", snippet: "beige sofa" },
        { title: "Sofa C", url: "https://www.localhome.si/p/c" },
        { title: "Category", url: "https://www.localhome.si/kategorije/sofas" },
      ],
    };
    const canonical = productDiscoveryResultToCanonicalItem(result);
    expect(canonical.topCandidates.length).toBeGreaterThanOrEqual(3);
    expect(canonical.topCandidates.length).toBeLessThanOrEqual(5);
    expect(canonical.topCandidates.map((item) => item.url)).toContain("https://www.localhome.si/p/b");
    expect(canonical.topCandidates.map((item) => item.url)).not.toContain(
      "https://www.localhome.si/kategorije/sofas"
    );
  });

  it("H. SERP and OpenAI candidate pools normalize into the same RankedProductCandidate structure", () => {
    const openai = productDiscoveryResultToCanonicalItem({
      requestedItem: "sofa",
      status: "found",
      product: product("Beige sofa", "https://www.localhome.si/p/a", 0.9),
      candidates: [
        product("Grey sofa", "https://www.localhome.si/p/b", 0.8),
        product("Oak sofa", "https://www.localhome.si/p/c", 0.7),
      ],
      sources: [],
    });
    const serpRow = {
      item: "sofa",
      picked: openai.picked,
      topCandidates: openai.topCandidates,
    };
    const rankedOpenAi = rankRequirementCandidates({
      requirement: sofaRequirement,
      serpResult: openai,
      query: "sofa",
      queryLevel: 0,
      maxLevel: 1,
      stores: [store],
    });
    const rankedSerp = rankRequirementCandidates({
      requirement: sofaRequirement,
      serpResult: serpRow,
      query: "sofa",
      queryLevel: 0,
      maxLevel: 1,
      stores: [store],
    });

    expect(rankedOpenAi.ranked.length).toBeGreaterThanOrEqual(3);
    expect(rankedSerp.ranked.map((item) => item.product.productUrl)).toEqual(
      rankedOpenAi.ranked.map((item) => item.product.productUrl)
    );
    for (const candidate of rankedOpenAi.ranked) {
      expect(candidate.product).toEqual(
        expect.objectContaining({
          productTitle: expect.any(String),
          productUrl: expect.any(String),
          retailerDomain: expect.any(String),
          productImageUrl: expect.anything(),
          price: expect.anything(),
        })
      );
    }
  });
});
