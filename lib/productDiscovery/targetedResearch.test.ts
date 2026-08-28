import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import {
  evaluateAcceptance,
  finalizeAcceptedProduct,
  validateDeterministicClaims,
} from "./acceptancePolicy";
import {
  attemptTargetedResearch,
  processPassCandidates,
  sanitizeModelProductOutput,
} from "./searchPass";
import { searchProductItem } from "./searchItem";
import type { ProductDiscoveryProduct } from "./types";

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

const rescueNone = {
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
};

const targetedNotFound = {
  output: [{ type: "web_search_call", action: { sources: [] } }],
  output_parsed: {
    status: "not_found",
    product: null,
  },
};

describe("targeted research flow", () => {
  it("skips targeted research when primary candidate is accepted", async () => {
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
    expect(result.diagnostics?.targetedResearchAttempted).toBe(false);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("attempts targeted research after primary and rescue fail", async () => {
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
            whyItMatches: "Above budget.",
          },
        },
      })
      .mockResolvedValueOnce(rescueNone)
      .mockResolvedValueOnce(targetedNotFound);

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await searchProductItem({
      requestedItem: "oak laminate max 25 EUR/m2",
      allowlistDomains: ["merkur.si"],
      client,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.targetedResearchAttempted).toBe(true);
    expect(mockParse).toHaveBeenCalledTimes(3);
  });

  it("accepts a strong targeted recovery candidate", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [
          {
            type: "web_search_call",
            action: { sources: [{ url: "https://obi.si/p/category" }] },
          },
        ],
        output_parsed: { status: "not_found", product: null },
      })
      .mockResolvedValueOnce(rescueNone)
      .mockResolvedValueOnce({
        output: [
          {
            type: "web_search_call",
            action: { sources: [{ url: "https://obi.si/p/viseca-svetilka" }] },
          },
        ],
        output_parsed: {
          status: "found",
          product: {
            name: "Trio LED viseča svetilka Salinas mat črna",
            retailer: "OBI",
            retailerDomain: "obi.si",
            productUrl: "https://obi.si/p/viseca-svetilka",
            price: 119.99,
            currency: "EUR",
            priceUnit: null,
            imageUrl: null,
            specifications: [],
            matchScore: 0.88,
            matchedRequirements: ["black", "pendant lamp", "approx 40cm", "max 120 EUR"],
            unmetRequirements: [],
            unknownRequirements: ["metal"],
            whyItMatches: "Black pendant lamp under budget.",
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
    expect(result.diagnostics?.targetedResearchAccepted).toBe(true);
    expect(result.diagnostics?.acceptanceSource).toBe("targeted");
  });

  it("rejects targeted URL absent from targeted search sources", async () => {
    const sources = [{ url: "https://obi.si/p/real", title: "Real" }];
    const parsed = {
      status: "found" as const,
      product: {
        name: "Fake",
        retailer: "OBI",
        retailerDomain: "obi.si",
        productUrl: "https://obi.si/p/fake",
        price: 50,
        currency: "EUR",
        priceUnit: null,
        imageUrl: null,
        specifications: [],
        matchScore: 0.95,
        matchedRequirements: ["pendant lamp"],
        unmetRequirements: [],
        unknownRequirements: [],
        whyItMatches: "Fabricated URL.",
      },
    };

    const outcome = sanitizeModelProductOutput(parsed, "pendant lamp", ["obi.si"], sources);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.initialFailureReason).toBe("url_not_in_sources");
    }
  });

  it("rejects targeted candidate that violates hard budget", async () => {
    const pass = await processPassCandidates({
      client: { responses: { parse: vi.fn(async () => rescueNone) } } as unknown as OpenAI,
      requestedItem: "black pendant lamp max 120 EUR",
      allowlistDomains: ["obi.si"],
      sources: [{ url: "https://obi.si/p/lamp", title: "Lamp" }],
      parsed: {
        status: "found",
        product: {
          name: "Expensive lamp",
          retailer: "OBI",
          retailerDomain: "obi.si",
          productUrl: "https://obi.si/p/lamp",
          price: 180,
          currency: "EUR",
          priceUnit: null,
          imageUrl: null,
          specifications: [],
          matchScore: 0.9,
          matchedRequirements: ["pendant lamp"],
          unmetRequirements: ["max 120 EUR"],
          unknownRequirements: [],
          whyItMatches: "Pendant but over budget.",
        },
      },
      acceptanceSource: "targeted",
    });

    expect(pass.status).toBe("not_found");
    expect(pass.acceptance?.reason).toBe("hard_constraint_unmet");
  });
});

