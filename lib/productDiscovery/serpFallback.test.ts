import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import OpenAI from "openai";
import { finalizeAcceptedProduct } from "./acceptancePolicy";
import { searchProductItem } from "./searchItem";
import {
  attemptSerpFallback,
  buildSerpFallbackCandidates,
} from "./serpFallback";
import { shouldUseSerpFallback } from "./serpFallbackEligibility";
import type { ProductDiscoveryProduct, ProductDiscoveryResult } from "./types";

vi.mock("@/lib/serp/search", () => ({
  runCanonicalSerpSearch: vi.fn(),
}));

vi.mock("./enrichCandidates", () => ({
  enrichRescueCandidates: vi.fn(async ({ candidates }: { candidates: Array<{ id: string; sourceTitle: string | null; serpSnippetPrice?: number | null }> }) => ({
    candidates: candidates.map((candidate) => ({
      ...candidate,
      enrichment: {
        status: "success" as const,
        productName: candidate.sourceTitle,
        price: candidate.serpSnippetPrice ?? null,
        currency: "EUR",
        brand: null,
        availability: null,
        sku: null,
        imageUrl: null,
        pageTitle: candidate.sourceTitle,
        productText: candidate.sourceTitle,
        jsonLdProductFound: true,
      },
    })),
    stats: {
      enrichmentAttemptedCount: candidates.length,
      enrichmentSuccessCount: candidates.length,
      enrichment403Count: 0,
      enrichmentTimeoutCount: 0,
    },
  })),
}));

import { runCanonicalSerpSearch } from "@/lib/serp/search";

const runCanonicalSerpSearchMock = vi.mocked(runCanonicalSerpSearch);

function product(overrides: Partial<ProductDiscoveryProduct>): ProductDiscoveryProduct {
  return {
    name: "Example product",
    retailer: "Shop",
    retailerDomain: "shop.si",
    productUrl: "https://shop.si/p/example",
    price: null,
    currency: null,
    priceUnit: null,
    imageUrl: null,
    specifications: {},
    matchScore: 0.8,
    matchedRequirements: [],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: "Example",
    ...overrides,
  };
}

function notFoundResult(overrides: Partial<ProductDiscoveryResult> = {}): ProductDiscoveryResult {
  return {
    requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
    status: "not_found",
    product: null,
    sources: [{ url: "https://obi.si/p/other", title: "Other lamp" }],
    diagnostics: {
      searchUsed: true,
      allowedDomainsCount: 1,
      primaryStatus: "not_found",
      initialFailureReason: "model_not_found",
      ...overrides.diagnostics,
    },
    ...overrides,
  };
}

const rescueNone = {
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
};

describe("shouldUseSerpFallback", () => {
  it("blocks hard constraint failures", () => {
    expect(
      shouldUseSerpFallback({
        requestedItem: "beige wool rug 160x230 max 200 EUR",
        status: "not_found",
        diagnostics: {
          searchUsed: true,
          allowedDomainsCount: 2,
          acceptanceReason: "hard_constraint_unmet",
          rejectedProduct: product({ price: 459, priceEvidence: "merchant_page" }),
        },
      }).eligible
    ).toBe(false);
  });

  it("blocks identity requirement failures", () => {
    expect(
      shouldUseSerpFallback({
        requestedItem: "diamond pendant lamp max 120 EUR",
        status: "not_found",
        diagnostics: {
          searchUsed: true,
          allowedDomainsCount: 2,
          acceptanceReason: "identity_requirement_unverified",
        },
      }).eligible
    ).toBe(false);
  });

  it("allows search-style not_found", () => {
    expect(
      shouldUseSerpFallback({
        requestedItem: "exactly 60cm kitchen sink stainless steel max 200 EUR",
        status: "not_found",
        diagnostics: {
          searchUsed: true,
          allowedDomainsCount: 2,
          initialFailureReason: "model_not_found",
          primaryStatus: "not_found",
        },
      })
    ).toMatchObject({ eligible: true, reason: "initial_model_not_found" });
  });

  it("allows insufficient_evidence discovery miss", () => {
    expect(
      shouldUseSerpFallback({
        requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
        status: "not_found",
        diagnostics: {
          searchUsed: true,
          allowedDomainsCount: 2,
          acceptanceReason: "insufficient_evidence",
        },
      }).eligible
    ).toBe(true);
  });
});

