import { describe, expect, it, vi } from "vitest";
import type { CanonicalSerpSearchOutcome } from "@/lib/serp/search";
import { resolveShoppingRequirements } from "./resolveRequirements";
import { localizeSearchableRequirements } from "./locales";
import { resolveProductsForRequirements } from "./resolveProducts";

const styles = ["luxury", "minimal", "modern"];

function liveShapedRequirements() {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      furnitureNeeds: [
        { category: "desk", quantity: 1, placementNotes: null, constraints: ["computer desk"] },
      ],
      materialNeeds: [],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    },
    preferences: {
      flooring: "marble",
      wallMainColor: "matte black",
      wallAccentColor: "olive green",
      notes: "gaming chair",
      selectedStyles: styles,
    },
  });
  return localizeSearchableRequirements(searched, "SI", styles);
}

function productTitleForRequirement(
  req: ReturnType<typeof liveShapedRequirements>[number]
): string | null {
  if (req.provenance?.concept === "marble") return "Marmorne talne ploščice antičnega videza";
  if (req.provenance?.concept === "wall_paint" && req.requirementKey.includes(":main")) {
    return "Dulux Lateks za stene črna mat 1 l";
  }
  if (req.provenance?.concept === "wall_paint" && req.requirementKey.includes(":accent")) {
    return "Olivno zelena stenska barva Mat 2,5 l";
  }
  if (req.provenance?.concept === "gaming_chair") return "Ergonomski gaming stol črn";
  if (req.provenance?.concept === "desk") return "Računalniška miza bela 160 cm";
  return null;
}

function buildResultsForItems(
  items: string[],
  requirements: ReturnType<typeof liveShapedRequirements>
) {
  return items.map((item) => {
    const req = requirements.find((r) => r.queryPlan.includes(item));
    const title = req ? productTitleForRequirement(req) : null;
    return title ? { item, title } : { item, empty: true };
  });
}

function serpResponse(input: {
  results: Array<{
    item: string;
    title?: string;
    empty?: boolean;
  }>;
  providerAttempts?: number;
  providerSuccesses?: number;
  providerFailures?: number;
  cacheHits?: number;
  queryFailures?: CanonicalSerpSearchOutcome extends { ok: true; response: infer R } ? R["queryFailures"] : never;
}): CanonicalSerpSearchOutcome {
  const providerAttempts = input.providerAttempts ?? 1;
  return {
    ok: true,
    response: {
      dryRun: false,
      plannedQueries: {},
      plannedTotalQueries: input.results.length,
      effectiveMaxRequests: providerAttempts,
      executedCount: providerAttempts,
      providerRequests: providerAttempts,
      providerAttempts,
      providerSuccesses: input.providerSuccesses ?? providerAttempts - (input.providerFailures ?? 0),
      providerFailures: input.providerFailures ?? 0,
      cacheHits: input.cacheHits ?? 0,
      logicalQueries: input.results.length + (input.queryFailures?.length ?? 0),
      queryFailures: input.queryFailures ?? [],
      dailyUsed: 1,
      dailyRemaining: 99,
      status: 200,
      results: input.results.map(({ item, title, empty }) => ({
        item,
        topCandidates: empty || !title ? [] : [{ title, url: "https://www.localhome.si/p/x", domain: "localhome.si", score: 60, flags: { isProductLikeUrl: true, isCategoryLikeUrl: false, hasToolIntent: false, hasHomeIntent: true } }],
        picked:
          empty || !title
            ? null
            : {
                title,
                url: "https://www.localhome.si/p/x",
                image: null,
                price: 199,
                currency: "EUR" as const,
                score: 60,
                confidence: 0.8,
                reasons: [],
                domain: "localhome.si",
                snippet: title,
              },
      })),
    },
  };
}

