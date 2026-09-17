import { describe, expect, it } from "vitest";
import {
  evaluateAcceptance,
  finalizeAcceptedProduct,
  validateDeterministicClaims,
} from "./acceptancePolicy";
import {
  normalizeMatchScore,
  normalizeRequirementLists,
} from "./matchPolicy";
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

describe("acceptancePolicy", () => {
  it("rejects weak rescue candidate with category + color only", () => {
    const result = evaluateAcceptance({
      source: "rescue",
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      evidenceText: "Milagro Astro black pendant lamp",
      product: product({
        name: "Milagro Astro black pendant lamp",
        matchScore: 0.62,
        price: 119.99,
        priceEvidence: "web_search",
        matchedRequirements: ["pendant lamp", "black"],
        unknownRequirements: ["metal", "approx 40cm"],
      }),
    });
    expect(result.accepted).toBe(false);
    expect(["score_too_low", "insufficient_evidence", "too_many_unknowns"]).toContain(result.reason);
  });

  it("accepts strong rescue candidate with only soft style unknown", () => {
    const result = evaluateAcceptance({
      source: "rescue",
      requestedItem: "Scandinavian oak dining table approx 160cm max 400 EUR",
      evidenceText: "Oak dining table 160cm hrast jedilna miza",
      product: product({
        name: "Oak dining table 160cm",
        matchScore: 0.88,
        price: 369,
        priceEvidence: "merchant_page",
        matchedRequirements: ["dining table", "oak", "160cm", "max 400 EUR"],
        unknownRequirements: ["Scandinavian style"],
      }),
    });
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("accepted");
  });

  it("rejects hard budget violation", () => {
    const result = evaluateAcceptance({
      source: "primary",
      requestedItem: "black pendant lamp max 120 EUR",
      evidenceText: "Black pendant lamp",
      product: product({
        name: "Black pendant lamp",
        matchScore: 0.9,
        price: 150,
        priceEvidence: "merchant_page",
        matchedRequirements: ["pendant lamp", "black"],
        unmetRequirements: ["max 120 EUR"],
      }),
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("hard_constraint_unmet");
  });

  it("rejects explicit max budget when price is unknown", () => {
    const result = evaluateAcceptance({
      source: "primary",
      requestedItem: "oak dining table approx 160cm max 400 EUR",
      evidenceText: "Oak dining table 160cm jedilna miza",
      product: product({
        name: "Oak dining table 160cm",
        matchScore: 0.86,
        price: null,
        priceEvidence: "none",
        matchedRequirements: ["dining table", "oak", "160cm"],
        unknownRequirements: ["max 400 EUR"],
      }),
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("budget_unverified");
  });

  it("rejects wrong category", () => {
    const result = evaluateAcceptance({
      source: "rescue",
      requestedItem: "chrome heated towel rail width 60cm max 150 EUR",
      evidenceText: "Bathroom shelf",
      product: product({
        name: "Bathroom shelf",
        matchScore: 0.82,
        price: 89,
        priceEvidence: "web_search",
        matchedRequirements: ["chrome"],
        unknownRequirements: ["towel rail", "60cm"],
      }),
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("category_unverified");
  });

  it("accepts primary pendant with unknown metal when category budget and color confirmed", () => {
    const requestedItem = "black metal pendant lamp approx 40cm max 120 EUR";
    const lists = normalizeRequirementLists(
      requestedItem,
      {
        matchedRequirements: ["black", "pendant lamp", "approx 40cm", "max 120 EUR"],
        unmetRequirements: [],
        unknownRequirements: ["metal"],
      },
      119.99
    );
    const matchScore = normalizeMatchScore({
      matchScore: 1,
      unmetRequirements: lists.unmetRequirements,
      unknownRequirements: lists.unknownRequirements,
    });
    const finalized = finalizeAcceptedProduct({
      source: "primary",
      requestedItem,
      product: product({
        name: "Trio LED viseča svetilka Salinas mat črna",
        matchScore,
        price: 119.99,
        priceEvidence: "web_search",
        matchedRequirements: lists.matchedRequirements,
        unmetRequirements: lists.unmetRequirements,
        unknownRequirements: lists.unknownRequirements,
      }),
      evidenceText: "Trio LED viseča svetilka Salinas mat črna approx 40 cm",
    });
    expect(finalized.accepted).toBe(true);
    expect(finalized.product.unknownRequirements.join(" ").toLowerCase()).toContain("metal");
    expect(finalized.product.matchScore).toBeLessThan(1);
  });
});

describe("validateDeterministicClaims", () => {
  it("downgrades unsupported exact dimension claims", () => {
    const lists = validateDeterministicClaims({
      requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      product: product({
        name: "Alveus Vgradno korito Classic 30",
        matchedRequirements: [
          "kitchen sink",
          "stainless steel",
          "exactly 60cm width",
          "max 200 EUR",
        ],
        unknownRequirements: [],
      }),
      evidenceText: "Alveus Vgradno korito Classic 30 stainless steel kitchen sink",
    });

    expect(lists.matchedRequirements.join(" ").toLowerCase()).not.toContain("60cm");
    expect(
      lists.unknownRequirements.join(" ").toLowerCase().includes("60cm") ||
        lists.matchedRequirements.join(" ").toLowerCase().includes("kitchen sink")
    ).toBe(true);
  });

  it("recalculates acceptance after unsupported dimension downgrade", () => {
    const finalized = finalizeAcceptedProduct({
      source: "primary",
      requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      product: product({
        name: "Alveus Vgradno korito Classic 30",
        matchScore: 0.99,
        price: 109,
        priceEvidence: "web_search",
        matchedRequirements: [
          "kitchen sink",
          "stainless steel",
          "exactly 60cm width",
          "max 200 EUR",
        ],
        unknownRequirements: [],
      }),
      evidenceText: "Alveus Classic 30 inox kitchen sink width 30 cm",
    });

    expect(finalized.accepted).toBe(false);
    expect(finalized.reason).toMatch(/hard_constraint_unmet|insufficient_evidence|score_too_low/);
    expect(finalized.product.matchedRequirements.join(" ").toLowerCase()).not.toContain("60cm");
  });

  it("downgrades metal when only whyItMatches claims it", () => {
    const lists = validateDeterministicClaims({
      requestedItem: "black metal pendant lamp max 120 EUR",
      product: product({
        matchedRequirements: ["black", "metal", "pendant lamp"],
        whyItMatches: "black metal pendant",
        specifications: { Material: "metal" },
      }),
      evidenceText: "black pendant lamp viseča črna",
    });
    expect(lists.matchedRequirements.join(" ").toLowerCase()).toContain("black");
    expect(lists.matchedRequirements.join(" ").toLowerCase()).not.toContain("metal");
    expect(lists.unknownRequirements.join(" ").toLowerCase()).toContain("metal");
  });
});
