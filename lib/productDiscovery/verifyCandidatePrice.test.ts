import { describe, expect, it, vi, beforeEach } from "vitest";
import OpenAI from "openai";
import {
  attemptPriceVerificationRecovery,
  buildPriceVerificationDiagnostics,
} from "./attemptPriceVerificationRecovery";
import { finalizeAcceptedProduct } from "./acceptancePolicy";
import { clearCandidateEnrichmentCache } from "./enrichCandidate";
import { shouldAttemptPriceVerification } from "./priceVerificationEligibility";
import {
  applyVerifiedPriceToCandidate,
  clearCandidatePriceVerificationCache,
  confirmCandidateProductIdentity,
  verifyCandidatePrice,
} from "./verifyCandidatePrice";
import type { ProductDiscoveryProduct, ProductDiscoverySource } from "./types";

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
    matchScore: 0.85,
    matchedRequirements: [],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: "Example",
    priceEvidence: "none",
    ...overrides,
  };
}

describe("priceVerificationEligibility", () => {
  it("does not attempt for identity failures", () => {
    const finalized = finalizeAcceptedProduct({
      source: "primary",
      requestedItem: "diamond bathroom sink max 100 EUR",
      product: product({
        name: "Bathroom sink",
        matchedRequirements: ["bathroom sink", "max 100 EUR"],
        unknownRequirements: ["diamond"],
      }),
    });
    expect(
      shouldAttemptPriceVerification({
        requestedItem: "diamond bathroom sink max 100 EUR",
        source: "primary",
        finalized,
        allowlistDomains: ["shop.si"],
        sources: [{ url: "https://shop.si/p/example", title: "Bathroom sink" }],
      })
    ).toBe(false);
  });

  it("does not attempt when no explicit budget exists", () => {
    const finalized = finalizeAcceptedProduct({
      source: "primary",
      requestedItem: "black pendant lamp",
      product: product({
        name: "Black pendant lamp",
        matchedRequirements: ["black", "pendant lamp"],
      }),
    });
    expect(finalized.reason).not.toBe("budget_unverified");
  });
});

describe("verifyCandidatePrice existing evidence", () => {
  beforeEach(() => {
    clearCandidateEnrichmentCache();
    clearCandidatePriceVerificationCache();
  });

  it("recovers price from existing source evidence without dedicated search", async () => {
    const candidate = product({
      name: "Globo Gorley black pendant lamp",
      productUrl: "https://obi.si/p/gorley",
      retailerDomain: "obi.si",
      matchedRequirements: ["black", "pendant lamp", "max 120 EUR"],
      unknownRequirements: [],
    });
    const sources: ProductDiscoverySource[] = [
      {
        url: "https://obi.si/p/gorley",
        title: "Globo Gorley black pendant lamp €99.99",
      },
    ];

    const verification = await verifyCandidatePrice({
      requestedItem: "black pendant lamp max 120 EUR",
      candidate,
      allowlistDomains: ["obi.si"],
      sources,
      allowDedicatedSearch: false,
    });

    expect(verification.status).toBe("verified");
    expect(verification.price).toBe(99.99);
    expect(verification.evidenceType).toBe("web_search");
    expect(verification.usedDedicatedSearch).toBe(false);
  });

  it("rejects category page from-price evidence", async () => {
    const candidate = product({
      name: "Globo Gorley black pendant lamp",
      productUrl: "https://obi.si/p/gorley",
      retailerDomain: "obi.si",
    });
    const sources: ProductDiscoverySource[] = [
      {
        url: "https://obi.si/category/lamps",
        title: "Pendant lamps from €59",
      },
    ];

    const verification = await verifyCandidatePrice({
      requestedItem: "black pendant lamp max 120 EUR",
      candidate,
      allowlistDomains: ["obi.si"],
      sources,
      allowDedicatedSearch: false,
    });

    expect(verification.status).toBe("not_found");
  });
});

describe("confirmCandidateProductIdentity", () => {
  it("rejects variant mismatch between 60cm and 80cm products", () => {
    const identity = confirmCandidateProductIdentity({
      candidate: product({
        name: "Alveus Classic 30 60cm sink",
        productUrl: "https://shop.si/p/classic-30",
      }),
      evidenceText: "Alveus Classic 40 80 cm sink €149",
      evidenceUrl: "https://shop.si/p/classic-40",
    });
    expect(identity.confirmed).toBe(false);
  });
});

