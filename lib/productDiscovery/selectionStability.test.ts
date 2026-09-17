import { describe, expect, it } from "vitest";
import { assessAcceptanceAlignedQualification } from "./selectionBenchmarkGroundTruth";
import {
  buildIsolatedSelectionUserMessage,
  ISOLATED_SELECTION_SYSTEM_PROMPT,
} from "./selectionStabilityPrompt";
import type { RescueCandidate } from "./rescueCandidates";

function candidate(overrides: Partial<RescueCandidate>): RescueCandidate {
  return {
    id: "candidate_1",
    url: "https://bauhaus.si/p/example",
    domain: "bauhaus.si",
    sourceTitle: "Example",
    sourceEvidence: "example",
    preRankScore: 50,
    enrichment: null,
    ...overrides,
  };
}

describe("selectionStabilityPrompt", () => {
  it("keeps selector instructions search-free and candidateId-only", () => {
    expect(ISOLATED_SELECTION_SYSTEM_PROMPT).toMatch(/NOT searching the web/i);
    expect(ISOLATED_SELECTION_SYSTEM_PROMPT).toMatch(/candidateId/);
    const msg = buildIsolatedSelectionUserMessage({
      requestedItem: "chrome heated towel rail width 60cm max 150 EUR",
      candidates: [
        {
          id: "candidate_1",
          domain: "bauhaus.si",
          preRankScore: 80,
          sourceTitle: "Radiator",
          sourceEvidence: "radiator",
          merchantEvidence: "kopalniški radiator 60 cm",
          enrichmentStatus: "success",
        },
      ],
    });
    expect(msg).toContain("isolated_source_backed_selection");
  });
});

describe("acceptance-aligned ground truth", () => {
  it("rejects white radiator for chrome heated towel rail", () => {
    const result = assessAcceptanceAlignedQualification(
      "chrome heated towel rail width 60cm max 150 EUR",
      candidate({
        enrichment: {
          status: "success",
          pageTitle: "Kopalniški radiator bel 60 cm",
          metaDescription: null,
          productName: "Sanotechnik Kopalniški radiator Bari bel 60 cm",
          brand: null,
          price: 129,
          currency: "EUR",
          imageUrl: null,
          availability: null,
          sku: null,
          productText: "kopalniški radiator bel 60 cm širina",
          jsonLdProductFound: true,
        },
      })
    );
    expect(result.qualifies).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/white|chrome/i);
  });

  it("rejects tile pages for ceramic vase request", () => {
    const result = assessAcceptanceAlignedQualification(
      "ceramic vase white height 30cm max 40 EUR",
      candidate({
        enrichment: {
          status: "success",
          pageTitle: "Stenska ploščica Blanco",
          metaDescription: null,
          productName: "Stenska ploščica Blanco",
          brand: null,
          price: 24.17,
          currency: "EUR",
          imageUrl: null,
          availability: null,
          sku: null,
          productText: "stenska ploščica bela keramika 30 cm",
          jsonLdProductFound: true,
        },
      })
    );
    expect(result.qualifies).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/tile|vase/i);
  });

  it("accepts chrome towel radiator with 60cm and budget", () => {
    const result = assessAcceptanceAlignedQualification(
      "chrome heated towel rail width 60cm max 150 EUR",
      candidate({
        url: "https://www.bauhaus.si/radiatorji-za-brisace/bial-alta/p/123",
        enrichment: {
          status: "success",
          pageTitle: "Bial Alta Kopalniški radiator (60 x 97.4 cm) krom",
          metaDescription: null,
          productName: "Bial Alta Kopalniški radiator (60 x 97.4 cm)",
          brand: "Bial",
          price: 149,
          currency: "EUR",
          imageUrl: null,
          availability: null,
          sku: null,
          productText: "električni kopalniški radiator za brisače krom 60 cm širina",
          jsonLdProductFound: true,
        },
      })
    );
    expect(result.qualifies).toBe(true);
  });

  it("rejects kitchen sink without exact 60cm evidence", () => {
    const result = assessAcceptanceAlignedQualification(
      "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      candidate({
        enrichment: {
          status: "success",
          pageTitle: "Inox korito 50 cm",
          metaDescription: null,
          productName: "Inox pomivalno korito 50x40",
          brand: null,
          price: 119,
          currency: "EUR",
          imageUrl: null,
          availability: null,
          sku: null,
          productText: "pomivalno kuhinjsko korito inox nerjavno 50 cm",
          jsonLdProductFound: true,
        },
      })
    );
    expect(result.qualifies).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/60cm|exact/i);
  });

  it("rejects 1200x600 mm sink as not exact 60cm width", () => {
    const result = assessAcceptanceAlignedQualification(
      "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      candidate({
        enrichment: {
          status: "success",
          pageTitle: "Alveus Classic 100 1200x600 Mm",
          metaDescription: null,
          productName: "Nerjavno Pomivalno Korito Alveus Classic 100, Desni, Satin 1200x600 Mm",
          brand: null,
          price: 172.89,
          currency: "EUR",
          imageUrl: null,
          availability: null,
          sku: null,
          productText:
            "Nerjavno Pomivalno Korito Alveus Classic 100 DOLŽINA (PROTI STENI) 60 CM ŠIRINA 120 CM inox 1200x600 mm",
          jsonLdProductFound: true,
        },
      })
    );
    expect(result.qualifies).toBe(false);
  });
});