describe("distinctive requirement verification", () => {
  it("keeps diamond unknown when evidence only confirms bathroom sink", () => {
    const lists = validateDeterministicClaims({
      requestedItem: "diamond bathroom sink max 100 EUR",
      product: product({
        name: "Ceramic bathroom sink",
        matchedRequirements: ["bathroom sink", "max 100 EUR", "diamond"],
        unknownRequirements: [],
      }),
      evidenceText: "Ceramic bathroom sink white umivalnik",
    });

    expect(lists.matchedRequirements.join(" ").toLowerCase()).not.toContain("diamond");
    expect(lists.unknownRequirements.join(" ").toLowerCase()).toContain("diamond");
  });

  it("rejects diamond bathroom sink when diamond is unsupported", () => {
    const finalized = finalizeAcceptedProduct({
      source: "primary",
      requestedItem: "diamond bathroom sink max 100 EUR",
      product: product({
        name: "Ceramic bathroom sink",
        matchScore: 0.9,
        price: 89,
        priceEvidence: "web_search",
        matchedRequirements: ["bathroom sink", "max 100 EUR", "diamond"],
        unknownRequirements: [],
      }),
      evidenceText: "Ceramic bathroom sink umivalnik",
    });

    expect(finalized.accepted).toBe(false);
    expect(["identity_requirement_unverified", "insufficient_evidence"]).toContain(finalized.reason);
  });

  it("rejects Italian leather sofa at 50 EUR when leather origin is unsupported", () => {
    const result = evaluateAcceptance({
      source: "primary",
      requestedItem: "designer Italian leather sofa max 50 EUR",
      evidenceText: "Budget sofa kavc",
      product: product({
        name: "Budget sofa",
        matchScore: 0.85,
        price: 50,
        priceEvidence: "web_search",
        matchedRequirements: ["sofa", "max 50 EUR"],
        unknownRequirements: ["Italian leather", "designer"],
      }),
    });

    expect(result.accepted).toBe(false);
    expect(["identity_requirement_unverified", "insufficient_evidence", "category_unverified"]).toContain(
      result.reason
    );
  });

  it("rejects Italian leather sofa when price exceeds hard budget", () => {
    const result = evaluateAcceptance({
      source: "primary",
      requestedItem: "designer Italian leather sofa max 50 EUR",
      evidenceText: "Italian leather sofa kavc",
      product: product({
        name: "Italian leather sofa",
        matchScore: 0.9,
        price: 500,
        priceEvidence: "merchant_page",
        matchedRequirements: ["sofa", "Italian leather"],
        unmetRequirements: ["max 50 EUR"],
      }),
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("hard_constraint_unmet");
  });

  it("rejects exact 60cm when targeted evidence lacks supported dimension", async () => {
    const pass = await processPassCandidates({
      client: { responses: { parse: vi.fn(async () => rescueNone) } } as unknown as OpenAI,
      requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      allowlistDomains: ["merkur.si"],
      sources: [{ url: "https://merkur.si/p/sink", title: "Sink 30cm" }],
      parsed: {
        status: "found",
        product: {
          name: "Alveus Classic 30",
          retailer: "Merkur",
          retailerDomain: "merkur.si",
          productUrl: "https://merkur.si/p/sink",
          price: 109,
          currency: "EUR",
          priceUnit: null,
          imageUrl: null,
          specifications: [],
          matchScore: 0.95,
          matchedRequirements: ["kitchen sink", "stainless steel", "exactly 60cm width", "max 200 EUR"],
          unknownRequirements: [],
          whyItMatches: "Kitchen sink inox.",
        },
      },
      acceptanceSource: "targeted",
    });

    expect(pass.status).toBe("not_found");
    expect(pass.rejectedProduct?.matchedRequirements.join(" ").toLowerCase()).not.toContain("60cm");
  });
});

describe("attemptTargetedResearch", () => {
  it("uses allowed_domains filter on targeted pass", async () => {
    const mockParse = vi.fn(async () => targetedNotFound);
    const client = { responses: { parse: mockParse } } as unknown as OpenAI;

    await attemptTargetedResearch({
      client,
      requestedItem: "pendant lamp",
      allowlistDomains: ["obi.si", "merkur.si"],
      primarySources: [],
    });

    expect(mockParse).toHaveBeenCalledTimes(1);
    const call = mockParse.mock.calls[0]?.[0];
    expect(call?.tools?.[0]?.filters?.allowed_domains).toEqual(["obi.si", "merkur.si"]);
  });
});