describe("buildSerpFallbackCandidates", () => {
  it("rejects out-of-domain and category-like Serp results", () => {
    const candidates = buildSerpFallbackCandidates({
      allowlistDomains: ["obi.si"],
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      topCandidates: [
        {
          title: "Correct lamp",
          url: "https://obi.si/p/pendant-black",
          domain: "obi.si",
          snippet: "Black pendant 40cm",
          score: 80,
          flags: {
            isProductLikeUrl: true,
            isCategoryLikeUrl: false,
            hasToolIntent: false,
            hasHomeIntent: false,
          },
        },
        {
          title: "Evil",
          url: "https://evil.com/p/x",
          domain: "evil.com",
          score: 90,
          flags: {
            isProductLikeUrl: true,
            isCategoryLikeUrl: false,
            hasToolIntent: false,
            hasHomeIntent: false,
          },
        },
        {
          title: "Category",
          url: "https://obi.si/c/lamps",
          domain: "obi.si",
          score: 70,
          flags: {
            isProductLikeUrl: false,
            isCategoryLikeUrl: true,
            hasToolIntent: false,
            hasHomeIntent: false,
          },
        },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.url).toBe("https://obi.si/p/pendant-black");
    expect(candidates[0]?.id).toBe("candidate_1");
  });
});

describe("attemptSerpFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERPAPI_KEY = "test-key";
  });

  it("recovers when ranker selects a valid candidate and acceptance passes", async () => {
    runCanonicalSerpSearchMock.mockResolvedValue({
      ok: true,
      response: {
        executedCount: 2,
        results: [
          {
            item: "black metal pendant lamp approx 40cm max 120 EUR",
            topCandidates: [
              {
                title: "Black pendant lamp 40cm",
                url: "https://obi.si/p/pendant-black",
                domain: "obi.si",
                snippet: "Metal pendant lamp 40cm 119 EUR",
                price: { value: 119, currency: "EUR" },
                score: 85,
                flags: {
                  isProductLikeUrl: true,
                  isCategoryLikeUrl: false,
                  hasToolIntent: false,
                  hasHomeIntent: false,
                },
              },
              {
                title: "Unrelated vase",
                url: "https://obi.si/p/vase",
                domain: "obi.si",
                snippet: "Ceramic vase",
                score: 20,
                flags: {
                  isProductLikeUrl: true,
                  isCategoryLikeUrl: false,
                  hasToolIntent: false,
                  hasHomeIntent: false,
                },
              },
            ],
          },
        ],
      } as never,
    });

    const mockParse = vi.fn(async () => ({
      output_parsed: {
        status: "selected",
        candidateId: "candidate_1",
        productName: "Black pendant lamp 40cm",
        retailer: "OBI",
        price: 119,
        currency: "EUR",
        priceUnit: null,
        matchedRequirements: ["black", "metal", "pendant lamp", "approx 40cm", "max 120 EUR"],
        unmetRequirements: [],
        unknownRequirements: [],
        matchScore: 0.9,
        whyItMatches: "Black metal pendant under budget with Serp evidence.",
      },
    }));

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await attemptSerpFallback({
      client,
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      allowlistDomains: ["obi.si"],
      primarySources: [{ url: "https://obi.si/p/other", title: "Other" }],
      result: notFoundResult(),
    });

    expect(result.status).toBe("found");
    expect(result.diagnostics?.serpFallbackAttempted).toBe(true);
    expect(result.diagnostics?.serpFallbackAccepted).toBe(true);
    expect(result.diagnostics?.serpFallbackSelectedCandidateId).toBe("candidate_1");
    expect(result.product?.productUrl).toBe("https://obi.si/p/pendant-black");
    expect(result.product?.priceEvidence).toBe("merchant_page");
  });

  it("returns not_found for invalid model candidate id", async () => {
    runCanonicalSerpSearchMock.mockResolvedValue({
      ok: true,
      response: {
        executedCount: 1,
        results: [
          {
            item: "black metal pendant lamp approx 40cm max 120 EUR",
            topCandidates: [
              {
                title: "Black pendant lamp 40cm",
                url: "https://obi.si/p/pendant-black",
                domain: "obi.si",
                score: 85,
                flags: {
                  isProductLikeUrl: true,
                  isCategoryLikeUrl: false,
                  hasToolIntent: false,
                  hasHomeIntent: false,
                },
              },
            ],
          },
        ],
      } as never,
    });

    const mockParse = vi.fn(async () => ({
      output_parsed: {
        status: "selected",
        candidateId: "candidate_99",
        productName: "Fabricated",
        retailer: "OBI",
        price: 119,
        currency: "EUR",
        priceUnit: null,
        matchedRequirements: ["black"],
        unmetRequirements: [],
        unknownRequirements: [],
        matchScore: 0.9,
        whyItMatches: "Invalid id",
      },
    }));

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await attemptSerpFallback({
      client,
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      allowlistDomains: ["obi.si"],
      primarySources: [],
      result: notFoundResult(),
    });

    expect(result.status).toBe("not_found");
    expect(result.product).toBeNull();
    expect(result.diagnostics?.serpFallbackAccepted).toBe(false);
  });

  it("rejects exact dimension mismatch via acceptance gate", async () => {
    runCanonicalSerpSearchMock.mockResolvedValue({
      ok: true,
      response: {
        executedCount: 1,
        results: [
          {
            item: "exactly 60cm kitchen sink stainless steel max 200 EUR",
            topCandidates: [
              {
                title: "Kitchen sink 80cm €150",
                url: "https://obi.si/p/sink-80",
                domain: "obi.si",
                snippet: "Stainless steel sink 80cm €150",
                price: { value: 150, currency: "EUR" },
                score: 80,
                flags: {
                  isProductLikeUrl: true,
                  isCategoryLikeUrl: false,
                  hasToolIntent: false,
                  hasHomeIntent: false,
                },
              },
            ],
          },
        ],
      } as never,
    });

    const mockParse = vi.fn(async () => ({
      output_parsed: {
        status: "selected",
        candidateId: "candidate_1",
        productName: "Kitchen sink 80cm",
        retailer: "OBI",
        price: 150,
        currency: "EUR",
        priceUnit: null,
        matchedRequirements: ["kitchen sink", "stainless steel", "max 200 EUR"],
        unmetRequirements: ["exactly 60cm"],
        unknownRequirements: [],
        matchScore: 0.85,
        whyItMatches: "Wrong size sink.",
      },
    }));

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await attemptSerpFallback({
      client,
      requestedItem: "exactly 60cm kitchen sink stainless steel max 200 EUR",
      allowlistDomains: ["obi.si"],
      primarySources: [],
      result: notFoundResult({
        requestedItem: "exactly 60cm kitchen sink stainless steel max 200 EUR",
      }),
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.acceptanceReason).toBe("hard_constraint_unmet");
    expect(result.diagnostics?.serpFallbackAccepted).toBe(false);
  });

  it("rejects explicit budget violation", async () => {
    runCanonicalSerpSearchMock.mockResolvedValue({
      ok: true,
      response: {
        executedCount: 1,
        results: [
          {
            item: "ceramic vase white 30cm max 40 EUR",
            topCandidates: [
              {
                title: "White ceramic vase 30cm",
                url: "https://obi.si/p/vase",
                domain: "obi.si",
                snippet: "White vase 30cm 150 EUR",
                price: { value: 150, currency: "EUR" },
                score: 80,
                flags: {
                  isProductLikeUrl: true,
                  isCategoryLikeUrl: false,
                  hasToolIntent: false,
                  hasHomeIntent: false,
                },
              },
            ],
          },
        ],
      } as never,
    });

    const mockParse = vi.fn(async () => ({
      output_parsed: {
        status: "selected",
        candidateId: "candidate_1",
        productName: "White ceramic vase 30cm",
        retailer: "OBI",
        price: 150,
        currency: "EUR",
        priceUnit: null,
        matchedRequirements: ["ceramic vase", "white", "30cm"],
        unmetRequirements: ["max 40 EUR"],
        unknownRequirements: [],
        matchScore: 0.85,
        whyItMatches: "Over budget vase.",
      },
    }));

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await attemptSerpFallback({
      client,
      requestedItem: "ceramic vase white 30cm max 40 EUR",
      allowlistDomains: ["obi.si"],
      primarySources: [],
      result: notFoundResult({
        requestedItem: "ceramic vase white 30cm max 40 EUR",
        diagnostics: {
          searchUsed: true,
          allowedDomainsCount: 1,
          acceptanceReason: "budget_unverified",
        },
      }),
    });

    const finalized = finalizeAcceptedProduct({
      requestedItem: "ceramic vase white 30cm max 40 EUR",
      source: "serp_fallback",
      product: product({
        name: "White ceramic vase 30cm",
        productUrl: "https://obi.si/p/vase",
        price: 150,
        currency: "EUR",
        priceEvidence: "serp",
        unmetRequirements: ["max 40 EUR"],
        matchScore: 0.85,
      }),
    });
    expect(finalized.accepted).toBe(false);

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.serpFallbackAccepted).toBe(false);
  });
});

