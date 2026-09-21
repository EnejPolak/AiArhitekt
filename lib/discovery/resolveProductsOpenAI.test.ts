import { describe, expect, it, vi } from "vitest";
import type { PlaceResult } from "@/lib/places/placesService";
import type { CanonicalSerpSearchOutcome } from "@/lib/serp/search";
import { DiscoveryError } from "./errors";
import { resolveShoppingRequirements } from "./resolveRequirements";
import { resolveProductsWithOpenAI } from "./resolveProductsOpenAI";

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

function searchedTwo() {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      furnitureNeeds: [
        { category: "desk", quantity: 1, placementNotes: null, constraints: ["computer desk"] },
        { category: "chair", quantity: 1, placementNotes: null, constraints: ["office chair"] },
      ],
      materialNeeds: [],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    },
  });
  return searched;
}

function openaiOutcome(
  items: string[],
  pick: "all" | "none" | "mixed" | "deadline-tail"
): CanonicalSerpSearchOutcome {
  return {
    ok: true,
    response: {
      dryRun: false,
      plannedQueries: {},
      plannedTotalQueries: items.length,
      effectiveMaxRequests: items.length,
      executedCount: items.length,
      dailyUsed: 0,
      dailyRemaining: 0,
      status: 200,
      results: items.map((item, index) => {
        const skip =
          pick === "none" ||
          (pick === "mixed" && index === 1) ||
          (pick === "deadline-tail" && index > 0);
        if (skip) {
          return { item, topCandidates: [], picked: null };
        }
        return {
          item,
          topCandidates: [],
          picked: {
            title: `Product ${index + 1}`,
            url: `https://www.localhome.si/p/${index + 1}`,
            image: `https://cdn.localhome.si/${index + 1}.jpg`,
            price: 120 + index,
            currency: "EUR",
            score: 80,
            confidence: 0.8,
            reasons: ["matched"],
            domain: "localhome.si",
            snippet: null,
          },
        };
      }),
      productDiscoveryResults: items.map((item, index) => ({
        requestedItem: item,
        status:
          pick === "deadline-tail" && index > 0
            ? "error"
            : pick === "none" || (pick === "mixed" && index === 1)
              ? "not_found"
              : "found",
        product: null,
        sources: [],
        diagnostics: {
          searchUsed: pick !== "deadline-tail" || index === 0,
          allowedDomainsCount: 1,
          errorCode: pick === "deadline-tail" && index > 0 ? "deadline" : undefined,
        },
      })),
    },
  };
}

describe("resolveProductsWithOpenAI", () => {
  it("persists found and not_found together without failing the batch", async () => {
    const searched = searchedTwo();
    const searchOpenAI = vi.fn(async ({ items, allowlistDomains, maxRequests, fastMode }) => {
      expect(allowlistDomains).toEqual(["localhome.si"]);
      expect(maxRequests).toBeUndefined();
      expect(fastMode).toBeUndefined();
      expect(JSON.stringify(allowlistDomains)).not.toMatch(/merkur|bauhaus|obi|lesnina/i);
      return openaiOutcome(items, "mixed");
    });

    const result = await resolveProductsWithOpenAI(
      searched,
      searchOpenAI,
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(result.selections).toHaveLength(1);
    expect(result.selections[0]?.product.productUrl).toBe("https://www.localhome.si/p/1");
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]?.reason).toBe("no_valid_product");
    expect(result.interrupted).toBe(false);
    expect(searchOpenAI).toHaveBeenCalledTimes(1);
    expect(result.candidatePools[0]?.candidates.length).toBeGreaterThan(0);
    expect(result.candidatePools[1]?.candidates).toEqual([]);
  });

  it("forwards project market context to the OpenAI search input", async () => {
    const searched = searchedTwo();
    const searchOpenAI = vi.fn(async (input) => {
      expect(input.marketContext).toEqual({
        countryCode: "SI",
        formattedLocation: "Ljubljana, Slovenia",
        merchantDomains: ["localhome.si"],
      });
      return openaiOutcome(input.items, "none");
    });

    await resolveProductsWithOpenAI(
      searched,
      searchOpenAI,
      {
        allowlistDomains: ["localhome.si"],
        marketContext: {
          countryCode: "SI",
          formattedLocation: "Ljubljana, Slovenia",
          merchantDomains: ["localhome.si"],
        },
      },
      [store]
    );

    expect(searchOpenAI).toHaveBeenCalledTimes(1);
  });

  it("treats all-not-found as a valid outcome, not infrastructure failure", async () => {
    const searched = searchedTwo();
    const result = await resolveProductsWithOpenAI(
      searched,
      async ({ items }) => openaiOutcome(items, "none"),
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(result.selections).toHaveLength(0);
    expect(result.unmatched).toHaveLength(2);
    expect(result.unmatched.every((item) => item.reason === "no_valid_product")).toBe(true);
  });

  it("maps deadline-skipped items to search_interrupted without throwing", async () => {
    const searched = searchedTwo();
    const result = await resolveProductsWithOpenAI(
      searched,
      async ({ items }) => openaiOutcome(items, "deadline-tail"),
      { allowlistDomains: ["localhome.si"] },
      [store]
    );

    expect(result.selections).toHaveLength(1);
    expect(result.unmatched[0]?.reason).toBe("search_interrupted");
    expect(result.stopReason).toBe("deadline");
  });

  it("throws a typed failure when OpenAI is not configured", async () => {
    await expect(
      resolveProductsWithOpenAI(
        searchedTwo(),
        async () => ({ ok: false, httpStatus: 500, error: "OPENAI_API_KEY not configured" }),
        { allowlistDomains: ["localhome.si"] },
        [store]
      )
    ).rejects.toMatchObject({
      name: "DiscoveryError",
      code: "openai_unconfigured",
    } satisfies Partial<DiscoveryError>);
  });
});