describe("discovery per-query fault tolerance (P1.6.6.2)", () => {
  it("24: live-shaped pass-2 partial failure still completes discovery", async () => {
    const requirements = liveShapedRequirements();
    const gaming = requirements.find((r) => r.provenance?.concept === "gaming_chair")!;
    const desk = requirements.find((r) => r.provenance?.concept === "desk")!;

    let pass = 0;
    const searchSerp = vi.fn(async ({ items }: { items: string[] }) => {
      pass += 1;
      if (pass === 1) {
        return serpResponse({
          providerAttempts: 12,
          providerSuccesses: 12,
          results: buildResultsForItems(items, requirements),
        });
      }

      const gamingQuery = gaming.queryPlan[pass - 1] ?? gaming.itemSpec;
      const deskQuery = desk.queryPlan[pass - 1] ?? desk.itemSpec;

      return serpResponse({
        providerAttempts: 4,
        providerSuccesses: 2,
        providerFailures: 2,
        results: buildResultsForItems(items, requirements),
        queryFailures: [
          {
            item: gamingQuery,
            query: `${gamingQuery} backup`,
            code: "provider_timeout",
            message: "SERP API request timeout",
          },
          {
            item: deskQuery,
            query: `${deskQuery} backup`,
            code: "provider_5xx",
            message: "SERP API error: 500",
            providerStatus: 500,
          },
        ],
      });
    });

    const resolved = await resolveProductsForRequirements(
      requirements,
      searchSerp,
      { allowlistDomains: ["localhome.si", "bauhaus.si"] },
      []
    );

    expect(resolved.interrupted).toBe(false);
    expect(resolved.unmatched).toHaveLength(0);
    expect(resolved.selections.length).toBeGreaterThanOrEqual(5);
    expect(resolved.serpUsage.providerAttempts).toBeGreaterThanOrEqual(16);
    expect(resolved.serpUsage.providerFailures).toBeGreaterThanOrEqual(2);
    expect(resolved.serpUsage.providerSuccesses).toBeGreaterThanOrEqual(14);
    expect(resolved.selections.some((s) => s.requirementKey === gaming.requirementKey)).toBe(true);
    expect(resolved.selections.some((s) => s.requirementKey === desk.requirementKey)).toBe(true);
  });

  it("25: all provider queries failing marks requirement search_interrupted", async () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        furnitureNeeds: [
          { category: "desk", quantity: 1, placementNotes: null, constraints: ["computer desk"] },
        ],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
    });
    const localized = localizeSearchableRequirements(searched, "SI");
    const desk = localized[0]!;
    const deskQuery = desk.queryPlan[0] ?? desk.itemSpec;

    const searchSerp = vi.fn(async ({ items }: { items: string[] }) =>
      serpResponse({
        providerAttempts: items.length,
        providerSuccesses: 0,
        providerFailures: items.length,
        results: items.map((item) => ({ item, empty: true })),
        queryFailures: items.map((item) => ({
          item,
          query: `${item} domain query`,
          code: "network_error" as const,
          message: "network fetch failed",
        })),
      })
    );

    const resolved = await resolveProductsForRequirements(
      localized,
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      []
    );

    expect(resolved.interrupted).toBe(true);
    expect(resolved.unmatched).toEqual([
      expect.objectContaining({
        requirementKey: desk.requirementKey,
        reason: "search_interrupted",
      }),
    ]);
    expect(resolved.unmatched.some((item) => item.reason === "no_valid_product")).toBe(false);
  });

  it("26: successful empty search is no_valid_product not interrupted", async () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        furnitureNeeds: [
          { category: "desk", quantity: 1, placementNotes: null, constraints: ["computer desk"] },
        ],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
    });
    const localized = localizeSearchableRequirements(searched, "SI");

    const searchSerp = vi.fn(async ({ items }: { items: string[] }) =>
      serpResponse({
        providerAttempts: items.length,
        providerSuccesses: items.length,
        providerFailures: 0,
        results: items.map((item) => ({
          item,
          title: "KITAJSKE PALIČICE 100kom",
        })),
      })
    );

    const resolved = await resolveProductsForRequirements(
      localized,
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      []
    );

    expect(resolved.interrupted).toBe(false);
    expect(resolved.unmatched).toEqual([
      expect.objectContaining({ reason: "no_valid_product" }),
    ]);
  });

  it("simulates attempt 1965eefd pass-2 regression without global abort", async () => {
    const requirements = liveShapedRequirements();
    const desk = requirements.find((r) => r.provenance?.concept === "desk")!;
    let pass = 0;
    const searchSerp = vi.fn(async ({ items }: { items: string[] }) => {
      pass += 1;
      if (pass === 1) {
        return serpResponse({
          providerAttempts: 12,
          providerSuccesses: 12,
          results: buildResultsForItems(items, requirements),
        });
      }

      const deskQuery = desk.queryPlan[pass - 1] ?? desk.itemSpec;
      return serpResponse({
        providerAttempts: 4,
        providerSuccesses: 3,
        providerFailures: 1,
        results: buildResultsForItems(items, requirements),
        queryFailures: [
          {
            item: deskQuery,
            query: `${deskQuery} backup`,
            code: "provider_5xx",
            message: "SERP API error: 500",
            providerStatus: 500,
          },
        ],
      });
    });

    const resolved = await resolveProductsForRequirements(
      requirements,
      searchSerp,
      { allowlistDomains: ["localhome.si", "bauhaus.si"] },
      []
    );

    expect(resolved.interrupted).toBe(false);
    expect(resolved.selections.length).toBeGreaterThanOrEqual(4);
    expect(resolved.unmatched.every((item) => item.reason === "no_valid_product")).toBe(true);
    expect(resolved.serpUsage.providerAttempts).toBeGreaterThanOrEqual(16);
    expect(resolved.serpUsage.providerFailures).toBeGreaterThanOrEqual(1);

    const selectedKeys = resolved.selections.map((s) => s.requirementKey);
    const interrupted = resolved.unmatched.filter((u) => u.reason === "search_interrupted");
    // eslint-disable-next-line no-console -- zero-provider regression audit
    console.info("[discovery-fault-regression]", {
      providerAttempts: resolved.serpUsage.providerAttempts,
      providerFailures: resolved.serpUsage.providerFailures,
      providerSuccesses: resolved.serpUsage.providerSuccesses,
      cacheHits: resolved.serpUsage.cacheHits,
      selectedRequirements: selectedKeys,
      interruptedRequirements: interrupted.map((u) => u.requirementKey),
    });
  });
});
