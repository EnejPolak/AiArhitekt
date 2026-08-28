import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PlaceResult } from "@/lib/places/placesService";
import type { CanonicalSerpSearchOutcome } from "@/lib/serp/search";
import type { SearchableRequirement } from "./itemSpecs";
import { resolveProductsForRequirements } from "./resolveProducts";
import type { RankedProductCandidate } from "./style/types";

const rankMock = vi.fn();

vi.mock("./style/rankCandidates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./style/rankCandidates")>();
  return {
    ...actual,
    rankRequirementCandidates: (...args: unknown[]) => rankMock(...args),
  };
});

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

function styledRequirement(): SearchableRequirement {
  return {
    requirementType: "furniture",
    requirementKey: "furniture:desk:0",
    itemSpec: "computer desk",
    queryPlan: ["query-level-1", "query-level-2", "query-level-3"],
    selectedStyles: ["luxury", "minimal"],
    searchLocale: "sl",
    searchCountryCode: "SI",
    snapshot: {
      category: "desk",
      quantity: 1,
      placementNotes: null,
      constraints: ["computer desk"],
    },
    provenance: { source: "analysis", concept: "desk" },
  };
}

function mockWinner(input: {
  title: string;
  styleScore: number;
  finalScore: number;
  url: string;
  neutral?: boolean;
}): RankedProductCandidate {
  return {
    product: {
      productTitle: input.title,
      productSnippet: null,
      productUrl: input.url,
      productImageUrl: null,
      price: 199,
      currency: "EUR",
      retailerDomain: "localhome.si",
      retailerName: "Local Home Store",
      hasReferenceImage: false,
    },
    hardValid: true,
    serpScore: 40,
    serpConfidence: 0.5,
    styleFit: {
      selectedStyles: ["luxury", "minimal"],
      score: input.styleScore,
      matchedSignals: input.neutral ? [] : ["minimalistična"],
      conflictingSignals: [],
      neutral: input.neutral ?? false,
    },
    finalScore: input.finalScore,
  };
}

function serpOutcome(items: string[]): CanonicalSerpSearchOutcome {
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
        picked: null,
      })),
    },
  };
}

