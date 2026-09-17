import { describe, expect, it } from "vitest";
import { finalizeAcceptedProduct } from "./acceptancePolicy";
import {
  buildDecisionSnapshot,
  freezeDecisionSnapshot,
  preferConcreteRejectedSnapshot,
  qualifyDecisionSnapshot,
  reloadDecisionSnapshot,
  type RejectedDecisionSnapshot,
} from "./decisionSnapshot";
import {
  buildProductEvidence,
  classifyClaimAgainstEvidence,
  classifyExactDimensionAgainstEvidence,
  trustedEvidenceHaystack,
} from "./productEvidence";
import type { ProductDiscoveryProduct } from "./types";

function product(overrides: Partial<ProductDiscoveryProduct>): ProductDiscoveryProduct {
  return {
    name: "Example",
    retailer: "Shop",
    retailerDomain: "shop.si",
    productUrl: "https://shop.si/p/sink",
    price: 119,
    currency: "EUR",
    priceUnit: null,
    imageUrl: null,
    specifications: {},
    matchScore: 0.9,
    matchedRequirements: [],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: "x",
    priceEvidence: "merchant_page",
    ...overrides,
  };
}

const REQUEST = "exactly 60cm wide kitchen sink stainless steel max 200 EUR";

describe("exact dimension orientation", () => {
  it("rejects exact mismatch: evidence width 40cm", () => {
    const evidenceText = "kitchen sink width 40 cm stainless steel";
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: evidenceText })).toBe(
      "contradicted"
    );
    const finalized = finalizeAcceptedProduct({
      source: "rescue",
      requestedItem: REQUEST,
      product: product({
        matchedRequirements: ["kitchen sink", "stainless", "60 cm", "max 200 EUR"],
      }),
      evidenceText,
    });
    expect(finalized.accepted).toBe(false);
    expect(finalized.lists.unmetRequirements.join(" ").toLowerCase()).toMatch(/60|contradict/);
  });

  it("matches exact 60cm via 600mm labeled width", () => {
    const evidenceText = "pomivalno korito sirina 600 mm nerjavno jeklo 189 EUR";
    expect(
      classifyClaimAgainstEvidence({
        claim: "60 cm",
        haystack: evidenceText,
        requestedItem: REQUEST,
      })
    ).toBe("supported");
    const finalized = finalizeAcceptedProduct({
      source: "rescue",
      requestedItem: REQUEST,
      product: product({
        name: "Sink 60",
        price: 189,
        matchedRequirements: ["kitchen sink", "stainless", "60 cm", "max 200 EUR"],
      }),
      evidenceText,
    });
    expect(finalized.accepted).toBe(true);
  });

  it("leaves exact unknown for ambiguous 600x500 without orientation", () => {
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: "nerjavno korito 600x500 sink",
      })
    ).toBe("unsupported");
    const finalized = finalizeAcceptedProduct({
      source: "primary",
      requestedItem: REQUEST,
      product: product({
        matchedRequirements: ["kitchen sink", "stainless", "60 cm", "max 200 EUR"],
      }),
      evidenceText: "nerjavno korito 600x500 sink",
    });
    expect(finalized.accepted).toBe(false);
    expect(finalized.reason).toBe("insufficient_evidence");
  });
});

