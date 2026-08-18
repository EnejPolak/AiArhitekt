import { describe, expect, it, vi } from "vitest";
import type { PlaceResult } from "@/lib/places/placesService";
import type { CanonicalSerpSearchOutcome, CanonicalSerpPicked } from "@/lib/serp/search";
import { buildSearchableRequirements } from "./itemSpecs";
import { resolveProductsForRequirements } from "./resolveProducts";

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

function picked(title: string, slug: string): CanonicalSerpPicked {
  return {
    title,
    url: `https://www.localhome.si/p/${slug}`,
    image: `https://cdn.localhome.si/${slug}.jpg`,
    price: 199,
    currency: "EUR",
    score: 40,
    confidence: 0.8,
    reasons: ["product-like"],
    domain: "localhome.si",
  };
}

function outcome(
  items: string[],
  pickFor: (item: string) => CanonicalSerpPicked | null
): CanonicalSerpSearchOutcome {
  return {
    ok: true,
    response: {
      dryRun: false,
      plannedQueries: {},
      plannedTotalQueries: items.length,
      effectiveMaxRequests: items.length,
      executedCount: items.length,
      dailyUsed: 1,
      dailyRemaining: 99,
      status: 200,
      results: items.map((item) => ({
        item,
        topCandidates: [],
        picked: pickFor(item),
      })),
    },
  };
}

describe("bounded discovery query fallbacks", () => {
  it("finds a common desk from a monitors constraint without accepting unrelated products", async () => {
    const { searched } = buildSearchableRequirements({
      furnitureNeeds: [
        {
          category: "desk",
          quantity: 1,
          placementNotes: null,
          constraints: ["must support multiple monitors"],
        },
      ],
      materialNeeds: [],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    });

    expect(searched[0]?.itemSpec).toBe("large computer desk multiple monitors");
    expect(searched[0]?.itemSpec).not.toMatch(/must support multiple monitors desk/i);

    const searchSerp = vi.fn(async ({ items }: { items: string[] }) =>
      outcome(items, (item) => {
        if (item === "large computer desk multiple monitors") {
          return picked("Ergonomic mesh office chair", "chair");
        }
        if (item === "large computer desk") {
          return picked("Large computer desk for home office", "desk");
        }
        return picked("Random area rug", "rug");
      })
    );

    const resolved = await resolveProductsForRequirements(
      searched,
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(resolved.selections).toHaveLength(1);
    expect(resolved.selections[0]?.product.productTitle).toMatch(/desk/i);
    expect(resolved.selections[0]?.product.productTitle).not.toMatch(/chair|rug/i);
    expect(resolved.selections[0]?.requirementSnapshot.discoveryQuery).toBe("large computer desk");
    expect(resolved.selections[0]?.requirementSnapshot.discoveryQueryLevel).toBe(2);
    expect(searchSerp.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("does not accept a random paint color for an explicit wall color", async () => {
    const { searched } = buildSearchableRequirements(
      {
        furnitureNeeds: [],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
      {
        wallMainColor: "metallic black",
        wallAccentColor: "olive green",
      }
    );

    const searchSerp = vi.fn(async ({ items }: { items: string[] }) =>
      outcome(items, (item) => {
        if (/olive/i.test(item)) {
          return picked("Olive green interior wall paint 10L", "olive-paint");
        }
        return picked("White matt interior wall paint", "white-paint");
      })
    );

    const resolved = await resolveProductsForRequirements(
      searched,
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(searched.map((item) => item.itemSpec)).toEqual([
      "interior wall paint metallic black",
      "interior wall paint olive green",
    ]);
    expect(resolved.selections).toHaveLength(1);
    expect(resolved.selections[0]?.product.productTitle).toMatch(/olive green/i);
    expect(resolved.unmatched.some((item) => /metallic black/i.test(item.itemSpec))).toBe(true);
    expect(JSON.stringify(resolved.selections)).not.toMatch(/white matt/i);
  });
});
