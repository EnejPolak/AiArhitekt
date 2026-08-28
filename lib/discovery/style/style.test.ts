import { describe, expect, it } from "vitest";
import { candidateMatchesRequirement } from "../categoryGate";
import type { SearchableRequirement } from "../itemSpecs";
import { buildLocalizedQueryPlan } from "../locales/queryPlan";
import { rankRequirementCandidates, debugRankDeskCandidates } from "./rankCandidates";
import { normalizeSelectedStyles } from "./normalizeStyles";
import { scoreStyleFit } from "./scoreStyleFit";
import { STYLE_PROFILES } from "./profiles";
import type { CanonicalStyleId } from "./types";

function deskRequirement(styles: CanonicalStyleId[] = ["luxury", "minimal"]): SearchableRequirement {
  return {
    requirementType: "furniture",
    requirementKey: "furniture:desk:0",
    itemSpec: "computer desk",
    queryPlan: ["računalniška miza"],
    selectedStyles: styles,
    searchLocale: "sl",
    searchCountryCode: "SI",
    snapshot: {
      category: "desk",
      quantity: 1,
      placementNotes: null,
      constraints: ["computer desk"],
    },
    provenance: { source: "analysis", concept: "desk" },
  };
}

function gamingChairRequirement(styles: CanonicalStyleId[] = ["luxury", "minimal"]): SearchableRequirement {
  return {
    requirementType: "furniture",
    requirementKey: "furniture:gaming-chair:0",
    itemSpec: "gaming chair",
    queryPlan: ["gaming stol"],
    selectedStyles: styles,
    searchLocale: "sl",
    searchCountryCode: "SI",
    snapshot: {
      category: "gaming chair",
      quantity: 1,
      placementNotes: null,
      constraints: [],
    },
    provenance: { source: "user_notes", concept: "gaming_chair", matchedPhrase: "gaming chair" },
  };
}

describe("style localization", () => {
  it("exposes Slovenian vocabulary for all canonical styles", () => {
    for (const id of ["modern", "scandinavian", "luxury", "minimal", "rustic"] as CanonicalStyleId[]) {
      expect(STYLE_PROFILES[id].positive.terms.sl.length).toBeGreaterThan(0);
      expect(STYLE_PROFILES[id].positive.terms.en.length).toBeGreaterThan(0);
    }
  });

  it("builds luxury + minimal desk queries without literal English style labels", () => {
    const plan = buildLocalizedQueryPlan(deskRequirement(), "sl");
    expect(plan[0]).toMatch(/minimalistična računalniška miza/i);
    expect(plan.join(" ")).not.toMatch(/\bluxury\b/i);
    expect(plan.length).toBeLessThanOrEqual(3);
  });

  it("ignores unknown style strings safely", () => {
    expect(normalizeSelectedStyles(["luxury", "industrial", "minimal", "extra"])).toEqual([
      "luxury",
      "minimal",
    ]);
  });
});

describe("luxury + minimal desk ranking", () => {
  it("ranks the clean walnut desk above the bulky white shelf desk", () => {
    const ranked = debugRankDeskCandidates([
      {
        title: "Računalniška miza bela z nadgradnjo in policami",
        snippet: "bela računalniška miza z veliko policami",
        score: 55,
      },
      {
        title: "Moderna minimalistična računalniška miza oreh črna kovina",
        snippet: "elegantna minimalistična miza z orehom in kovinskimi nogami",
        score: 35,
      },
    ]);

    expect(ranked[0]?.title).toMatch(/moderna minimalistična/i);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });

  it("selects the better styled candidate from topCandidates even when SERP picked is worse", () => {
    const requirement = deskRequirement();
    const outcome = rankRequirementCandidates({
      requirement,
      query: "elegantna minimalistična računalniška miza",
      queryLevel: 0,
      maxLevel: 3,
      stores: [],
      serpResult: {
        item: "elegantna minimalistična računalniška miza",
        picked: {
          title: "MID.YOU RAČUNALNIŠKA MIZA leseni material bela",
          url: "https://www.localhome.si/p/midyou",
          domain: "localhome.si",
          snippet: "računalniška miza z nadgradnjo in policami",
          score: 60,
          image: null,
          price: 99,
          currency: "EUR",
          confidence: 0.8,
          reasons: [],
        },
        topCandidates: [
          {
            title: "MID.YOU RAČUNALNIŠKA MIZA leseni material bela",
            url: "https://www.localhome.si/p/midyou",
            domain: "localhome.si",
            snippet: "računalniška miza z nadgradnjo in policami",
            score: 60,
            flags: {
              isProductLikeUrl: true,
              isCategoryLikeUrl: false,
              hasToolIntent: false,
              hasHomeIntent: true,
            },
          },
          {
            title: "Moderna minimalistična računalniška miza oreh črna kovina",
            url: "https://www.localhome.si/p/modern-desk",
            domain: "localhome.si",
            snippet: "elegantna minimalistična miza",
            score: 38,
            flags: {
              isProductLikeUrl: true,
              isCategoryLikeUrl: false,
              hasToolIntent: false,
              hasHomeIntent: true,
            },
          },
        ],
      },
    });

    expect(outcome.winner?.product.productTitle).toMatch(/moderna minimalistična/i);
    expect(outcome.winner!.finalScore).toBeGreaterThan(0.4);
  });
});

