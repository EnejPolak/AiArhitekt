import { describe, expect, it, vi } from "vitest";
import {
  DISCOVERY_DEADLINE_MS,
  DISCOVERY_SERP_MIN_REMAINING_MS,
  PER_DISCOVERY_SERP_BUDGET,
} from "./constants";
import { planDiscoverySerp } from "./discoveryPlan";
import { resolveShoppingRequirements } from "./resolveRequirements";
import { localizeSearchableRequirements } from "./locales";
import { resolveProductsForRequirements, MAX_DISCOVERY_QUERY_LEVELS } from "./resolveProducts";
import { buildPlannedQueriesFromBundles } from "@/lib/serp/queryGen";
import { rulesBundle } from "@/lib/serp/searchBundle";
import { resolveDomainsForItem } from "@/lib/serp/queryGen";
import { itemSpecToCategory } from "@/lib/serp/taxonomy";
import type { CanonicalSerpSearchOutcome } from "@/lib/serp/search";
import { DiscoveryError } from "./errors";
import { discoveryErrorMessage } from "./errors";

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

function serpOk(items: string[], providerRequests = 1, cacheHits = 0): CanonicalSerpSearchOutcome {
  return {
    ok: true,
    response: {
      dryRun: false,
      plannedQueries: {},
      plannedTotalQueries: items.length,
      effectiveMaxRequests: providerRequests,
      executedCount: providerRequests,
      providerRequests,
      providerAttempts: providerRequests,
      providerSuccesses: providerRequests,
      providerFailures: 0,
      cacheHits,
      logicalQueries: providerRequests + cacheHits,
      queryFailures: [],
      dailyUsed: 1,
      dailyRemaining: 99,
      status: 200,
      results: items.map((item) => ({
        item,
        topCandidates: [],
        picked: {
          title: "Ergonomski pisarniški stol črn",
          url: "https://www.localhome.si/p/chair",
          image: null,
          price: 199,
          currency: "EUR" as const,
          score: 50,
          confidence: 0.8,
          reasons: [],
          domain: "localhome.si",
          snippet: "pisarniški stol ergonomski",
        },
      })),
    },
  };
}