describe("searchProductItem serp fallback routing", () => {
  const previousFlag = process.env.PRODUCT_DISCOVERY_SERP_FALLBACK;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERPAPI_KEY = "test-key";
    delete process.env.PRODUCT_DISCOVERY_SERP_FALLBACK;
  });

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.PRODUCT_DISCOVERY_SERP_FALLBACK;
    else process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = previousFlag;
  });

  it("disables Serp fallback by default when flag is unset", async () => {
    runCanonicalSerpSearchMock.mockResolvedValue({ ok: false, httpStatus: 500, error: "should not run" });

    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [{ url: "https://obi.si/p/other" }] } }],
        output_parsed: { status: "not_found", product: null },
      })
      .mockResolvedValueOnce(rescueNone)
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [] } }],
        output_parsed: { status: "not_found", product: null },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "exactly 60cm kitchen sink stainless steel max 200 EUR",
      allowlistDomains: ["obi.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.serpFallbackEnabled).toBe(false);
    expect(result.diagnostics?.serpFallbackAttempted).toBe(false);
    expect(result.diagnostics?.serpFallbackEligible).toBe(true);
    expect(result.diagnostics?.serpFallbackReason).toBe("eligible_but_disabled");
    expect(runCanonicalSerpSearchMock).not.toHaveBeenCalled();
  });

  it("disables Serp fallback when PRODUCT_DISCOVERY_SERP_FALLBACK=false", async () => {
    process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = "false";
    runCanonicalSerpSearchMock.mockResolvedValue({ ok: false, httpStatus: 500, error: "should not run" });

    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [{ url: "https://obi.si/p/other" }] } }],
        output_parsed: { status: "not_found", product: null },
      })
      .mockResolvedValueOnce(rescueNone)
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [] } }],
        output_parsed: { status: "not_found", product: null },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "exactly 60cm kitchen sink stainless steel max 200 EUR",
      allowlistDomains: ["obi.si"],
      client,
    });

    expect(result.diagnostics?.serpFallbackEnabled).toBe(false);
    expect(result.diagnostics?.serpFallbackAttempted).toBe(false);
    expect(runCanonicalSerpSearchMock).not.toHaveBeenCalled();
  });

  it("does not attempt Serp fallback when primary is accepted", async () => {
    process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = "true";
    runCanonicalSerpSearchMock.mockResolvedValue({ ok: false, httpStatus: 500, error: "should not run" });

    const mockParse = vi.fn(async () => ({
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
          name: "Trio LED viseča svetilka",
          retailer: "OBI",
          retailerDomain: "obi.si",
          productUrl: "https://obi.si/p/pendant",
          price: 119.99,
          currency: "EUR",
          priceUnit: null,
          imageUrl: null,
          specifications: [],
          matchScore: 0.9,
          matchedRequirements: ["black", "pendant lamp", "approx 40cm", "max 120 EUR"],
          unmetRequirements: [],
          unknownRequirements: ["metal"],
          whyItMatches: "Black pendant under budget.",
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
    expect(result.diagnostics?.serpFallbackEnabled).toBe(true);
    expect(result.diagnostics?.serpFallbackAttempted).toBe(false);
    expect(runCanonicalSerpSearchMock).not.toHaveBeenCalled();
  });

  it("attempts Serp fallback on search-style not_found when flag is true", async () => {
    process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = "true";
    runCanonicalSerpSearchMock.mockResolvedValue({
      ok: true,
      response: { executedCount: 1, results: [{ item: "x", topCandidates: [] }] } as never,
    });

    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [{ url: "https://obi.si/p/other" }] } }],
        output_parsed: { status: "not_found", product: null },
      })
      .mockResolvedValueOnce(rescueNone)
      .mockResolvedValueOnce({
        output: [{ type: "web_search_call", action: { sources: [] } }],
        output_parsed: { status: "not_found", product: null },
      });

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "exactly 60cm kitchen sink stainless steel max 200 EUR",
      allowlistDomains: ["obi.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.serpFallbackEnabled).toBe(true);
    expect(result.diagnostics?.serpFallbackAttempted).toBe(true);
    expect(runCanonicalSerpSearchMock).toHaveBeenCalledTimes(1);
  });

  it("does not attempt Serp fallback for hard_constraint_unmet even when flag is true", async () => {
    process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = "true";
    runCanonicalSerpSearchMock.mockResolvedValue({ ok: false, httpStatus: 500, error: "should not run" });

    const mockParse = vi.fn(async () => ({
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              {
                url: "https://obi.si/p/door",
                title: "White interior door 100cm €250",
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
                  url: "https://obi.si/p/door",
                  title: "White interior door 100cm €250",
                },
              ],
            },
          ],
        },
      ],
      output_parsed: {
        status: "found",
        product: {
          name: "White interior door 100cm",
          retailer: "OBI",
          retailerDomain: "obi.si",
          productUrl: "https://obi.si/p/door",
          price: 250,
          currency: "EUR",
          priceUnit: null,
          imageUrl: null,
          specifications: [],
          matchScore: 0.9,
          matchedRequirements: ["interior door", "white"],
          unmetRequirements: ["max 120 EUR", "80cm"],
          unknownRequirements: [],
          whyItMatches: "Over budget wrong size door.",
        },
      },
    }));

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "interior white door 80cm max 120 EUR",
      allowlistDomains: ["obi.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.acceptanceReason).toBe("hard_constraint_unmet");
    expect(result.diagnostics?.serpFallbackEnabled).toBe(true);
    expect(result.diagnostics?.serpFallbackEligible).toBe(false);
    expect(result.diagnostics?.serpFallbackAttempted).toBe(false);
    expect(runCanonicalSerpSearchMock).not.toHaveBeenCalled();
  });
});

describe("isProductDiscoverySerpFallbackEnabled", () => {
  const previousFlag = process.env.PRODUCT_DISCOVERY_SERP_FALLBACK;

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.PRODUCT_DISCOVERY_SERP_FALLBACK;
    else process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = previousFlag;
  });

  it("defaults to false when unset", async () => {
    delete process.env.PRODUCT_DISCOVERY_SERP_FALLBACK;
    const { isProductDiscoverySerpFallbackEnabled } = await import("./constants");
    expect(isProductDiscoverySerpFallbackEnabled()).toBe(false);
  });

  it("is false for explicit false", async () => {
    process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = "false";
    const { isProductDiscoverySerpFallbackEnabled } = await import("./constants");
    expect(isProductDiscoverySerpFallbackEnabled()).toBe(false);
  });

  it("is true for explicit true", async () => {
    process.env.PRODUCT_DISCOVERY_SERP_FALLBACK = "true";
    const { isProductDiscoverySerpFallbackEnabled } = await import("./constants");
    expect(isProductDiscoverySerpFallbackEnabled()).toBe(true);
  });
});