describe("hard gate vs style ranking", () => {
  it("rejects a luxury sofa before style ranking matters", () => {
    const requirement = deskRequirement();
    expect(
      candidateMatchesRequirement(requirement, "Elegantna luksuzna sedežna garnitura")
    ).toBe(false);
  });
});

describe("gaming chair style ranking", () => {
  it("prefers a cleaner gaming chair over RGB styling", () => {
    const requirement = gamingChairRequirement();
    const rgb = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["luxury", "minimal"],
      concept: "gaming_chair",
      requirementType: "furniture",
      evidence: { title: "Gaming stol RGB racing" },
    });
    const clean = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["luxury", "minimal"],
      concept: "gaming_chair",
      requirementType: "furniture",
      evidence: { title: "Ergonomski gaming stol črn minimalističen dizajn" },
    });
    expect(clean.score).toBeGreaterThan(rgb.score);
    expect(candidateMatchesRequirement(requirement, "Premium pisarniški stol")).toBe(false);
  });
});

describe("other style profiles", () => {
  it("ranks scandinavian light wood above glossy black", () => {
    const light = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["scandinavian"],
      concept: "desk",
      requirementType: "furniture",
      evidence: { title: "Minimalistična miza svetel hrast naravni les" },
    });
    const glossy = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["scandinavian"],
      concept: "desk",
      requirementType: "furniture",
      evidence: { title: "Črna steklena visoki sijaj miza" },
    });
    expect(light.score).toBeGreaterThan(glossy.score);
  });

  it("ranks rustic solid wood above high-gloss modern", () => {
    const rustic = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["rustic"],
      concept: "desk",
      requirementType: "furniture",
      evidence: { title: "Masivni les naravni rustikalna miza" },
    });
    const modernGloss = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["rustic"],
      concept: "desk",
      requirementType: "furniture",
      evidence: { title: "Bela visoki sijaj moderna miza" },
    });
    expect(rustic.score).toBeGreaterThan(modernGloss.score);
  });

  it("ranks modern candidate above traditional classic", () => {
    const modern = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["modern"],
      concept: "desk",
      requirementType: "furniture",
      evidence: { title: "Moderna sodobna miza čiste linije kovina" },
    });
    const classic = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["modern"],
      concept: "desk",
      requirementType: "furniture",
      evidence: { title: "Klasična starinska pisalna miza" },
    });
    expect(modern.score).toBeGreaterThan(classic.score);
  });
});

describe("combined style balance", () => {
  it("prefers refined clean lines over ornate luxury", () => {
    const ornate = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["luxury", "minimal"],
      concept: "desk",
      requirementType: "furniture",
      evidence: { title: "Luksuzna ornamentirana miza z veliko policami" },
    });
    const refined = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["luxury", "minimal"],
      concept: "desk",
      requirementType: "furniture",
      evidence: { title: "Elegantna minimalistična miza oreh tanke noge" },
    });
    expect(refined.score).toBeGreaterThan(ornate.score);
  });
});

describe("neutral style fallback", () => {
  it("returns neutral score when no style evidence is present", () => {
    const fit = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["luxury", "minimal"],
      concept: "desk",
      requirementType: "furniture",
      evidence: { title: "Računalniška miza 120 cm" },
    });
    expect(fit.neutral).toBe(true);
    expect(fit.matchedSignals).toHaveLength(0);
  });
});

describe("english evidence on slovenian search", () => {
  it("scores English minimalist walnut desk evidence", () => {
    const fit = scoreStyleFit({
      locale: "sl",
      selectedStyles: ["luxury", "minimal"],
      concept: "desk",
      requirementType: "furniture",
      evidence: { title: "Minimalist Walnut Computer Desk Black Metal" },
    });
    expect(fit.score).toBeGreaterThan(0.4);
    expect(fit.matchedSignals.length).toBeGreaterThan(0);
  });
});

describe("dry debug fixture", () => {
  it("candidate 2 wins for luxury + minimal computer desk", () => {
    const ranked = debugRankDeskCandidates([
      {
        title: "MID.YOU RAČUNALNIŠKA MIZA leseni material bela",
        snippet: "računalniška miza z nadgradnjo in policami",
        score: 60,
      },
      {
        title: "Moderna minimalistična računalniška miza oreh črna kovina",
        snippet: "elegantna minimalistična miza",
        score: 35,
      },
    ]);
    expect(ranked[0]?.title).toMatch(/moderna minimalistična/i);
    expect(ranked[1]?.title).toMatch(/MID.YOU/i);
  });
});
