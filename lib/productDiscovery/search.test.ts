import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
