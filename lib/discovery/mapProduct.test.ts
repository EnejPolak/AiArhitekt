import { describe, expect, it } from "vitest";
import { mapCanonicalPickedToSelection } from "./mapProduct";
import type { CanonicalSerpPicked } from "@/lib/serp/search";
import type { PlaceResult } from "@/lib/places/placesService";

const store: PlaceResult = {
  name: "Local Home Store",
  place_id: "abc",
  rating: 4.2,
  user_ratings_total: 10,
  distanceKm: 1,
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

function picked(overrides: Partial<CanonicalSerpPicked> = {}): CanonicalSerpPicked {
  return {
    title: "Modern beige sofa",
    url: "https://www.localhome.si/p/sofa-1",
    image: "https://cdn.localhome.si/sofa.jpg",
    price: 499.9,
    currency: "EUR",
    score: 40,
    confidence: 0.8,
    reasons: ["product-like"],
    domain: "localhome.si",
    ...overrides,
  };
}

describe("canonical SERP product mapping", () => {
  it("persists canonical url, not provider link", () => {
    const mapped = mapCanonicalPickedToSelection(picked(), [store]);
    expect(mapped?.productUrl).toBe("https://www.localhome.si/p/sofa-1");
    expect(mapped).not.toHaveProperty("link");
    expect(mapped).not.toHaveProperty("productLink");
    expect(mapped).not.toHaveProperty("href");
    expect(mapped?.retailerName).toBe("Local Home Store");
    expect(mapped?.hasReferenceImage).toBe(true);
  });

  it("keeps missing price and currency as null", () => {
    const mapped = mapCanonicalPickedToSelection(
      picked({ price: null, currency: null, image: null }),
      [store]
    );
    expect(mapped?.price).toBeNull();
    expect(mapped?.currency).toBeNull();
    expect(mapped?.productImageUrl).toBeNull();
    expect(mapped?.hasReferenceImage).toBe(false);
  });

  it("does not invent a product when picked is null", () => {
    expect(mapCanonicalPickedToSelection(null, [store])).toBeNull();
  });

  it("rejects a non-http image and a missing title", () => {
    expect(mapCanonicalPickedToSelection(picked({ image: "data:image/png;base64,xx" }), [store])?.productImageUrl).toBeNull();
    expect(mapCanonicalPickedToSelection(picked({ title: "   " }), [store])).toBeNull();
  });

  it("preserves an associated merchant image as image evidence", () => {
    const mapped = mapCanonicalPickedToSelection(picked(), [store]);
    expect(mapped?.productImageUrl).toBe("https://cdn.localhome.si/sofa.jpg");
    expect(mapped?.imageEvidence).toEqual([
      expect.objectContaining({
        url: "https://cdn.localhome.si/sofa.jpg",
        source: "search_evidence",
        exactProductAssociation: true,
      }),
    ]);
  });

  it("does not treat an off-merchant model image as exact-product evidence", () => {
    const mapped = mapCanonicalPickedToSelection(
      picked({ image: "https://images.unsplash.com/generic-sofa.jpg" }),
      [store]
    );
    expect(mapped?.productImageUrl).toBe("https://images.unsplash.com/generic-sofa.jpg");
    expect(mapped?.imageEvidence).toEqual([]);
  });
});
