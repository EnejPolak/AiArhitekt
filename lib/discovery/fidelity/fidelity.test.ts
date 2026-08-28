import { describe, expect, it } from "vitest";
import { evaluateCandidateHardGate, candidateMatchesRequirement } from "../categoryGate";
import { classifyCandidateProductKind } from "../fidelity/productKind";
import { resolveShoppingRequirements } from "../resolveRequirements";
import { withLocalizedQueryPlan } from "../locales";
import type { SearchableRequirement } from "../itemSpecs";
import { debugRankMaterialCandidates } from "../style/rankCandidates";
import { buildLocalizedQueryPlan } from "../locales/queryPlan";
import { normalizeSelectedStyles } from "../style/normalizeStyles";
import { buildStyleAwareFurnitureQueries } from "../style/queryModifiers";

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
      materialNeeds: [],
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

describe("product kind classifier", () => {
  it("classifies tile installation accessories separately from tiles", () => {
    expect(classifyCandidateProductKind({ title: "Max Zagozda za ploščice" })).toBe("tile_wedge");
    expect(classifyCandidateProductKind({ title: "Max Distančnik za ploščice 1 mm" })).toBe("tile_spacer");
    expect(classifyCandidateProductKind({ title: "Lepilo za ploščice C2TE" })).toBe("adhesive");
    expect(classifyCandidateProductKind({ title: "Fugirna masa za ploščice" })).toBe("grout");
    expect(classifyCandidateProductKind({ title: "Rezalnik ploščic" })).toBe("installation_tool");
  });

  it("classifies floor vs wall tiles", () => {
    expect(classifyCandidateProductKind({ title: "Stenska ploščica Exclusive Marble" })).toBe("wall_tile");
    expect(classifyCandidateProductKind({ title: "Talna in stenska ploščica Marble" })).toBe(
      "floor_and_wall_tile"
    );
    expect(classifyCandidateProductKind({ title: "Talna marmorna ploščica 60x60" })).toMatch(/floor_tile|stone_flooring/);
    expect(classifyCandidateProductKind({ title: "Marmorne talne ploščice" })).toBe("floor_tile");
  });
});

describe("marble flooring hard gate", () => {
  const requirement = marbleRequirement();

  it("rejects tile accessories from live regression fixture", () => {
    for (const title of [
      "Max Zagozda za ploščice",
      "Max Distančnik za ploščice 1 mm",
      "Ceresit CE 40 Silica Active",
    ]) {
      expect(candidateMatchesRequirement(requirement, title)).toBe(false);
      const gate = evaluateCandidateHardGate(requirement, { title });
      expect(gate.hardValid).toBe(false);
      expect(gate.hardGateReasons.length).toBeGreaterThan(0);
    }
  });

  it("rejects wall-only marble tile for floor requirement", () => {
    expect(candidateMatchesRequirement(requirement, "Cersanit Stenska ploščica Exclusive Marble")).toBe(
      false
    );
  });

  it("accepts floor-compatible marble tiles", () => {
    expect(candidateMatchesRequirement(requirement, "Marmorne talne ploščice 60x60")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Talna in stenska ploščica Marble")).toBe(true);
    expect(candidateMatchesRequirement(requirement, "Talna ploščica Exclusive Marble")).toBe(true);
    expect(
      candidateMatchesRequirement(requirement, "Marmorne ploščice antičnega videza")
    ).toBe(false);
  });

  it("selects real marble tile over wedge in ranking fixture", () => {
    const ranked = debugRankMaterialCandidates(requirement, [
      { title: "Max Zagozda za ploščice", score: 65 },
      { title: "Max Distančnik za ploščice 1 mm", score: 65 },
      { title: "Cersanit Stenska ploščica Exclusive Marble", score: 57 },
      { title: "Talna ploščica Exclusive Marble", score: 57 },
      { title: "Ceresit CE 40 Silica Active", score: 27 },
    ]);
    expect(ranked[0]?.title).toMatch(/Talna ploščica Exclusive Marble/i);
    expect(ranked[0]?.hardValid).toBe(true);
    expect(ranked.filter((row) => row.hardValid)).toHaveLength(1);
  });
});

describe("matte black paint regression", () => {
  const requirement = paintRequirement({ hue: "black", finish: "matte", raw: "matte black" });

  it("ranks Dulux exact black matte above Decor Desert", () => {
    const ranked = debugRankMaterialCandidates(requirement, [
      {
        title: "JUB Dekorativna barva Decor Desert izgled puščavskega",
        score: 63,
      },
      { title: "Dulux Lateks za stene črna mat 1 l", score: 59 },
      { title: "Jub Barva za odtenke (Črna)", score: 53 },
      { title: "TEHNIKA Barve, laki in pleskarski material", score: 40 },
    ]);
    expect(ranked[0]?.title).toMatch(/Dulux Lateks/i);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]?.finalScore ?? 0);
  });

  it("rejects decorative desert effect for explicit matte black", () => {
    const gate = evaluateCandidateHardGate(requirement, {
      title: "JUB Dekorativna barva Decor Desert izgled puščavskega",
    });
    expect(gate.hardValid).toBe(false);
  });
});

