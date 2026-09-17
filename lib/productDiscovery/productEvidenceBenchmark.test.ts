import { describe, expect, it } from "vitest";
import {
  assessFrozenEvidenceCandidate,
  buildCandidateProductEvidence,
  deserializeProductEvidence,
  freezeEvidenceCandidatesRoundTrip,
  productEvidenceSemanticallyEqual,
  serializeProductEvidence,
} from "./productEvidenceBenchmark";
import { buildProductEvidence } from "./productEvidence";
import type { RescueCandidate } from "./rescueCandidates";

function candidate(overrides: Partial<RescueCandidate> = {}): RescueCandidate {
  return {
    id: "c1",
    url: "https://shop.si/p/chrome-radiator-60x100",
    domain: "shop.si",
    preRankScore: 0.8,
    sourceTitle: "Chrome heated towel radiator 60 x 100 cm",
    sourceEvidence: "Chrome kromiran radiator za brisače 60x100 cm €129",
    enrichment: {
      status: "success",
      pageTitle: "Chrome heated towel radiator 60 x 100 cm",
      metaDescription: null,
      productName: "Chrome heated towel radiator 60 x 100 cm",
      brand: null,
      price: 129,
      currency: "EUR",
      imageUrl: null,
      availability: null,
      sku: null,
      productText: "Chrome kromiran radiator 60 cm width stainless steel finish",
      jsonLdProductFound: true,
    },
    ...overrides,
  };
}

describe("productEvidenceBenchmark freeze/reload", () => {
  it("preserves EvidenceFact kind/field/value/text/url through serialization", () => {
    const evidence = buildProductEvidence({
      productUrl: "https://shop.si/p/vase-30",
      sources: [
        {
          url: "https://shop.si/p/vase-30",
          title: "White ceramic vase 30 cm",
          snippet: "Keramična vaza bela višina 30 cm, 39 EUR",
        },
      ],
      enrichment: {
        status: "success",
        pageTitle: "White ceramic vase 30 cm",
        metaDescription: "White ceramic vase",
        productName: "White ceramic vase 30 cm",
        brand: null,
        price: 39,
        currency: "EUR",
        imageUrl: null,
        availability: null,
        sku: null,
        productText: "Material: ceramic. Color: white. Height: 30 cm.",
        jsonLdProductFound: true,
      },
      trustedDisplayName: "White ceramic vase 30 cm",
    });

    const frozen = serializeProductEvidence(evidence);
    const reloaded = deserializeProductEvidence(JSON.parse(JSON.stringify(frozen)));

    const allFacts = [
      ...reloaded.productNameEvidence,
      ...reloaded.categoryEvidence,
      ...reloaded.priceEvidence,
      ...reloaded.materialEvidence,
      ...reloaded.colorEvidence,
      ...reloaded.dimensionEvidence,
      ...reloaded.generalTextEvidence,
    ];
    expect(allFacts.length).toBeGreaterThan(0);
    for (const fact of allFacts) {
      expect(fact).toEqual(
        expect.objectContaining({
          kind: expect.any(String),
          field: expect.any(String),
        })
      );
      expect("value" in fact).toBe(true);
      expect("text" in fact).toBe(true);
      expect("url" in fact).toBe(true);
    }
    expect(productEvidenceSemanticallyEqual(evidence, reloaded)).toBe(true);
  });

  it("production ProductEvidence equals benchmark ProductEvidence after freeze/reload", () => {
    const c = candidate();
    const productionEvidence = buildCandidateProductEvidence(c);
    const assessed = assessFrozenEvidenceCandidate({
      requestedItem: "chrome heated towel rail width 60cm max 150 EUR",
      candidate: c,
      modelClaims: {
        name: "MODEL CLAIM NAME SHOULD BE IGNORED",
        price: 1,
        whyItMatches: "claims chrome 60cm for €1",
        specifications: { Material: "plastic" },
      },
    });

    const reloadedCandidates = freezeEvidenceCandidatesRoundTrip([assessed]);
    const reloadedEvidence = deserializeProductEvidence(reloadedCandidates[0]!.evidence);

    expect(productEvidenceSemanticallyEqual(productionEvidence, assessed.evidence)).toBe(true);
    expect(productEvidenceSemanticallyEqual(productionEvidence, reloadedEvidence)).toBe(true);
    // Model claims must not rewrite evidence facts.
    expect(assessed.modelClaims?.price).toBe(1);
    expect(assessed.evidenceCoverage.price).toBe(129);
    expect(assessed.evidenceCoverage.priceKind).toBe("merchant_page");
  });

  it("marks relevant vs fully qualifying without using model claims", () => {
    const relevantOnly = assessFrozenEvidenceCandidate({
      requestedItem: "chrome heated towel rail width 60cm max 150 EUR",
      candidate: candidate({
        enrichment: {
          status: "success",
          pageTitle: "Chrome heated towel radiator",
          metaDescription: null,
          productName: "Chrome heated towel radiator",
          brand: null,
          price: null,
          currency: null,
          imageUrl: null,
          availability: null,
          sku: null,
          productText: "Chrome kromiran radiator for towels",
          jsonLdProductFound: true,
        },
        sourceEvidence: "Chrome heated towel radiator",
      }),
      modelClaims: { price: 99, whyItMatches: "60cm chrome under budget" },
    });
    expect(relevantOnly.relevantCandidate).toBe(true);
    expect(relevantOnly.fullyQualifyingCandidate).toBe(false);
    expect(relevantOnly.evidenceCoverage.priceKind).toBe("none");
  });
});
