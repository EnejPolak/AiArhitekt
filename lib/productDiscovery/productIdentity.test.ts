import { describe, expect, it } from "vitest";
import {
  evaluateAcceptance,
  finalizeAcceptedProduct,
} from "./acceptancePolicy";
import {
  parseProductIdentity,
  verifyCoreCategoryInEvidence,
  verifyIdentityRequirements,
} from "./productIdentity";
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

describe("productIdentity", () => {
  it("parses pendant lamp core category", () => {
    const identity = parseProductIdentity("black pendant lamp");
    expect(identity.coreCategory).toBe("pendant lamp");
    expect(
      verifyCoreCategoryInEvidence(identity, "trio black led pendant lamp")
    ).toBe(true);
  });

  it("verifies pendant lamp category from merchant evidence", () => {
    const identity = parseProductIdentity("black pendant lamp max 120 EUR");
    const ok = verifyCoreCategoryInEvidence(
      identity,
      "black led pendant lamp viseca svetilka"
    );
    expect(ok).toBe(true);
  });

  it("rejects adjacent bathroom shelf for towel rail request", () => {
    const identity = parseProductIdentity("chrome heated towel rail width 60cm max 150 EUR");
    const ok = verifyCoreCategoryInEvidence(identity, "bathroom shelf chrome polica");
    expect(ok).toBe(false);
  });

  it("rejects electric mat without system for heated floor system request", () => {
    const identity = parseProductIdentity("marble heated floor system max 100 EUR total");
    expect(identity.coreCategory).toBe("heated floor system");
    expect(
      verifyCoreCategoryInEvidence(
        identity,
        "admiral e-power talno ogrevanje comfort 1 m2 150w"
      )
    ).toBe(false);
    expect(
      verifyCoreCategoryInEvidence(
        identity,
        "admiral e-power talno ogrevanje comfort electric underfloor-heating mat system"
      )
    ).toBe(false);
    const check = verifyIdentityRequirements({
      requestedItem: "marble heated floor system max 100 EUR total",
      lists: {
        matchedRequirements: ["floor heating", "max 100 EUR"],
        unmetRequirements: [],
        unknownRequirements: [],
      },
      evidenceHaystack: "admiral e-power talno ogrevanje comfort",
    });
    expect(check.verified).toBe(false);
  });

  it("rejects electric floor heating when marble heated floor system requested", () => {
    const identity = parseProductIdentity("marble heated floor system max 100 EUR total");
    expect(identity.coreCategory).toBe("heated floor system");
    const check = verifyIdentityRequirements({
      requestedItem: "marble heated floor system max 100 EUR total",
      lists: {
        matchedRequirements: ["floor heating", "max 100 EUR"],
        unmetRequirements: [],
        unknownRequirements: [],
      },
      evidenceHaystack: "admiral e-power electric floor heating mat talno ogrevanje",
    });
    expect(check.verified).toBe(false);
    expect(check.unresolved.join(" ").toLowerCase()).toContain("marble");
  });

  it("rejects solid oak when only oak-look decor is evidenced", () => {
    const check = verifyIdentityRequirements({
      requestedItem: "solid oak dining table max 400 EUR",
      lists: {
        matchedRequirements: ["dining table", "oak look finish"],
        unmetRequirements: [],
        unknownRequirements: [],
      },
      evidenceHaystack: "dining table with oak-look decor finish",
    });
    expect(check.verified).toBe(false);
    expect(check.unresolved.join(" ").toLowerCase()).toContain("solid oak");
  });

  it("rejects solid gold when only gold-look ceramic evidence is present", () => {
    const identity = parseProductIdentity("solid gold floor tiles max 80 EUR / m2");
    expect(identity.definingRequirements.some((req) => /gold/i.test(req.label))).toBe(true);
    const check = verifyIdentityRequirements({
      requestedItem: "solid gold floor tiles max 80 EUR / m2",
      lists: {
        matchedRequirements: ["tiles", "gold colour", "zlata"],
        unmetRequirements: [],
        unknownRequirements: [],
      },
      evidenceHaystack:
        "Granitogresne ploščice Over (61 x 30,5 cm, Zlata, Mat) porcelain ceramic gold-look tile",
    });
    expect(check.verified).toBe(false);
    expect(check.unresolved.join(" ").toLowerCase()).toMatch(/gold/);
  });

  it("rejects real marble when only marble-effect evidence is present", () => {
    const check = verifyIdentityRequirements({
      requestedItem: "real marble bathroom sink max 300 EUR",
      lists: {
        matchedRequirements: ["bathroom sink", "marble effect"],
        unmetRequirements: [],
        unknownRequirements: [],
      },
      evidenceHaystack: "ceramic bathroom sink with marble-effect finish marmor videz",
    });
    expect(check.verified).toBe(false);
    expect(check.unresolved.join(" ").toLowerCase()).toMatch(/marble/);
  });

  it("treats gold pendant lamp as color/appearance, not solid-gold material", () => {
    const identity = parseProductIdentity("gold pendant lamp max 120 EUR");
    expect(identity.definingRequirements.some((req) => /gold/i.test(req.label))).toBe(false);
    const check = verifyIdentityRequirements({
      requestedItem: "gold pendant lamp max 120 EUR",
      lists: {
        matchedRequirements: ["pendant lamp", "gold finish", "zlata barva"],
        unmetRequirements: [],
        unknownRequirements: [],
      },
      evidenceHaystack: "viseča svetilka gold finish zlata barva pendant lamp",
    });
    expect(check.verified).toBe(true);
  });

  it("rejects plain towel holder for heated towel rail category", () => {
    const identity = parseProductIdentity("chrome heated towel rail width 60cm max 150 EUR");
    expect(identity.coreCategory).toBe("heated towel rail");
    expect(
      verifyCoreCategoryInEvidence(identity, "držalo za brisače krom 60 cm towel holder")
    ).toBe(false);
    expect(
      verifyCoreCategoryInEvidence(
        identity,
        "električni kopalniški radiator za brisače 60 cm krom"
      )
    ).toBe(true);
  });
});

