import { describe, expect, it } from "vitest";
import {
  buildRequirementPolicyHints,
  extractMaxPriceEur,
  normalizeMatchScore,
  normalizeRequirementLists,
  usesApproximateLanguage,
} from "./matchPolicy";

describe("matchPolicy", () => {
  it("detects approximate language", () => {
    expect(usesApproximateLanguage("black metal pendant lamp approx 40cm max 120 EUR")).toBe(true);
    expect(usesApproximateLanguage("exactly 40cm lamp")).toBe(false);
  });

  it("extracts max price from request", () => {
    expect(extractMaxPriceEur("pendant lamp max 120 EUR")).toBe(120);
    expect(extractMaxPriceEur("laminat max 25 EUR/m2")).toBe(25);
  });

  it("moves unknown material out of unmet when not explicitly contradicted", () => {
    const normalized = normalizeRequirementLists(
      "black metal pendant lamp approx 40cm max 120 EUR",
      {
        matchedRequirements: ["black", "pendant lamp", "approx 40cm", "under max 120 EUR"],
        unmetRequirements: ["metal"],
        unknownRequirements: [],
      },
      119.99
    );
    expect(normalized.unmetRequirements).not.toContain("metal");
    expect(normalized.unknownRequirements.join(" ").toLowerCase()).toContain("metal");
  });

  it("keeps explicit material mismatch in unmet", () => {
    const normalized = normalizeRequirementLists(
      "metal pendant lamp",
      {
        matchedRequirements: ["pendant lamp"],
        unmetRequirements: ["material is plastic instead of metal"],
        unknownRequirements: [],
      },
      49.99
    );
    expect(normalized.unmetRequirements.join(" ").toLowerCase()).toContain("plastic");
  });

  it("treats unknown max budget as unknown when price is missing", () => {
    const normalized = normalizeRequirementLists(
      "black pendant lamp max 120 EUR",
      {
        matchedRequirements: ["black pendant lamp", "under max 120 EUR"],
        unmetRequirements: [],
        unknownRequirements: [],
      },
      null
    );
    expect(normalized.matchedRequirements.join(" ").toLowerCase()).not.toContain("under max");
    expect(normalized.unknownRequirements.join(" ").toLowerCase()).toContain("max 120 eur");
  });

  it("caps match score when unknown requirements remain", () => {
    expect(
      normalizeMatchScore({
        matchScore: 1,
        unmetRequirements: [],
        unknownRequirements: ["metal"],
      })
    ).toBeLessThanOrEqual(0.94);
  });

  it("caps match score lower when unmet requirements remain", () => {
    expect(
      normalizeMatchScore({
        matchScore: 1,
        unmetRequirements: ["max 25 EUR/m2"],
        unknownRequirements: [],
      })
    ).toBeLessThanOrEqual(0.85);
  });

  it("allows very high score for fully verified matches", () => {
    expect(
      normalizeMatchScore({
        matchScore: 0.97,
        unmetRequirements: [],
        unknownRequirements: [],
      })
    ).toBe(0.97);
  });

  it("includes requirement policy hints", () => {
    const hints = buildRequirementPolicyHints("black metal pendant lamp approx 40cm max 120 EUR");
    expect(hints.approximateDimensions).toBe(true);
    expect(hints.maxPriceEur).toBe(120);
  });
});