describe("green hue fidelity", () => {
  it("keeps olive, dark green, and generic green distinct", () => {
    const olive = paintRequirement({ hue: "olive-green", raw: "olive green" });
    const dark = paintRequirement({ hue: "dark-green", raw: "dark green" });
    const green = paintRequirement({ hue: "green", raw: "green" });

    expect(
      evaluateCandidateHardGate(olive, { title: "Olivno zelena notranja barva za stene" }).fidelity.hueMatch
    ).toBe("exact");
    expect(
      evaluateCandidateHardGate(olive, { title: "Olivno zelena stenska barva" }).fidelity.hueMatch
    ).toBe("exact");
    const genericForOlive = evaluateCandidateHardGate(olive, { title: "Stenska barva Zelena" }).fidelity;
    expect(genericForOlive.hueMatch).toBe("family");
    expect(genericForOlive.hueMatch).not.toBe("exact");
    expect(
      evaluateCandidateHardGate(olive, { title: "Temno zelena notranja barva" }).fidelity.hueMatch
    ).not.toBe("exact");

    expect(
      evaluateCandidateHardGate(dark, { title: "Temno zelena notranja barva" }).fidelity.hueMatch
    ).toBe("exact");
    expect(
      evaluateCandidateHardGate(dark, { title: "Olivno zelena notranja barva" }).fidelity.hueMatch
    ).toBe("conflict");

    expect(
      evaluateCandidateHardGate(green, { title: "Zelena stenska barva" }).fidelity.hueMatch
    ).toBe("exact");
    expect(
      evaluateCandidateHardGate(green, { title: "Olivno zelena notranja barva" }).fidelity.hueMatch
    ).toBe("family");
  });

  it("localizes olive-green wall paint with specific L1/L2 and generic-green L3 only", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        furnitureNeeds: [],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
      preferences: { wallAccentColor: "olive green" },
    });
    const accent = searched.find((item) => item.provenance?.paintHue === "olive-green");
    expect(accent).toBeTruthy();
    const plan = buildLocalizedQueryPlan(accent!, "sl");
    expect(plan[0]).toContain("olivno zelena");
    expect(plan).toEqual([
      "olivno zelena notranja barva za stene",
      "olivno zelena stenska barva",
      "zelena stenska barva",
    ]);
    expect(plan.some((query) => /interior wall paint/i.test(query))).toBe(false);
  });

  it("ranks exact olive-green paint above generic green despite higher SERP score", () => {
    const olive = paintRequirement({ hue: "olive-green", raw: "olive green" });
    const ranked = debugRankMaterialCandidates(olive, [
      { title: "Stenska barva Zelena 10 l", score: 68 },
      { title: "Olivno zelena stenska barva Mat 2,5 l", score: 55 },
    ]);
    expect(ranked[0]?.title).toMatch(/Olivno zelena stenska barva/i);
    expect(ranked[0]?.hardValid).toBe(true);
    expect(ranked[1]?.hardValid).toBe(true);
    expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
  });
});

describe("natural Slovenian furniture queries", () => {
  const styles = normalizeSelectedStyles(["luxury", "minimal", "modern"]);

  it("builds natural gaming chair queries without broken grammar", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        furnitureNeeds: [],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
      preferences: { notes: "gaming chair", selectedStyles: styles },
    });
    const gaming = searched.find((item) => item.provenance?.concept === "gaming_chair")!;
    const withStyles = {
      ...withLocalizedQueryPlan(gaming, "sl", "SI"),
      selectedStyles: styles,
    };
    const plan = buildLocalizedQueryPlan(withStyles, "sl");
    expect(plan[0]).toMatch(/minimalističen gaming stol/i);
    expect(plan[0]).not.toMatch(/elegantna minimalistična gaming/i);
    expect(plan[1]).toBe("gaming stol");
    expect(plan[2]).toBe("gaming chair");
    expect(plan.join(" ")).not.toMatch(/igričarski stol/i);
  });

  it("removes style modifier from desk level 2", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        furnitureNeeds: [
          { category: "desk", quantity: 1, placementNotes: null, constraints: ["computer desk"] },
        ],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
      preferences: { selectedStyles: styles },
    });
    const desk = { ...withLocalizedQueryPlan(searched[0]!, "sl", "SI"), selectedStyles: styles };
    const plan = buildLocalizedQueryPlan(desk, "sl");
    expect(plan[0]).toMatch(/minimalistična računalniška miza/i);
    expect(plan[1]).toBe("računalniška miza");
    expect(plan[2]).toBe("computer desk");
    expect(plan[1]).not.toMatch(/elegantna/i);
  });

  it("uses category-aware gender in style modifiers", () => {
    const chairMod = buildStyleAwareFurnitureQueries(
      ["gaming stol", "gaming stol", "gaming chair"],
      styles,
      "sl",
      "gaming_chair"
    );
    expect(chairMod[0]).toMatch(/minimalističen gaming stol/i);
    expect(chairMod[1]).toBe("gaming stol");
    const deskMod = buildStyleAwareFurnitureQueries(
      ["računalniška miza za več monitorjev", "računalniška miza", "computer desk"],
      styles,
      "sl",
      "desk"
    );
    expect(deskMod[0]).toMatch(/minimalistična računalniška miza/i);
    expect(deskMod[1]).toBe("računalniška miza za več monitorjev");
  });
});