describe("category and budget hardening", () => {
  it("accepts black pendant lamp when category evidence is grounded", () => {
    const result = evaluateAcceptance({
      source: "primary",
      requestedItem: "black pendant lamp max 120 EUR",
      evidenceText: "Trio black LED pendant lamp",
      product: product({
        name: "Trio black LED pendant lamp",
        matchScore: 0.88,
        price: 99.99,
        priceEvidence: "web_search",
        matchedRequirements: ["black", "pendant lamp", "max 120 EUR"],
        unknownRequirements: [],
      }),
    });
    expect(result.accepted).toBe(true);
  });

  it("rejects explicit max budget when price evidence is missing", () => {
    const result = evaluateAcceptance({
      source: "primary",
      requestedItem: "black pendant lamp max 120 EUR",
      evidenceText: "Trio black LED pendant lamp",
      product: product({
        name: "Trio black LED pendant lamp",
        matchScore: 0.9,
        price: null,
        priceEvidence: "none",
        matchedRequirements: ["black", "pendant lamp"],
        unknownRequirements: ["max 120 EUR"],
      }),
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("budget_unverified");
  });

  it("accepts explicit max budget with web_search price evidence", () => {
    const result = evaluateAcceptance({
      source: "primary",
      requestedItem: "black pendant lamp max 120 EUR",
      evidenceText: "Trio black LED pendant lamp",
      product: product({
        name: "Trio black LED pendant lamp",
        matchScore: 0.9,
        price: 99.99,
        priceEvidence: "web_search",
        matchedRequirements: ["black", "pendant lamp", "max 120 EUR"],
        unknownRequirements: [],
      }),
    });
    expect(result.accepted).toBe(true);
  });

  it("allows missing price when no budget constraint exists", () => {
    const result = evaluateAcceptance({
      source: "primary",
      requestedItem: "black pendant lamp",
      evidenceText: "Trio black LED pendant lamp",
      product: product({
        name: "Trio black LED pendant lamp",
        matchScore: 0.85,
        price: null,
        priceEvidence: "none",
        matchedRequirements: ["black", "pendant lamp"],
        unknownRequirements: [],
      }),
    });
    expect(result.reason).toBe("accepted");
    expect(result.accepted).toBe(true);
  });

  it("rejects marble heated floor holdout regression candidate", () => {
    const finalized = finalizeAcceptedProduct({
      source: "targeted",
      requestedItem: "marble heated floor system max 100 EUR total",
      evidenceText: "Admiral e-power electric floor heating mat",
      product: product({
        name: "Admiral e-power electric floor heating mat",
        matchScore: 0.9,
        price: 79,
        priceEvidence: "web_search",
        matchedRequirements: ["floor heating", "max 100 EUR"],
        unknownRequirements: [],
      }),
    });
    expect(finalized.accepted).toBe(false);
    expect(["identity_requirement_unverified", "category_unverified"]).toContain(finalized.reason);
  });

  it("rejects solid-gold request when evidence is gold-look ceramic tile", () => {
    const finalized = finalizeAcceptedProduct({
      source: "targeted",
      requestedItem: "solid gold floor tiles max 80 EUR / m2",
      evidenceText: "Granitogresne ploščice Over Zlata Mat porcelain gold colour",
      product: product({
        name: "Granitogresne ploščice Over (61 x 30,5 cm, Zlata, Mat)",
        matchScore: 0.9,
        price: 29.9,
        priceEvidence: "web_search",
        matchedRequirements: ["tiles", "gold", "max 80 EUR / m2"],
        unknownRequirements: [],
      }),
    });
    expect(finalized.accepted).toBe(false);
    expect(["identity_requirement_unverified", "category_unverified"]).toContain(finalized.reason);
  });

  it("accepts gold pendant lamp with gold-finish appearance evidence", () => {
    const result = evaluateAcceptance({
      source: "primary",
      requestedItem: "gold pendant lamp max 120 EUR",
      evidenceText: "LED pendant lamp gold finish zlata barva",
      product: product({
        name: "LED pendant lamp gold finish",
        matchScore: 0.88,
        price: 99.99,
        priceEvidence: "web_search",
        matchedRequirements: ["gold", "pendant lamp", "max 120 EUR"],
        unknownRequirements: [],
      }),
    });
    expect(result.accepted).toBe(true);
  });

  it("rejects live Admiral mat system even when specs say mat system", () => {
    const finalized = finalizeAcceptedProduct({
      source: "targeted",
      requestedItem: "marble heated floor system max 100 EUR total",
      evidenceText: "Admiral E-Power Talno ogrevanje Comfort",
      product: product({
        name: "Admiral E-Power Talno ogrevanje Comfort (4 x 0,5 m, 2 m², 300 W)",
        matchScore: 0.94,
        price: 99.99,
        priceEvidence: "web_search",
        matchedRequirements: [
          "Heated floor system",
          "Electric underfloor heating",
          "max 100 EUR",
        ],
        unmetRequirements: [],
        unknownRequirements: [
          "Final installed total may exceed 100 EUR if a separately sold thermostat or installation materials are required",
          "Specified for direct installation under natural stone, which includes marble flooring",
        ],
        specifications: {
          "System type": "Electric underfloor-heating mat system",
          "Heating area": "2 m²",
          Dimensions: "4 x 0.5 m",
          Power: "300 W",
          "Installation compatibility": "Direct installation under tiles and natural stone",
        },
      }),
    });
    expect(finalized.accepted).toBe(false);
    expect(["identity_requirement_unverified", "category_unverified"]).toContain(finalized.reason);
  });
});
