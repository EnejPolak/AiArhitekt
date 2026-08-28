import { describe, expect, it, vi } from "vitest";
import type { PlaceResult } from "@/lib/places/placesService";
import type { CanonicalSerpSearchOutcome, CanonicalSerpPicked } from "@/lib/serp/search";
import { resolveShoppingRequirements } from "./resolveRequirements";
import { localizeSearchableRequirements } from "./locales";
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

const emptyAnalysis = {
  furnitureNeeds: [] as const,
  materialNeeds: [] as const,
  constraints: [] as const,
  preserve: [] as const,
  replaceOrRemove: [] as const,
};

function picked(title: string, slug: string, snippet: string | null = null): CanonicalSerpPicked {
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
    snippet,
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
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        ...emptyAnalysis,
        furnitureNeeds: [
          {
            category: "desk",
            quantity: 1,
            placementNotes: null,
            constraints: ["must support multiple monitors"],
          },
        ],
      },
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
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: emptyAnalysis,
      preferences: {
        wallMainColor: "metallic black",
        wallAccentColor: "olive green",
      },
    });

    const searchSerp = vi.fn(async ({ items }: { items: string[] }) =>
      outcome(items, (item) => {
        if (/olive/i.test(item)) {
          return picked("Olivno zelena notranja barva za stene 10L", "olive-paint");
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
    expect(resolved.selections[0]?.product.productTitle).toMatch(/olivno zelena/i);
    expect(resolved.unmatched.some((item) => /metallic black/i.test(item.itemSpec))).toBe(true);
    expect(JSON.stringify(resolved.selections)).not.toMatch(/white matt/i);
  });

  it("falls back through localized desk queries then English, max 3 SERP levels", async () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        ...emptyAnalysis,
        furnitureNeeds: [
          {
            category: "desk",
            quantity: 1,
            placementNotes: null,
            constraints: ["must support multiple monitors"],
          },
        ],
      },
    });
    const localized = localizeSearchableRequirements(searched, "SI");
    expect(localized[0]?.queryPlan).toEqual([
      "računalniška miza za več monitorjev",
      "računalniška miza",
      "computer desk",
    ]);

    const searchSerp = vi.fn(async ({ items }: { items: string[] }) =>
      outcome(items, (item) => {
        if (item === "računalniška miza za več monitorjev") {
          return picked("Ergonomic mesh office chair", "chair");
        }
        if (item === "računalniška miza") {
          return picked("Računalniška miza bela 160 cm", "desk");
        }
        return picked("Computer Desk Oak", "desk-en");
      })
    );

    const resolved = await resolveProductsForRequirements(
      localized,
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(resolved.selections).toHaveLength(1);
    expect(resolved.selections[0]?.requirementSnapshot.discoveryQuery).toBe("računalniška miza");
    expect(resolved.selections[0]?.requirementSnapshot.discoveryQueryLevel).toBe(2);
    expect(resolved.selections[0]?.requirementSnapshot.searchLocale).toBe("sl");
    expect(resolved.selections[0]?.requirementSnapshot.searchCountryCode).toBe("SI");
    expect(resolved.selections[0]?.itemSpec).toBe("large computer desk multiple monitors");
    expect(searchSerp).toHaveBeenCalledTimes(2);
  });

  it("stops after the first valid localized office chair and does not search later levels", async () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        ...emptyAnalysis,
        furnitureNeeds: [
          { category: "office chair", quantity: 1, placementNotes: null, constraints: [] },
        ],
      },
    });
    const localized = localizeSearchableRequirements(searched, "SI");
    const searchSerp = vi.fn(async ({ items }: { items: string[] }) =>
      outcome(items, () => picked("Pisarniški stol črn mreža", "chair"))
    );

    const resolved = await resolveProductsForRequirements(
      localized,
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(resolved.selections).toHaveLength(1);
    expect(resolved.selections[0]?.requirementSnapshot.discoveryQuery).toBe("pisarniški stol");
    expect(resolved.selections[0]?.requirementSnapshot.discoveryQueryLevel).toBe(1);
    expect(searchSerp).toHaveBeenCalledTimes(1);
  });

  it("returns null after three failed levels and does not search a fourth time", async () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        ...emptyAnalysis,
        furnitureNeeds: [
          { category: "office chair", quantity: 1, placementNotes: null, constraints: [] },
        ],
      },
    });
    const localized = localizeSearchableRequirements(searched, "SI");
    expect(localized[0]?.queryPlan).toHaveLength(3);
    const searchSerp = vi.fn(async ({ items }: { items: string[] }) =>
      outcome(items, () => picked("KITAJSKE PALIČICE 100kom", "chopsticks"))
    );

    const resolved = await resolveProductsForRequirements(
      localized,
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(resolved.selections).toHaveLength(0);
    expect(resolved.unmatched).toHaveLength(1);
    expect(searchSerp).toHaveBeenCalledTimes(3);
  });
});
