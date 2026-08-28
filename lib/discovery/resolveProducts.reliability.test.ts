import { describe, expect, it, vi } from "vitest";
import { PER_DISCOVERY_SERP_BUDGET } from "./constants";
import { resolveShoppingRequirements } from "./resolveRequirements";
import { localizeSearchableRequirements } from "./locales";
import { resolveProductsForRequirements } from "./resolveProducts";
import type { CanonicalSerpSearchOutcome } from "@/lib/serp/search";

const emptyAnalysis = {
  furnitureNeeds: [] as const,
  materialNeeds: [] as const,
  constraints: [] as const,
  preserve: [] as const,
  replaceOrRemove: [] as const,
};

function serpOk(items: string[]): CanonicalSerpSearchOutcome {
  return {
    ok: true,
    response: {
      dryRun: false,
      plannedQueries: {},
      plannedTotalQueries: items.length,
      effectiveMaxRequests: items.length,
      providerRequests: items.length,
      cacheHits: 0,
      logicalQueries: items.length,
      executedCount: items.length,
      dailyUsed: 1,
      dailyRemaining: 99,
      status: 200,
      results: items.map((item) => ({
        item,
        topCandidates: [],
        picked: {
          title: "Pisarniški stol črn",
          url: "https://www.localhome.si/p/chair",
          image: null,
          price: 199,
          currency: "EUR" as const,
          score: 50,
          confidence: 0.8,
          reasons: [],
          domain: "localhome.si",
          snippet: null,
        },
      })),
    },
  };
}

describe("discovery reliability", () => {
  it("marks provider failure as search_interrupted", async () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        ...emptyAnalysis,
        furnitureNeeds: [
          { category: "office chair", quantity: 1, placementNotes: null, constraints: [] },
        ],
      },
    });
    const localized = localizeSearchableRequirements(searched, "SI");
    const searchSerp = vi.fn(async () => ({
      ok: false as const,
      httpStatus: 500,
      error: "provider failed",
    }));

    await expect(
      resolveProductsForRequirements(
        localized,
        searchSerp,
        { allowlistDomains: ["localhome.si"] },
        []
      )
    ).rejects.toMatchObject({ code: "search_interrupted" });
  });

  it("does not exceed configured per-discovery SERP budget", async () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        ...emptyAnalysis,
        furnitureNeeds: Array.from({ length: 8 }, (_, index) => ({
          category: "office chair",
          quantity: 1,
          placementNotes: null,
          constraints: [`chair ${index}`],
        })),
      },
    });
    const localized = localizeSearchableRequirements(searched, "SI");
    const seenMaxRequests: number[] = [];
    const searchSerp = vi.fn(async ({ items, maxRequests }: { items: string[]; maxRequests?: number }) => {
      seenMaxRequests.push(maxRequests ?? PER_DISCOVERY_SERP_BUDGET);
      return serpOk(items);
    });

    await resolveProductsForRequirements(
      localized,
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [],
      { serpBudget: PER_DISCOVERY_SERP_BUDGET }
    );

    expect(seenMaxRequests.every((value) => value <= PER_DISCOVERY_SERP_BUDGET)).toBe(true);
    expect(searchSerp.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