describe("discovery budget and deadline (P1.6.6.1)", () => {
  it("A: shares global provider budget across passes", async () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        furnitureNeeds: [
          { category: "office chair", quantity: 1, placementNotes: null, constraints: [] },
        ],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
    });
    const localized = localizeSearchableRequirements(searched, "SI");
    const maxRequestsSeen: number[] = [];
    let pass = 0;
    const searchSerp = vi.fn(async ({ maxRequests, items }: { maxRequests?: number; items: string[] }) => {
      pass += 1;
      maxRequestsSeen.push(maxRequests ?? PER_DISCOVERY_SERP_BUDGET);
      const title = pass === 1 ? "KITAJSKE PALIČICE 100kom" : "Pisarniški stol črn mreža";
      return {
        ok: true as const,
        response: {
          dryRun: false,
          plannedQueries: {},
          plannedTotalQueries: items.length,
          effectiveMaxRequests: 2,
          executedCount: 2,
          providerRequests: 2,
          cacheHits: 0,
          logicalQueries: 2,
          dailyUsed: 1,
          dailyRemaining: 99,
          status: 200,
          results: items.map((item) => ({
            item,
            topCandidates: [],
            picked: {
              title,
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
    });

    await resolveProductsForRequirements(
      localized,
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [],
      { serpBudget: 10 }
    );

    expect(searchSerp.mock.calls.length).toBe(2);
    expect(maxRequestsSeen[0]).toBe(10);
    expect(maxRequestsSeen[1]).toBe(8);
  });

  it("B: provider requests never exceed configured total", async () => {
    const localized = liveShapedRequirements();
    let totalProvider = 0;
    const searchSerp = vi.fn(async ({ maxRequests }: { maxRequests?: number }) => {
      const use = Math.min(maxRequests ?? 0, 6);
      totalProvider += use;
      return serpOk(
        localized.map((r) => r.queryPlan[0] ?? r.itemSpec),
        use
      );
    });

    const resolved = await resolveProductsForRequirements(
      localized,
      searchSerp,
      { allowlistDomains: ["localhome.si", "bauhaus.si", "merkur.si"] },
      [],
      { serpBudget: 12 }
    );

    expect(resolved.serpUsage.providerAttempts).toBeLessThanOrEqual(12);
    expect(totalProvider).toBeLessThanOrEqual(12);
  });

  it("C: cache hits consume zero provider-request budget", async () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        furnitureNeeds: [
          { category: "office chair", quantity: 1, placementNotes: null, constraints: [] },
        ],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
    });
    const localized = localizeSearchableRequirements(searched, "SI");
    const searchSerp = vi.fn(async () =>
      serpOk([localized[0]!.queryPlan[0] ?? localized[0]!.itemSpec], 0, 4)
    );

    const resolved = await resolveProductsForRequirements(
      localized,
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [],
      { serpBudget: 8 }
    );

    expect(resolved.serpUsage.providerAttempts).toBe(0);
    expect(resolved.serpUsage.cacheHits).toBe(4);
  });

  it("D: deadline prevents starting another provider pass", async () => {
    const localized = liveShapedRequirements().slice(0, 2);
    const searchSerp = vi.fn(async () => serpOk(localized.map((r) => r.queryPlan[0] ?? r.itemSpec), 1));

    await expect(
      resolveProductsForRequirements(
        localized,
        searchSerp,
        { allowlistDomains: ["localhome.si"] },
        [],
        {
          serpBudget: 20,
          deadlineAt: Date.now() + DISCOVERY_SERP_MIN_REMAINING_MS - 1,
        }
      )
    ).rejects.toMatchObject({ code: "discovery_timeout" });
  });

  it("E: completed requirement is removed from later passes", async () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        furnitureNeeds: [
          { category: "office chair", quantity: 1, placementNotes: null, constraints: [] },
        ],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
    });
    const localized = localizeSearchableRequirements(searched, "SI");
    const searchSerp = vi.fn(async ({ items }: { items: string[] }) => serpOk(items, 1));

    await resolveProductsForRequirements(
      localized,
      searchSerp,
      { allowlistDomains: ["localhome.si"] },
      [],
      { serpBudget: 8 }
    );

    expect(searchSerp).toHaveBeenCalledTimes(1);
  });

  it("F: domain-category filtering reduces irrelevant domains", () => {
    const allowlist = ["furniture.si", "bauhaus.si", "paintshop.si"];
    const domainCategoryMap = {
      "furniture.si": ["furniture"],
      "bauhaus.si": ["diy_hardware", "flooring", "paint_walls"],
      "paintshop.si": ["paint_walls"],
    };
    const marbleDomains = resolveDomainsForItem("flooring", allowlist, domainCategoryMap);
    const paintDomains = resolveDomainsForItem("paint_walls", allowlist, domainCategoryMap);

    expect(marbleDomains).not.toEqual(["furniture.si"]);
    expect(paintDomains).toContain("paintshop.si");
    expect(marbleDomains.some((d) => d === "bauhaus.si")).toBe(true);
  });

  it("G: provider timeout maps to typed error message", () => {
    expect(discoveryErrorMessage("provider_timeout")).toMatch(/couldn't finish searching in time/i);
    expect(discoveryErrorMessage("discovery_timeout")).toMatch(/project is safe/i);
    expect(discoveryErrorMessage("provider_timeout")).not.toMatch(/openai|serpapi|google|aborterror|504/i);
    const err = new DiscoveryError("provider_timeout", discoveryErrorMessage("provider_timeout"));
    expect(err.code).toBe("provider_timeout");
  });

  it("H: typed discovery errors serialize through action fail shape", () => {
    const err = new DiscoveryError("discovery_budget_exhausted", discoveryErrorMessage("discovery_budget_exhausted"));
    expect(err.code).toBe("discovery_budget_exhausted");
    expect(err.message).not.toBe("Could not find products. Try again.");
  });

  it("I: client/server codes distinguish timeout and budget from generic failure", () => {
    expect(discoveryErrorMessage("discovery_timeout")).not.toBe(discoveryErrorMessage("failed"));
    expect(discoveryErrorMessage("discovery_budget_exhausted")).not.toBe(discoveryErrorMessage("failed"));
    expect(discoveryErrorMessage("serp_quota")).not.toBe(discoveryErrorMessage("failed"));
  });

  it("J: never exceeds three query levels", () => {
    expect(MAX_DISCOVERY_QUERY_LEVELS).toBe(3);
    const localized = liveShapedRequirements();
    for (const req of localized) {
      expect(req.queryPlan.length).toBeLessThanOrEqual(3);
    }
  });

  it("prints dry plan for live-shaped five-requirement project", () => {
    const localized = liveShapedRequirements();
    expect(localized.length).toBeGreaterThanOrEqual(4);

    const allowlist = ["bauhaus.si", "merkur.si", "jysk.si", "obi.si", "lesnina.si"];
    const domainCategoryMap = {
      "bauhaus.si": ["diy_hardware", "flooring", "paint_walls"],
      "merkur.si": ["diy_hardware", "paint_walls"],
      "jysk.si": ["furniture"],
      "obi.si": ["diy_hardware", "flooring"],
      "lesnina.si": ["furniture"],
    };

    const plan = planDiscoverySerp({
      requirements: localized.slice(0, 5),
      allowlistDomains: allowlist,
      domainCategoryMap,
    });

    // eslint-disable-next-line no-console -- intentional dry-run audit output
    console.info("[discovery-dry-plan]", plan);

    expect(plan.globalProviderBudget).toBe(PER_DISCOVERY_SERP_BUDGET);
    expect(plan.deadlineMs).toBe(DISCOVERY_DEADLINE_MS);
    expect(plan.pass1.logicalQueries).toBeLessThanOrEqual(5 * 4);
    expect(plan.theoreticalLogicalQueriesAllPasses).toBeLessThan(plan.legacyUnboundedEstimate.totalLogical);

    const bundles = localized.slice(0, 1).map((r) => rulesBundle(r.queryPlan[0] ?? r.itemSpec, allowlist));
    const { flat } = buildPlannedQueriesFromBundles(
      bundles,
      allowlist,
      domainCategoryMap,
      undefined,
      { domainsPerItem: 2, queryVariantsPerDomain: 2 }
    );
    expect(flat.length).toBeLessThanOrEqual(4);
  });
});
