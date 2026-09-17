import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import OpenAI from "openai";
import { clearCandidateEnrichmentCache } from "./enrichCandidate";
import { searchProductItem } from "./searchItem";

vi.mock("@/lib/references/ssrf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/references/ssrf")>();
  return {
    ...actual,
    // Integration tests stub fetch; skip live DNS for merchant enrichment.
    assertPublicHttpUrl: async (url: string) => new URL(url),
  };
});

function quickForbiddenFetch() {
  return vi.fn(async () => ({
    status: 403,
    ok: false,
    headers: { get: (key: string) => (key.toLowerCase() === "content-type" ? "text/html" : null) },
    body: null,
  }));
}

function quickSuccessFetch() {
  return vi.fn(async () => ({
    status: 200,
    ok: true,
    headers: {
      get: (key: string) => (key.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null),
    },
    text: async () => `<!doctype html><html><head>
      <title>Trio LED black pendant lamp 40cm</title>
      <script type="application/ld+json">{"@type":"Product","name":"Trio LED black pendant lamp 40cm","offers":{"@type":"Offer","price":"119.99","priceCurrency":"EUR"}}</script>
    </head><body>black metal pendant lamp approx 40 cm kovinska viseča svetilka</body></html>`,
  }));
}


function primaryNotFoundSources() {
  return [
    {
      type: "web_search_call",
      action: {
        sources: [
          {
            url: "https://obi.si/p/pendant-black-40",
            title: "Trio LED black pendant lamp 40cm €119.99",
          },
          { url: "https://obi.si/p/white-cabinet", title: "White cabinet" },
        ],
      },
    },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          annotations: [
            {
              type: "url_citation",
              url: "https://obi.si/p/pendant-black-40",
              title: "Trio LED black pendant lamp 40cm €119.99",
            },
          ],
        },
      ],
    },
  ];
}

function rescueSelected(candidateId: string, overrides: Record<string, unknown> = {}) {
  return {
    output_parsed: {
      status: "selected",
      candidateId,
      productName: "Trio LED viseča svetilka mat črna",
      retailer: "OBI",
      price: 119.99,
      currency: "EUR",
      priceUnit: null,
      matchedRequirements: ["black", "pendant lamp", "max 120 EUR"],
      unknownRequirements: ["metal", "approx 40cm"],
      matchScore: 0.88,
      whyItMatches: "Verified black pendant from source evidence.",
      ...overrides,
    },
  };
}