describe("style query-level stop policy integration", () => {
  beforeEach(() => {
    rankMock.mockReset();
  });

  it("A. continues below threshold and selects the stronger later level", async () => {
    rankMock
      .mockReturnValueOnce({
        winner: mockWinner({
          title: "Level 1 desk",
          styleScore: 0.31,
          finalScore: 0.48,
          url: "https://www.localhome.si/p/l1",
        }),
        ranked: [],
      })
      .mockReturnValueOnce({
        winner: mockWinner({
          title: "Level 2 desk",
          styleScore: 0.72,
          finalScore: 0.81,
          url: "https://www.localhome.si/p/l2",
        }),
        ranked: [],
      });

    const searchSerp = vi.fn(async ({ items }: { items: string[] }) => serpOutcome(items));
    const resolved = await resolveProductsForRequirements(
      [styledRequirement()],
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(searchSerp).toHaveBeenCalledTimes(2);
    expect(resolved.selections[0]?.product.productTitle).toBe("Level 2 desk");
    expect(resolved.selections[0]?.requirementSnapshot.discoveryQueryLevel).toBe(2);
  });

  it("B. keeps the best cross-level candidate when all levels stay below threshold", async () => {
    rankMock
      .mockReturnValueOnce({
        winner: mockWinner({
          title: "Level 1 desk",
          styleScore: 0.38,
          finalScore: 0.55,
          url: "https://www.localhome.si/p/l1",
        }),
        ranked: [],
      })
      .mockReturnValueOnce({
        winner: mockWinner({
          title: "Level 2 desk",
          styleScore: 0.34,
          finalScore: 0.5,
          url: "https://www.localhome.si/p/l2",
        }),
        ranked: [],
      })
      .mockReturnValueOnce({
        winner: mockWinner({
          title: "Level 3 desk",
          styleScore: 0.3,
          finalScore: 0.45,
          url: "https://www.localhome.si/p/l3",
        }),
        ranked: [],
      });

    const searchSerp = vi.fn(async ({ items }: { items: string[] }) => serpOutcome(items));
    const resolved = await resolveProductsForRequirements(
      [styledRequirement()],
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(searchSerp).toHaveBeenCalledTimes(3);
    expect(resolved.selections[0]?.product.productTitle).toBe("Level 1 desk");
    expect(resolved.selections[0]?.requirementSnapshot.discoveryQueryLevel).toBe(1);
  });

  it("C. stops immediately at level 1 without calling later SERP levels", async () => {
    rankMock.mockReturnValueOnce({
      winner: mockWinner({
        title: "Accepted level 1 desk",
        styleScore: 0.65,
        finalScore: 0.74,
        url: "https://www.localhome.si/p/l1",
      }),
      ranked: [],
    });

    const searchSerp = vi.fn(async ({ items }: { items: string[] }) => serpOutcome(items));
    const resolved = await resolveProductsForRequirements(
      [styledRequirement()],
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(searchSerp).toHaveBeenCalledTimes(1);
    expect(searchSerp.mock.calls[0]?.[0].items).toEqual(["query-level-1"]);
    expect(resolved.selections[0]?.product.productTitle).toBe("Accepted level 1 desk");
  });

  it("D. returns the best neutral candidate instead of null", async () => {
    rankMock
      .mockReturnValueOnce({
        winner: mockWinner({
          title: "Neutral level 1 desk",
          styleScore: 0.34,
          finalScore: 0.52,
          url: "https://www.localhome.si/p/n1",
          neutral: true,
        }),
        ranked: [],
      })
      .mockReturnValueOnce({
        winner: mockWinner({
          title: "Neutral level 2 desk",
          styleScore: 0.34,
          finalScore: 0.49,
          url: "https://www.localhome.si/p/n2",
          neutral: true,
        }),
        ranked: [],
      })
      .mockReturnValueOnce({
        winner: mockWinner({
          title: "Neutral level 3 desk",
          styleScore: 0.34,
          finalScore: 0.47,
          url: "https://www.localhome.si/p/n3",
          neutral: true,
        }),
        ranked: [],
      });

    const searchSerp = vi.fn(async ({ items }: { items: string[] }) => serpOutcome(items));
    const resolved = await resolveProductsForRequirements(
      [styledRequirement()],
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(resolved.selections).toHaveLength(1);
    expect(resolved.selections[0]?.product.productTitle).toBe("Neutral level 1 desk");
    expect(resolved.unmatched).toHaveLength(0);
  });

  it("E. keeps the earlier cross-level winner when a later level has higher SERP but lower final score", async () => {
    rankMock
      .mockReturnValueOnce({
        winner: mockWinner({
          title: "Better combined level 1 desk",
          styleScore: 0.38,
          finalScore: 0.6,
          url: "https://www.localhome.si/p/better",
        }),
        ranked: [],
      })
      .mockReturnValueOnce({
        winner: {
          ...mockWinner({
            title: "Higher SERP level 2 desk",
            styleScore: 0.35,
            finalScore: 0.5,
            url: "https://www.localhome.si/p/worse",
          }),
          serpScore: 75,
        },
        ranked: [],
      })
      .mockReturnValueOnce({
        winner: mockWinner({
          title: "Level 3 desk",
          styleScore: 0.32,
          finalScore: 0.46,
          url: "https://www.localhome.si/p/l3",
        }),
        ranked: [],
      });

    const searchSerp = vi.fn(async ({ items }: { items: string[] }) => serpOutcome(items));
    const resolved = await resolveProductsForRequirements(
      [styledRequirement()],
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(resolved.selections[0]?.product.productTitle).toBe("Better combined level 1 desk");
    expect(resolved.selections[0]?.requirementSnapshot.discoveryQueryLevel).toBe(1);
  });
});