describe("decisionSnapshot freeze/reload", () => {
  it("preserves targeted/rescue ProductEvidence and acceptance through freeze/reload", () => {
    const evidence = buildProductEvidence({
      productUrl: "https://shop.si/p/sink-60",
      sources: [
        {
          url: "https://shop.si/p/sink-60",
          title: "Sink width 60 cm stainless",
          snippet: "sirina 60 cm nerjavno 149 EUR",
        },
      ],
      enrichment: {
        status: "success",
        pageTitle: "Sink 60",
        metaDescription: null,
        productName: "Sink 60",
        brand: null,
        price: 149,
        currency: "EUR",
        imageUrl: null,
        availability: null,
        sku: null,
        productText: "sirina 60 cm nerjavno jeklo",
        jsonLdProductFound: true,
      },
      trustedDisplayName: "Sink 60",
    });

    const prod = product({
      name: "Sink 60",
      productUrl: "https://shop.si/p/sink-60",
      price: 149,
      matchedRequirements: ["kitchen sink", "stainless", "60 cm", "max 200 EUR"],
    });
    const finalized = finalizeAcceptedProduct({
      source: "targeted",
      requestedItem: REQUEST,
      product: prod,
      evidenceText: trustedEvidenceHaystack(evidence),
    });

    const snapshot = buildDecisionSnapshot({
      requestedItem: REQUEST,
      path: "targeted",
      product: finalized.product,
      acceptance: finalized,
      productEvidence: evidence,
    });

    const reloaded = reloadDecisionSnapshot(freezeDecisionSnapshot(snapshot));
    expect(reloaded.path).toBe("targeted");
    expect(reloaded.productEvidence.priceEvidence[0]?.value).toBe(149);
    expect(reloaded.acceptanceResult.accepted).toBe(finalized.accepted);

    const qualified = qualifyDecisionSnapshot(reloaded);
    expect(qualified.qualifies).toBe(finalized.accepted);
  });

  it("rescue snapshot retains merchant price evidence after freeze/reload", () => {
    const evidence = buildProductEvidence({
      productUrl: "https://shop.si/p/vase",
      sources: [{ url: "https://shop.si/p/vase", title: "White ceramic vase 30cm", snippet: null }],
      enrichment: {
        status: "success",
        pageTitle: "White ceramic vase 30cm",
        metaDescription: null,
        productName: "White ceramic vase 30cm",
        brand: null,
        price: 29,
        currency: "EUR",
        imageUrl: null,
        availability: null,
        sku: null,
        productText: "ceramic white height 30 cm",
        jsonLdProductFound: true,
      },
    });
    expect(evidence.priceEvidence.some((f) => f.value === 29)).toBe(true);
    const snapshot = buildDecisionSnapshot({
      requestedItem: "ceramic vase white height 30cm max 40 EUR",
      path: "rescue",
      product: product({
        name: "White ceramic vase 30cm",
        productUrl: "https://shop.si/p/vase",
        price: 29,
        matchedRequirements: ["vase", "ceramic", "white", "30 cm", "max 40 EUR"],
      }),
      acceptance: {
        accepted: true,
        matchScore: 0.9,
        requirementCoverage: 1,
        reason: "accepted",
      },
      productEvidence: evidence,
    });
    const reloaded = reloadDecisionSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(reloaded.productEvidence.priceEvidence.some((f) => f.value === 29)).toBe(true);
  });
});

describe("preferConcreteRejectedSnapshot", () => {
  const evidence: import("./productEvidence").ProductEvidence = {
    productUrl: "https://shop.si/p/a",
    productNameEvidence: [],
    categoryEvidence: [],
    priceEvidence: [],
    materialEvidence: [],
    colorEvidence: [],
    dimensionEvidence: [],
    generalTextEvidence: [],
  };

  function snap(path: RejectedDecisionSnapshot["path"], url: string): RejectedDecisionSnapshot {
    return {
      requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      path,
      candidateId: null,
      productUrl: url,
      productEvidence: { ...evidence, productUrl: url },
      normalizedRequirements: {
        matchedRequirements: [],
        unmetRequirements: [],
        unknownRequirements: [],
      },
      acceptanceResult: {
        accepted: false,
        score: 0.8,
        coverage: 0.5,
        reason: "budget_unverified",
      },
      rejectionReason: "budget_unverified",
    };
  }

  it("keeps primary when later stage selects none", () => {
    const primary = snap("primary", "https://bauhaus.si/p/classic-40");
    expect(preferConcreteRejectedSnapshot(primary, undefined)?.path).toBe("primary");
    expect(preferConcreteRejectedSnapshot(primary, null)?.productUrl).toContain("classic-40");
  });

  it("lets a later concrete rejection replace primary", () => {
    const primary = snap("primary", "https://bauhaus.si/p/classic-40");
    const rescue = snap("rescue", "https://merkur.si/p/sink-b");
    expect(preferConcreteRejectedSnapshot(primary, rescue)?.path).toBe("rescue");
    expect(preferConcreteRejectedSnapshot(primary, rescue)?.productUrl).toContain("sink-b");
  });
});
