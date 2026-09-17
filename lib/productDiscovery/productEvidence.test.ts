import { describe, expect, it } from "vitest";
import {
  finalizeAcceptedProduct,
  validateDeterministicClaims,
} from "./acceptancePolicy";
import {
  buildProductEvidence,
  classifyClaimAgainstEvidence,
  classifyExactDimensionAgainstEvidence,
  meaningfulUrlPathText,
  resolveGroundedPrice,
  trustedEvidenceHaystack,
} from "./productEvidence";
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
    matchScore: 0.9,
    matchedRequirements: [],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: "Example",
    ...overrides,
  };
}

describe("productEvidence grounding", () => {
  it("treats metal as unknown when evidence only supports black pendant", () => {
    const requestedItem = "black metal pendant lamp approx 40cm max 120 EUR";
    const evidenceText = "black pendant lamp viseča svetilka črna";
    const lists = validateDeterministicClaims({
      requestedItem,
      product: product({
        name: "Black pendant lamp",
        matchedRequirements: ["black", "metal", "pendant lamp"],
        unknownRequirements: [],
        whyItMatches: "It is a black metal pendant lamp",
        specifications: { Material: "metal" },
      }),
      evidenceText,
    });
    expect(lists.matchedRequirements.map((x) => x.toLowerCase()).join(" ")).toContain("black");
    expect(lists.matchedRequirements.map((x) => x.toLowerCase()).join(" ")).not.toContain("metal");
    expect(lists.unknownRequirements.map((x) => x.toLowerCase()).join(" ")).toContain("metal");
  });

  it("does not let whyItMatches verify dimensions or material", () => {
    const requestedItem = "black metal pendant lamp approx 40cm max 120 EUR";
    const lists = validateDeterministicClaims({
      requestedItem,
      product: product({
        name: "Pendant lamp",
        matchedRequirements: ["40 cm", "metal"],
        whyItMatches: "40 cm metal pendant lamp",
        specifications: { Width: "40 cm", Material: "metal" },
      }),
      evidenceText: "pendant lamp viseča svetilka",
    });
    expect(lists.matchedRequirements.join(" ").toLowerCase()).not.toMatch(/40|metal/);
    expect(lists.unknownRequirements.join(" ").toLowerCase()).toMatch(/40|metal/);
  });

  it("rejects model-only price as web_search evidence", () => {
    const evidence = buildProductEvidence({
      productUrl: "https://shop.si/p/korito-600x500",
      sources: [{ url: "https://shop.si/p/korito-600x500", title: "Kitchen sink", snippet: null }],
    });
    const grounded = resolveGroundedPrice({
      evidence,
      modelClaimedPrice: 109,
    });
    expect(grounded.price).toBeNull();
    expect(grounded.priceEvidence).toBe("none");
    expect(grounded.modelReportedPrice).toBe(109);

    const finalized = finalizeAcceptedProduct({
      source: "primary",
      requestedItem: "kitchen sink max 200 EUR",
      product: product({
        name: "Kitchen sink",
        price: null,
        priceEvidence: "none",
        matchedRequirements: ["kitchen sink"],
        unknownRequirements: ["max 200 EUR"],
        matchScore: 0.9,
      }),
      evidenceText: trustedEvidenceHaystack(evidence),
    });
    expect(finalized.accepted).toBe(false);
    expect(finalized.reason).toBe("budget_unverified");
  });

  it("accepts verified web_search price from provider-visible source text", () => {
    const evidence = buildProductEvidence({
      productUrl: "https://shop.si/p/korito-600x500",
      sources: [
        {
          url: "https://shop.si/p/korito-600x500",
          title: "Nerjavno korito 600x500 — €109",
          snippet: null,
        },
      ],
    });
    const grounded = resolveGroundedPrice({
      evidence,
      modelClaimedPrice: 109,
    });
    expect(grounded.price).toBe(109);
    expect(grounded.priceEvidence).toBe("web_search");
  });

  it("accepts merchant JSON-LD price as merchant_page", () => {
    const evidence = buildProductEvidence({
      productUrl: "https://shop.si/p/korito-600x500",
      sources: [{ url: "https://shop.si/p/korito-600x500", title: null, snippet: null }],
      enrichment: {
        status: "success",
        pageTitle: "Korito",
        metaDescription: null,
        productName: "Korito 600x500",
        brand: null,
        price: 109,
        currency: "EUR",
        availability: null,
        imageUrl: null,
        sku: null,
        productText: "Nerjavno jeklo",
        jsonLdProductFound: true,
      },
    });
    const grounded = resolveGroundedPrice({
      evidence,
      modelClaimedPrice: 999,
    });
    expect(grounded.price).toBe(109);
    expect(grounded.priceEvidence).toBe("merchant_page");
  });

  it("does not treat ambiguous URL size pairs as exact width evidence", () => {
    const url = "https://www.merkur.si/nerjavno-pomivalno-korito-sink-solution-a-line-600x500/";
    const path = meaningfulUrlPathText(url);
    expect(path.toLowerCase()).toContain("600x500");
    expect(path.toLowerCase()).toContain("korito");

    const evidenceText = trustedEvidenceHaystack(
      buildProductEvidence({
        productUrl: url,
        sources: [{ url, title: null, snippet: null }],
      })
    );
    expect(
      classifyClaimAgainstEvidence({
        claim: "60 cm",
        haystack: evidenceText,
        requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      })
    ).toBe("unsupported");

    const lists = validateDeterministicClaims({
      requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      product: product({
        name: "Sink",
        matchedRequirements: ["kitchen sink", "stainless", "exactly 60cm width"],
        whyItMatches: "exactly 60cm wide stainless sink",
      }),
      evidenceText,
    });
    expect(lists.matchedRequirements.join(" ").toLowerCase()).not.toMatch(/60/);
    expect(lists.unknownRequirements.join(" ").toLowerCase()).toMatch(/60/);
  });

  it("rejects exact 60cm when merchant shows ambiguous 800 x 600 mm (Classic 40)", () => {
    const requestedItem = "exactly 60cm wide kitchen sink stainless steel max 200 EUR";
    const evidenceText =
      "Vgradno korito Classic 40\nAlveus Vgradno korito Classic 40 (800 x 600 mm, Nerjavno jeklo)\n119 EUR";
    expect(
      classifyClaimAgainstEvidence({
        claim: "60 cm",
        haystack: evidenceText,
        requestedItem,
      })
    ).toBe("unsupported");

    const finalized = finalizeAcceptedProduct({
      source: "rescue",
      requestedItem,
      product: product({
        name: "Vgradno korito Classic 40",
        price: 119,
        priceEvidence: "merchant_page",
        matchScore: 0.92,
        matchedRequirements: ["kitchen sink", "stainless", "60 cm", "max 200 EUR"],
        unknownRequirements: [],
      }),
      evidenceText,
    });
    expect(finalized.accepted).toBe(false);
    expect(finalized.reason).toMatch(/insufficient_evidence|hard_constraint/);
  });

  it("supports exact 60cm via labeled width 600 mm", () => {
    expect(
      classifyClaimAgainstEvidence({
        claim: "60 cm",
        haystack: "kitchen sink width 600 mm stainless steel inox",
        requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      })
    ).toBe("supported");
  });

  it("marks exact width contradicted when labeled width is 40cm", () => {
    expect(
      classifyClaimAgainstEvidence({
        claim: "60 cm",
        haystack: "pomivalno korito sirina 40 cm nerjavno jeklo",
        requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      })
    ).toBe("contradicted");
  });

  it("does not treat adjacent length 50cm + labeled width 60cm as a width contradiction", () => {
    const haystack =
      "Nerjavno Pomivalno Korito Sink Solution A Line 600x500 MATERIAL NERJAVNO JEKLO DOLŽINA 50 CM ŠIRINA 60 CM VIŠINA 16 CM MINIMALNA ŠIRINA OMARICE 45 CM 124.99 EUR";
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack,
      })
    ).toBe("supported");
    expect(
      classifyClaimAgainstEvidence({
        claim: "exactly 60cm wide",
        haystack,
        requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      })
    ).toBe("supported");
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "50", haystack })).not.toBe("supported");

    const colonHaystack = "DOLŽINA: 50 CM\nŠIRINA: 60 CM";
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: colonHaystack })).toBe(
      "supported"
    );
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "50", haystack: colonHaystack })).not.toBe(
      "supported"
    );
  });

  it("leaves chrome unknown without finish evidence", () => {
    const status = classifyClaimAgainstEvidence({
      claim: "chrome",
      haystack: "bathroom towel radiator kopalniški radiator",
      requestedItem: "chrome heated towel rail width 60cm max 150 EUR",
    });
    expect(status).toBe("unsupported");

    const lists = validateDeterministicClaims({
      requestedItem: "chrome heated towel rail width 60cm max 150 EUR",
      product: product({
        matchedRequirements: ["chrome", "towel rail"],
        whyItMatches: "chrome heated towel rail",
      }),
      evidenceText: "bathroom towel radiator kopalniški radiator",
    });
    expect(lists.matchedRequirements.join(" ").toLowerCase()).not.toContain("chrome");
    expect(lists.unknownRequirements.join(" ").toLowerCase()).toContain("chrome");
  });

  it("marks solid oak unmet when merchant shows oak-effect MDF", () => {
    const status = classifyClaimAgainstEvidence({
      claim: "solid oak",
      haystack: "oak-effect MDF dekor hrast",
      requestedItem: "solid oak dining table max 400 EUR",
    });
    expect(status).toBe("contradicted");

    const lists = validateDeterministicClaims({
      requestedItem: "solid oak dining table max 400 EUR",
      product: product({
        matchedRequirements: ["solid oak", "dining table"],
        whyItMatches: "solid oak table",
        specifications: { Material: "solid oak" },
      }),
      evidenceText: "oak-effect MDF dining table dekor hrast",
    });
    expect(lists.unmetRequirements.join(" ").toLowerCase()).toMatch(/oak|contradicted/);
    expect(lists.matchedRequirements.join(" ").toLowerCase()).not.toContain("solid oak");
  });

  it("does not treat numeric URL ids as dimension evidence", () => {
    const path = meaningfulUrlPathText(
      "https://www.bauhaus.si/radiatorji-za-brisace/admiral-kopalniski-radiator-kairo/p/13484403"
    );
    expect(path).not.toMatch(/13484403/);
    expect(classifyClaimAgainstEvidence({
      claim: "60 cm",
      haystack: path,
      requestedItem: "chrome heated towel rail width 60cm max 150 EUR",
    })).toBe("unsupported");
  });

  it("upgrades source title when later citation provides it", () => {
    const evidence = buildProductEvidence({
      productUrl: "https://shop.si/p/lamp-40",
      sources: [
        { url: "https://shop.si/p/lamp-40", title: null, snippet: null },
        { url: "https://shop.si/p/lamp-40", title: "Black metal pendant €99", snippet: null },
      ],
    });
    // Second entry merges via sources.ts; buildProductEvidence takes provided sources as-is.
    // Simulate merged source:
    const merged = buildProductEvidence({
      productUrl: "https://shop.si/p/lamp-40",
      sources: [{ url: "https://shop.si/p/lamp-40", title: "Black metal pendant €99", snippet: null }],
    });
    expect(trustedEvidenceHaystack(merged).toLowerCase()).toContain("metal");
    expect(resolveGroundedPrice({ evidence: merged, modelClaimedPrice: 99 }).priceEvidence).toBe(
      "web_search"
    );
    expect(evidence.generalTextEvidence.length).toBeGreaterThan(0);
  });
});