describe("attemptPriceVerificationRecovery", () => {
  beforeEach(() => {
    clearCandidatePriceVerificationCache();
    clearCandidateEnrichmentCache();
  });

  it("reruns acceptance and accepts under-budget verified price", async () => {
    const candidate = product({
      name: "Globo Gorley black pendant lamp",
      productUrl: "https://obi.si/p/gorley",
      retailerDomain: "obi.si",
      matchScore: 0.88,
      matchedRequirements: ["black", "pendant lamp", "max 120 EUR"],
      unknownRequirements: [],
    });
    const finalized = finalizeAcceptedProduct({
      source: "primary",
      requestedItem: "black pendant lamp max 120 EUR",
      evidenceText: "Globo Gorley black pendant lamp",
      product: candidate,
    });
    expect(finalized.reason).toBe("budget_unverified");

    const recovery = await attemptPriceVerificationRecovery({
      client: new OpenAI({ apiKey: "test-key" }),
      requestedItem: "black pendant lamp max 120 EUR",
      allowlistDomains: ["obi.si"],
      sources: [{ url: "https://obi.si/p/gorley", title: "Globo Gorley €99.99" }],
      source: "primary",
      finalized,
      evidenceText: "Globo Gorley black pendant lamp",
    });

    expect(recovery.attempted).toBe(true);
    expect(recovery.recovered).toBe(true);
    expect(recovery.finalized?.accepted).toBe(true);
    expect(recovery.finalized?.product.price).toBe(99.99);
    expect(recovery.finalized?.product.priceEvidence).toBe("web_search");
  });

  it("rejects over-budget verified price via acceptance rerun", async () => {
    const candidate = product({
      name: "Globo Gorley black pendant lamp",
      productUrl: "https://obi.si/p/gorley",
      retailerDomain: "obi.si",
      matchScore: 0.88,
      matchedRequirements: ["black", "pendant lamp"],
      unknownRequirements: ["max 120 EUR"],
    });
    const finalized = finalizeAcceptedProduct({
      source: "primary",
      requestedItem: "black pendant lamp max 120 EUR",
      product: candidate,
    });

    const priced = applyVerifiedPriceToCandidate(candidate, {
      status: "verified",
      price: 149,
      currency: "EUR",
      evidenceUrl: "https://obi.si/p/gorley",
      evidenceType: "web_search",
      productIdentityConfirmed: true,
      evidenceText: "€149",
      usedDedicatedSearch: false,
      identityConfirmationMethod: "source_text",
    });
    const rerun = finalizeAcceptedProduct({
      source: "primary",
      requestedItem: "black pendant lamp max 120 EUR",
      product: priced,
    });

    expect(rerun.accepted).toBe(false);
    expect(rerun.reason).toBe("hard_constraint_unmet");
  });

  it("does not attempt for non-price rejection reasons", async () => {
    const finalized = finalizeAcceptedProduct({
      source: "primary",
      requestedItem: "marble heated floor system max 100 EUR total",
      product: product({
        name: "Electric heating mat",
        matchScore: 0.9,
        matchedRequirements: ["floor heating", "max 100 EUR"],
      }),
    });
    expect(finalized.reason).not.toBe("budget_unverified");

    const recovery = await attemptPriceVerificationRecovery({
      client: new OpenAI({ apiKey: "test-key" }),
      requestedItem: "marble heated floor system max 100 EUR total",
      allowlistDomains: ["shop.si"],
      sources: [{ url: "https://shop.si/p/example", title: "Electric heating mat" }],
      source: "primary",
      finalized,
    });

    expect(recovery.attempted).toBe(false);
  });
});

describe("buildPriceVerificationDiagnostics", () => {
  it("marks recovered when acceptance succeeds after verification", () => {
    const diagnostics = buildPriceVerificationDiagnostics({
      attempted: true,
      durationMs: 1200,
      recovered: true,
      verification: {
        status: "verified",
        price: 99.99,
        currency: "EUR",
        evidenceUrl: "https://shop.si/p/example",
        evidenceType: "web_search",
        productIdentityConfirmed: true,
        evidenceText: "€99.99",
        usedDedicatedSearch: false,
        identityConfirmationMethod: "source_text",
      },
    });
    expect(diagnostics.priceVerificationRecovered).toBe(true);
    expect(diagnostics.priceVerificationSucceeded).toBe(true);
  });
});

describe("verifyCandidatePrice conflicting prices", () => {
  beforeEach(() => {
    clearCandidatePriceVerificationCache();
  });

  it("returns conflicting when source evidence shows multiple prices", async () => {
    const candidate = product({
      name: "Globo Gorley pendant lamp",
      productUrl: "https://obi.si/p/gorley",
      retailerDomain: "obi.si",
    });

    const verification = await verifyCandidatePrice({
      requestedItem: "black pendant lamp max 120 EUR",
      candidate,
      allowlistDomains: ["obi.si"],
      sources: [
        { url: "https://obi.si/p/gorley", title: "Globo Gorley pendant lamp €99" },
        { url: "https://obi.si/p/gorley", title: "Globo Gorley pendant lamp €129 promo" },
      ],
      allowDedicatedSearch: false,
    });

    expect(verification.status).toBe("conflicting");
  });
});