describe("source-backed rescue integration", () => {
  beforeEach(() => {
    clearCandidateEnrichmentCache();
    vi.stubGlobal("fetch", quickForbiddenFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("A — does not rescue when primary returns valid sourced product", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [{ url: "https://merkur.si/p/laminat", title: "Oak laminate flooring" }],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://merkur.si/p/laminat",
                    title: "Oak laminate flooring",
                  },
                ],
              },
            ],
          },
        ],
        output_parsed: {
          status: "found",
          product: {
            name: "Laminat",
            retailer: "Merkur",
            retailerDomain: "merkur.si",
            productUrl: "https://merkur.si/p/laminat",
            price: 18.99,
            currency: "EUR",
            priceUnit: "m2",
            imageUrl: null,
            specifications: [],
            matchScore: 0.95,
            matchedRequirements: ["oak laminate"],
            unmetRequirements: [],
            unknownRequirements: [],
            whyItMatches: "Verified primary match.",
          },
        },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "oak laminate",
      allowlistDomains: ["merkur.si"],
      client,
    });

    expect(result.status).toBe("found");
    expect(result.diagnostics?.rescueAttempted).toBe(false);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("B — rejects weak rescue candidate at acceptance gate", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: primaryNotFoundSources(),
        output_parsed: { status: "not_found", product: null },
      })
      .mockResolvedValueOnce({
        output: [],
        ...rescueSelected("candidate_1", {
          price: null,
          currency: null,
          matchScore: 0.62,
          matchedRequirements: ["black", "pendant lamp"],
          unknownRequirements: ["metal", "approx 40cm", "max 120 EUR"],
        }),
      })
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [] } }],
        output_parsed: { status: "not_found", product: null },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      allowlistDomains: ["obi.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.rescueAttempted).toBe(true);
    expect(result.diagnostics?.rescueSelected).toBe(true);
    expect(result.diagnostics?.rescueSucceeded).toBe(false);
    expect(result.diagnostics?.targetedResearchAttempted).toBe(true);
    expect(result.diagnostics?.acceptanceReason).toMatch(
      /score_too_low|insufficient_evidence|budget_unverified/
    );
    expect(result.diagnostics?.rejectedProduct?.productUrl).toBe("https://obi.si/p/pendant-black-40");
    expect(mockParse).toHaveBeenCalledTimes(3);
  });

  it("B2 — accepts strong rescue candidate when primary is not_found", async () => {
    vi.stubGlobal("fetch", quickSuccessFetch());
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: primaryNotFoundSources(),
        output_parsed: { status: "not_found", product: null },
      })
      .mockResolvedValueOnce({
        output: [],
        ...rescueSelected("candidate_1", {
          matchedRequirements: ["black", "pendant lamp", "metal", "approx 40cm", "max 120 EUR"],
          unknownRequirements: [],
        }),
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      allowlistDomains: ["obi.si"],
      client,
    });

    expect(result.status).toBe("found");
    expect(result.diagnostics?.rescueAttempted).toBe(true);
    expect(result.diagnostics?.rescueSucceeded).toBe(true);
    expect(result.product?.productUrl).toBe("https://obi.si/p/pendant-black-40");
    expect(mockParse).toHaveBeenCalledTimes(2);
    expect(mockParse.mock.calls[1]?.[0]).not.toHaveProperty("tools");
  });

  it("C — rejects invalid rescue candidate ID", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: primaryNotFoundSources(),
        output_parsed: { status: "not_found", product: null },
      })
      .mockResolvedValueOnce({
        output: [],
        output_parsed: {
          status: "selected",
          candidateId: "candidate_999",
          productName: "Fake",
          retailer: "OBI",
          price: null,
          currency: null,
          priceUnit: null,
          matchedRequirements: [],
          unmetRequirements: [],
          unknownRequirements: [],
          matchScore: 0.5,
          whyItMatches: "nope",
        },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      allowlistDomains: ["obi.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.rescueSucceeded).toBe(false);
  });

  it("D — rejects fake primary URL then may rescue from real sources", async () => {
    vi.stubGlobal("fetch", quickSuccessFetch());
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: primaryNotFoundSources(),
        output_parsed: {
          status: "found",
          product: {
            name: "Fake",
            retailer: "OBI",
            retailerDomain: "obi.si",
            productUrl: "https://obi.si/p/fake-product",
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
        ...rescueSelected("candidate_1", {
          matchedRequirements: ["black", "pendant lamp", "metal", "approx 40cm", "max 120 EUR"],
          unknownRequirements: [],
        }),
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      allowlistDomains: ["obi.si"],
      client,
    });

    expect(result.status).toBe("found");
    expect(result.product?.productUrl).toBe("https://obi.si/p/pendant-black-40");
    expect(result.product?.productUrl).not.toBe("https://obi.si/p/fake-product");
    expect(result.diagnostics?.initialFailureReason).toBe("url_not_in_sources");
  });

  it("E — unknown metal stays unknown and score is capped on accepted primary result", async () => {
    const mockParse = vi.fn().mockResolvedValueOnce({
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              {
                url: "https://obi.si/p/pendant",
                title: "Trio LED black pendant lamp 40cm €119.99",
              },
            ],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://obi.si/p/pendant",
                  title: "Trio LED black pendant lamp 40cm €119.99",
                },
              ],
            },
          ],
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
          matchedRequirements: ["black", "pendant lamp", "approx 40cm", "max 120 EUR"],
          unmetRequirements: [],
          unknownRequirements: ["metal"],
          whyItMatches: "Black pendant under budget.",
        },
      },
    });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      allowlistDomains: ["obi.si"],
      client,
    });

    expect(result.status).toBe("found");
    expect(result.product?.unknownRequirements.join(" ").toLowerCase()).toContain("metal");
    expect(result.product?.unmetRequirements.join(" ").toLowerCase()).not.toContain("metal");
    expect(result.product?.matchScore).toBeLessThan(1);
  });

  it("G — returns not_found when only junk/category sources exist", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [
                { url: "https://obi.si/c/category" },
                { url: "https://merkur.si/catalog.pdf" },
              ],
            },
          },
        ],
        output_parsed: { status: "not_found", product: null },
      })
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [] } }],
        output_parsed: { status: "not_found", product: null },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      allowlistDomains: ["obi.si", "merkur.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.rescueAttempted).toBe(true);
    expect(result.diagnostics?.rescueCandidateCount).toBe(0);
    expect(result.diagnostics?.targetedResearchAttempted).toBe(true);
    expect(mockParse).toHaveBeenCalledTimes(2);
  });
});