import { describe, expect, it } from "vitest";
import { candidateMatchesRequirement } from "./categoryGate";
import type { SearchableRequirement } from "./itemSpecs";
import { resolveShoppingRequirements } from "./resolveRequirements";
import { withLocalizedQueryPlan } from "./locales";

function deskRequirement(): SearchableRequirement {
  return {
    requirementType: "furniture",
    requirementKey: "furniture:desk:0",
    itemSpec: "large computer desk multiple monitors",
    queryPlan: [
      "large computer desk multiple monitors",
      "large computer desk",
      "computer desk",
    ],
    snapshot: {
      category: "desk",
      quantity: 1,
      placementNotes: null,
      constraints: ["must support multiple monitors"],
    },
    provenance: { source: "analysis", concept: "desk" },
  };
}

function officeChairRequirement(): SearchableRequirement {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      furnitureNeeds: [
        { category: "office chair", quantity: 1, placementNotes: null, constraints: [] },
      ],
      materialNeeds: [],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    },
  });
  return withLocalizedQueryPlan(searched[0]!, "sl", "SI");
}

function gamingChairRequirement(): SearchableRequirement {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      furnitureNeeds: [],
      materialNeeds: [],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    },
    preferences: { notes: "gaming chair" },
  });
  const gaming = searched.find((item) => item.provenance?.concept === "gaming_chair");
  if (!gaming) throw new Error("missing gaming chair requirement");
  return withLocalizedQueryPlan(gaming, "sl", "SI");
}

function paintRequirement(input: {
  hue: string;
  finish?: "matte" | "metallic" | "gloss" | null;
  raw?: string;
}): SearchableRequirement {
  const finishLabel =
    input.finish === "matte" ? "matte" : input.finish === "metallic" ? "metallic" : input.finish === "gloss" ? "gloss" : "";
  const displaySpec = [finishLabel, input.hue.replace(/-/g, " "), "interior wall paint"]
    .filter(Boolean)
    .join(" ");
  return {
    requirementType: "material",
    requirementKey: `material:wall:interior-wall-paint:${input.hue}`,
    itemSpec: displaySpec,
    queryPlan: [displaySpec, `wall paint ${input.hue}`],
    snapshot: {
      surface: "wall",
      category: "interior wall paint",
      finishDirection: displaySpec,
      constraints: [input.raw ?? input.hue, input.hue, ...(input.finish ? [input.finish] : []), "main wall"],
    },
    provenance: {
      source: "user_structured",
      concept: "wall_paint",
      paintHue: input.hue,
      paintFinish: input.finish ?? null,
      paintRaw: input.raw ?? input.hue,
    },
  };
}

function marbleRequirement(): SearchableRequirement {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      furnitureNeeds: [],
      materialNeeds: [
        {
          surface: "floor",
          category: "light tone wood-look flooring",
          finishDirection: null,
          constraints: ["wood-look"],
        },
      ],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    },
    preferences: { flooring: "marble" },
  });
  const marble = searched.find((item) => item.provenance?.concept === "marble");
  if (!marble) throw new Error("missing marble requirement");
  return withLocalizedQueryPlan(marble, "sl", "SI");
}

describe("semantic category gate", () => {
  it("accepts a desk and rejects unrelated furniture for a desk requirement", () => {
    const requirement = deskRequirement();
    expect(candidateMatchesRequirement(requirement, "Large Computer Desk for Dual Monitors")).toBe(
      true
    );
    expect(candidateMatchesRequirement(requirement, "Računalniška miza za dva monitorja")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Pisalna miza bela")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Ergonomic mesh office chair")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "Sedežna garnitura")).toBe(false);
  });

  it("accepts Slovenian and English office chairs and rejects chopsticks", () => {
    const requirement = officeChairRequirement();
    expect(candidateMatchesRequirement(requirement, "Pisarniški stol ergonoski črn")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Ergonomski pisarniški stol")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Računalniški stol mreža")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Office Chair Black Mesh")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "KITAJSKE PALIČICE 100kom")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "Sedežna garnitura siva")).toBe(false);
  });

  it("accepts gaming chairs and rejects plain office chairs", () => {
    const requirement = gamingChairRequirement();
    expect(candidateMatchesRequirement(requirement, "Ergonomski gaming stol")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Igričarski stol črn")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Gaming Chair Black")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Pisarniški stol")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "KITAJSKE PALIČICE")).toBe(false);
  });

  it("treats accented and ASCII desk titles as the same concept", () => {
    const requirement = deskRequirement();
    expect(candidateMatchesRequirement(requirement, "računalniška miza")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "racunalniska miza")).toBe(true);
  });

  it("rejects a random unrelated paint color for matte black", () => {
    const requirement = paintRequirement({ hue: "black", finish: "matte", raw: "matte black" });
    expect(candidateMatchesRequirement(requirement, "Črna mat notranja zidna barva")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Metallic Black Interior Wall Paint 10L")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "Bela mat notranja zidna barva")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "White interior wall paint")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "Olive green sofa")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "Črna sijajna barva")).toBe(false);
  });

  it("accepts olive green paint and rejects generic green or other colors", () => {
    const requirement = paintRequirement({ hue: "olive-green", raw: "olive green" });
    expect(candidateMatchesRequirement(requirement, "Olivno zelena notranja barva za stene")).toBe(
      true
    );
    expect(candidateMatchesRequirement(requirement, "Olive green interior wall paint")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Zelena stenska barva")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Bela stenska barva")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "Modra notranja barva")).toBe(false);
  });

  it("accepts marble flooring and rejects oak laminate or wood", () => {
    const requirement = marbleRequirement();
    expect(candidateMatchesRequirement(requirement, "Marmorne talne ploščice 60x60")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Talne ploščice videz marmorja")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Marble floor tile")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Laminat hrast")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "Lesena talna obloga")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "Wood-look flooring")).toBe(false);
  });

  it("uses snippet evidence for tintable matte black when title is neutral", () => {
    const requirement = paintRequirement({ hue: "black", finish: "matte", raw: "matte black" });
    expect(
      candidateMatchesRequirement(requirement, {
        title: "Notranja zidna barva MAT",
        snippet: "odtenek črna, mat površina",
      })
    ).toBe(true);
  });

  it("rejects vague tintable marketing when title explicitly conflicts", () => {
    const requirement = paintRequirement({ hue: "black", finish: "matte", raw: "matte black" });
    expect(
      candidateMatchesRequirement(requirement, {
        title: "Bela zidna barva",
        snippet: "available in many colors including black",
      })
    ).toBe(false);
  });
});
