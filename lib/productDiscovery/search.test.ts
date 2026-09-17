import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runOpenAIProductDiscovery } from "./search";
import { searchProductItem } from "./searchItem";

vi.mock("./searchItem", () => ({
  searchProductItem: vi.fn(),
}));

const searchProductItemMock = vi.mocked(searchProductItem);

function foundResult(requestedItem: string, url: string) {
  return {
    requestedItem,
    status: "found" as const,
    product: {
      name: "Test product",
      retailer: "Merkur",
      retailerDomain: "merkur.si",
      productUrl: url,
      price: 22,
      currency: "EUR" as const,
      priceUnit: "m2",
      imageUrl: null,
      specifications: {},
      matchScore: 0.92,
      matchedRequirements: ["oak laminate"],
      unmetRequirements: [],
      unknownRequirements: [],
      whyItMatches: "Matches oak laminate specs.",
    },
    sources: [{ title: "Product", url }],
    diagnostics: { searchUsed: true, allowedDomainsCount: 1, elapsedMs: 100 },
  };
}

describe("runOpenAIProductDiscovery", () => {
  beforeEach(() => {
    searchProductItemMock.mockReset();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns no_retailers for every item when allowlistDomains is empty", async () => {
    const outcome = await runOpenAIProductDiscovery({
      items: ["oak laminate", "black lamp"],
      allowlistDomains: [],
      dryRun: false,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.response.results).toHaveLength(2);
    expect(outcome.response.productDiscoveryResults?.[0]?.status).toBe("no_retailers");
    expect(outcome.response.productDiscoveryResults?.[1]?.status).toBe("no_retailers");
    expect(searchProductItemMock).not.toHaveBeenCalled();
  });

  it("preserves item order for three requested items", async () => {
    searchProductItemMock
      .mockResolvedValueOnce(foundResult("item-a", "https://merkur.si/p/a"))
      .mockResolvedValueOnce({
        requestedItem: "item-b",
        status: "error",
        product: null,
        sources: [],
        diagnostics: { searchUsed: false, allowedDomainsCount: 1 },
      })
      .mockResolvedValueOnce(foundResult("item-c", "https://merkur.si/p/c"));

    const outcome = await runOpenAIProductDiscovery({
      items: ["item-a", "item-b", "item-c"],
      allowlistDomains: ["merkur.si"],
      dryRun: false,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.response.results.map((row) => row.item)).toEqual(["item-a", "item-b", "item-c"]);
    expect(outcome.response.results[0]?.picked?.url).toBe("https://merkur.si/p/a");
    expect(outcome.response.results[1]?.picked).toBeNull();
    expect(outcome.response.results[2]?.picked?.url).toBe("https://merkur.si/p/c");
  });

  it("dryRun does not call OpenAI", async () => {
    const outcome = await runOpenAIProductDiscovery({
      items: ["oak laminate"],
      allowlistDomains: ["merkur.si"],
      dryRun: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.response.executedCount).toBe(0);
    expect(searchProductItemMock).not.toHaveBeenCalled();
  });

  it("returns a typed failure when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const outcome = await runOpenAIProductDiscovery({
      items: ["oak laminate"],
      allowlistDomains: ["merkur.si"],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBe("OPENAI_API_KEY not configured");
    expect(searchProductItemMock).not.toHaveBeenCalled();
  });

  it("skips remaining items after the overall deadline without hanging", async () => {
    searchProductItemMock.mockImplementation(async ({ requestedItem }) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return foundResult(requestedItem, `https://merkur.si/p/${requestedItem}`);
    });

    const outcome = await runOpenAIProductDiscovery({
      items: ["item-1", "item-2", "item-3", "item-4", "item-5", "item-6"],
      allowlistDomains: ["merkur.si"],
      deadlineAt: Date.now() + 20,
      minRemainingBeforeRequestMs: 1,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.response.results).toHaveLength(6);
    expect(outcome.response.stoppedReason).toBe("deadline");
    const skipped = outcome.response.productDiscoveryResults?.filter(
      (row) => row.diagnostics?.errorCode === "deadline"
    );
    expect((skipped?.length ?? 0)).toBeGreaterThan(0);
    expect(searchProductItemMock.mock.calls.length).toBeLessThan(6);
    expect(searchProductItemMock.mock.calls.length).toBeGreaterThan(0);
  });

  it("forwards market context into each Step C item search", async () => {
    searchProductItemMock.mockResolvedValue(foundResult("black floor lamp, metal, max 150 EUR", "https://localhome.si/p/1"));
    const marketContext = {
      countryCode: "SI",
      formattedLocation: "Ljubljana, Slovenia",
      merchantDomains: ["localhome.si"],
    };
    const outcome = await runOpenAIProductDiscovery({
      items: ["black floor lamp, metal, max 150 EUR"],
      allowlistDomains: ["localhome.si"],
      marketContext,
    });
    expect(outcome.ok).toBe(true);
    expect(searchProductItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedItem: "black floor lamp, metal, max 150 EUR",
        allowlistDomains: ["localhome.si"],
        marketContext,
      })
    );
  });
});
