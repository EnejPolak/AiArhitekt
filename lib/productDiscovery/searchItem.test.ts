import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { searchProductItem } from "./searchItem";

describe("searchProductItem validation", () => {
  it("rejects URLs outside allowlistDomains", async () => {
    const mockParse = vi.fn(async () => ({
      output: [{ type: "web_search_call" }],
      output_parsed: {
        status: "found",
        product: {
          name: "Evil product",
          retailer: "Evil",
          retailerDomain: "evil.com",
          productUrl: "https://evil.com/p/x",
          price: 10,
          currency: "EUR",
          priceUnit: null,
          imageUrl: null,
          specifications: [],
          matchScore: 0.99,
          matchedRequirements: [],
          unmetRequirements: [],
          unknownRequirements: [],
          whyItMatches: "nope",
        },
      },
    }));

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "oak laminate",
      allowlistDomains: ["merkur.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.initialFailureReason).toBe("domain_not_allowed");
    expect(result.diagnostics?.targetedResearchAttempted).toBe(true);
  });

  it("rejects hallucinated URLs not present in web sources", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [
          {
            type: "web_search_call",
            action: { sources: [{ url: "https://merkur.si/p/real" }] },
          },
        ],
        output_parsed: {
          status: "found",
          product: {
            name: "Fake product",
            retailer: "Merkur",
            retailerDomain: "merkur.si",
            productUrl: "https://merkur.si/p/fake",
            price: 10,
            currency: "EUR",
            priceUnit: null,
            imageUrl: null,
            specifications: [],
            matchScore: 0.99,
            matchedRequirements: [],
            unmetRequirements: [],
            unknownRequirements: [],
            whyItMatches: "fabricated",
          },
        },
      })
      .mockResolvedValueOnce({
        output: [],
        output_parsed: {
          status: "none",
          candidateId: null,
          productName: null,
          retailer: null,
          price: null,
          currency: null,
          priceUnit: null,
          matchedRequirements: [],
          unmetRequirements: [],
          unknownRequirements: [],
          matchScore: 0,
          whyItMatches: "",
        },
      })
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [] } }],
        output_parsed: { status: "not_found", product: null },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "oak laminate",
      allowlistDomains: ["merkur.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.initialFailureReason).toBe("url_not_in_sources");
    expect(result.diagnostics?.rescueAttempted).toBe(true);
    expect(result.diagnostics?.targetedResearchAttempted).toBe(true);
  });

  it("rejects primary candidate when explicit max budget has no price evidence", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [
          {
            type: "web_search_call",
            action: { sources: [{ url: "https://merkur.si/p/laminat" }] },
          },
        ],
        output_parsed: {
          status: "found",
          product: {
            name: "Laminat",
            retailer: "Merkur",
            retailerDomain: "merkur.si",
            productUrl: "https://merkur.si/p/laminat",
            price: null,
            currency: null,
            priceUnit: null,
            imageUrl: null,
            specifications: [],
            matchScore: 0.75,
            matchedRequirements: ["oak laminate"],
            unmetRequirements: [],
            unknownRequirements: ["max 25 EUR/m2"],
            whyItMatches: "Material match; price not listed.",
          },
        },
      })
      .mockResolvedValueOnce({
        output: [],
        output_parsed: {
          status: "none",
          candidateId: null,
          productName: null,
          retailer: null,
          price: null,
          currency: null,
          priceUnit: null,
          matchedRequirements: [],
          unmetRequirements: [],
          unknownRequirements: [],
          matchScore: 0,
          whyItMatches: "",
        },
      })
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [] } }],
        output_parsed: { status: "not_found", product: null },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "oak laminate max 25 EUR/m2",
      allowlistDomains: ["merkur.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.targetedResearchAttempted).toBe(true);
    expect(result.diagnostics?.acceptanceReason).toBe("budget_unverified");
  });

  it("does not allow perfect match score when unmet hard requirements remain", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [
          {
            type: "web_search_call",
            action: { sources: [{ url: "https://merkur.si/p/laminat" }] },
          },
        ],
        output_parsed: {
          status: "found",
          product: {
            name: "Laminat",
            retailer: "Merkur",
            retailerDomain: "merkur.si",
            productUrl: "https://merkur.si/p/laminat",
            price: 30,
            currency: "EUR",
            priceUnit: "m2",
            imageUrl: null,
            specifications: [],
            matchScore: 1,
            matchedRequirements: ["oak laminate"],
            unmetRequirements: ["max 25 EUR/m2"],
            unknownRequirements: [],
            whyItMatches: "Material match but above budget.",
          },
        },
      })
      .mockResolvedValueOnce({
        output: [],
        output_parsed: {
          status: "none",
          candidateId: null,
          productName: null,
          retailer: null,
          price: null,
          currency: null,
          priceUnit: null,
          matchedRequirements: [],
          unmetRequirements: [],
          unknownRequirements: [],
          matchScore: 0,
          whyItMatches: "",
        },
      })
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [] } }],
        output_parsed: { status: "not_found", product: null },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "oak laminate max 25 EUR/m2",
      allowlistDomains: ["merkur.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.acceptanceReason).toBe("hard_constraint_unmet");
    expect(result.diagnostics?.rejectedProduct?.matchScore).toBeLessThanOrEqual(0.85);
    expect(result.diagnostics?.targetedResearchAttempted).toBe(true);
  });

  it("returns no_retailers when allowlist is empty", async () => {
    const result = await searchProductItem({
      requestedItem: "oak laminate",
      allowlistDomains: [],
    });
    expect(result.status).toBe("no_retailers");
  });

  it("returns found with unknown metal and caps match score below 1", async () => {
    const mockParse = vi.fn(async () => ({
      output: [
        {
          type: "web_search_call",
          action: { sources: [{ url: "https://obi.si/p/pendant" }] },
        },
      ],
      output_parsed: {
        status: "found",
        product: {
          name: "Trio LED viseča svetilka Salinas mat črna",
          retailer: "OBI",
          retailerDomain: "obi.si",
          productUrl: "https://obi.si/p/pendant",
          price: 119.99,
          currency: "EUR",
          priceUnit: null,
          imageUrl: null,
          specifications: [],
          matchScore: 1,
          matchedRequirements: ["black", "pendant lamp", "approx 40cm", "under max 120 EUR"],
          unmetRequirements: ["metal"],
          unknownRequirements: [],
          whyItMatches: "Black pendant with approximate 40cm size under budget.",
        },
      },
    }));

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      allowlistDomains: ["obi.si"],
      client,
    });

    expect(result.status).toBe("found");
    expect(result.diagnostics?.targetedResearchAttempted).toBe(false);
    expect(result.product?.unknownRequirements.join(" ").toLowerCase()).toContain("metal");
    expect(result.product?.unmetRequirements.join(" ").toLowerCase()).not.toContain("metal");
    expect(result.product?.matchScore).toBeLessThan(1);
  });

  it("keeps explicit material mismatch in unmet requirements and rejects acceptance", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [
          {
            type: "web_search_call",
            action: { sources: [{ url: "https://merkur.si/p/lamp" }] },
          },
        ],
        output_parsed: {
          status: "found",
          product: {
            name: "Plastic pendant lamp",
            retailer: "Merkur",
            retailerDomain: "merkur.si",
            productUrl: "https://merkur.si/p/lamp",
            price: 39.99,
            currency: "EUR",
            priceUnit: null,
            imageUrl: null,
            specifications: [],
            matchScore: 0.7,
            matchedRequirements: ["pendant lamp"],
            unmetRequirements: ["material is plastic instead of metal"],
            unknownRequirements: [],
            whyItMatches: "Pendant lamp but explicitly plastic.",
          },
        },
      })
      .mockResolvedValueOnce({
        output: [],
        output_parsed: {
          status: "none",
          candidateId: null,
          productName: null,
          retailer: null,
          price: null,
          currency: null,
          priceUnit: null,
          matchedRequirements: [],
          unmetRequirements: [],
          unknownRequirements: [],
          matchScore: 0,
          whyItMatches: "",
        },
      })
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [] } }],
        output_parsed: { status: "not_found", product: null },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "metal pendant lamp",
      allowlistDomains: ["merkur.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.acceptanceReason).toBe("hard_constraint_unmet");
    expect(result.diagnostics?.rejectedProduct?.unmetRequirements.join(" ").toLowerCase()).toContain("plastic");
    expect(result.diagnostics?.targetedResearchAttempted).toBe(true);
  });

  it("rejects explicit max budget when merchant price evidence is unavailable", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [
          {
            type: "web_search_call",
            action: { sources: [{ url: "https://merkur.si/p/lamp" }] },
          },
        ],
        output_parsed: {
          status: "found",
          product: {
            name: "Pendant lamp",
            retailer: "Merkur",
            retailerDomain: "merkur.si",
            productUrl: "https://merkur.si/p/lamp",
            price: null,
            currency: null,
            priceUnit: null,
            imageUrl: null,
            specifications: [],
            matchScore: 0.88,
            matchedRequirements: ["pendant lamp", "under max 120 EUR"],
            unmetRequirements: [],
            unknownRequirements: [],
            whyItMatches: "Relevant pendant but price not listed.",
          },
        },
      })
      .mockResolvedValueOnce({
        output: [],
        output_parsed: {
          status: "none",
          candidateId: null,
          productName: null,
          retailer: null,
          price: null,
          currency: null,
          priceUnit: null,
          matchedRequirements: [],
          unmetRequirements: [],
          unknownRequirements: [],
          matchScore: 0,
          whyItMatches: "",
        },
      })
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [] } }],
        output_parsed: { status: "not_found", product: null },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "black pendant lamp max 120 EUR",
      allowlistDomains: ["merkur.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.acceptanceReason).toBe("budget_unverified");
    expect(result.diagnostics?.targetedResearchAttempted).toBe(true);
  });
});
