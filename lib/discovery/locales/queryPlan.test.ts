import { describe, expect, it } from "vitest";
import { resolveShoppingRequirements } from "../resolveRequirements";
import { buildLocalizedQueryPlan, localizeSearchableRequirements } from "./queryPlan";
import { MAX_DISCOVERY_QUERY_LEVELS } from "../resolveProducts";

const emptyAnalysis = {
  furnitureNeeds: [] as const,
  materialNeeds: [] as const,
  constraints: [] as const,
  preserve: [] as const,
  replaceOrRemove: [] as const,
};

function furnitureNeed(category: string, constraints: string[] = []) {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      ...emptyAnalysis,
      furnitureNeeds: [{ category, quantity: 1, placementNotes: null, constraints }],
    },
  });
  return searched[0]!;
}

function marbleFlooringNeed() {
  const { searched } = resolveShoppingRequirements({
    analysisRequirements: {
      ...emptyAnalysis,
      materialNeeds: [
        {
          surface: "floor",
          category: "light tone wood-look flooring",
          finishDirection: null,
          constraints: ["wood-look"],
        },
      ],
    },
    preferences: { flooring: "marble" },
  });
  return searched.find((item) => item.provenance?.concept === "marble")!;
}

describe("localized query plans", () => {
  it("puts pisarniški stol before English office chair for Slovenia", () => {
    const plan = buildLocalizedQueryPlan(furnitureNeed("office chair"), "sl");
    expect(plan[0]).toMatch(/pisarniški stol/i);
    expect(plan.indexOf("pisarniški stol")).toBeLessThan(plan.indexOf("office chair"));
    expect(plan.at(-1)).toBe("office chair");
    expect(plan).toHaveLength(3);
    expect(plan.length).toBeLessThanOrEqual(MAX_DISCOVERY_QUERY_LEVELS);
  });

  it("localizes a multiple-monitor desk before the English fallback", () => {
    const plan = buildLocalizedQueryPlan(
      furnitureNeed("desk", ["must support multiple monitors"]),
      "sl"
    );
    expect(plan[0]).toBe("računalniška miza za več monitorjev");
    expect(plan[1]).toBe("računalniška miza");
    expect(plan[2]).toBe("computer desk");
    expect(plan.join(" ")).not.toMatch(/miza mora podpirati/i);
    expect(plan).toHaveLength(3);
  });

  it("uses marmor terminology for explicit marble flooring in Slovenia", () => {
    const plan = buildLocalizedQueryPlan(marbleFlooringNeed(), "sl");
    expect(plan.some((query) => /marmorne|marmor/i.test(query))).toBe(true);
    expect(plan.at(-1)?.toLowerCase()).toContain("marble");
    expect(plan).toHaveLength(3);
  });

  it("localizes gaming chair queries for Slovenia", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: emptyAnalysis,
      preferences: { notes: "gaming chair" },
    });
    const gaming = searched.find((item) => item.provenance?.concept === "gaming_chair")!;
    const plan = buildLocalizedQueryPlan(gaming, "sl");
    expect(plan[0]).toBe("gaming stol");
    expect(plan[1]).toBe("gaming chair");
    expect(plan.at(-1)).toBe("gaming chair");
  });

  it("localizes matte black wall paint with finish-aware Slovenian queries", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: emptyAnalysis,
      preferences: { wallMainColor: "matte black", wallAccentColor: "olive green" },
    });
    const [main, accent] = localizeSearchableRequirements(searched, "SI");
    expect(main?.queryPlan).toEqual([
      "mat črna notranja barva za stene",
      "črna mat stenska barva",
      "interior wall paint matte black",
    ]);
    expect(accent?.queryPlan).toEqual([
      "olivno zelena notranja barva za stene",
      "olivno zelena stenska barva",
      "zelena stenska barva",
    ]);
    expect(main?.displayLabel).toContain("matte black interior wall paint");
  });

  it("localizes metallic black wall paint without requiring metallic in Slovenian queries", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: emptyAnalysis,
      preferences: { wallMainColor: "metallic black", wallAccentColor: "olive green" },
    });
    const [main, accent] = localizeSearchableRequirements(searched, "SI");
    expect(main?.queryPlan).toEqual([
      "črna notranja barva za stene",
      "črna stenska barva",
      "interior wall paint metallic black",
    ]);
    expect(accent?.queryPlan).toEqual([
      "olivno zelena notranja barva za stene",
      "olivno zelena stenska barva",
      "zelena stenska barva",
    ]);
    expect(main?.itemSpec).toContain("metallic black");
  });

  it("keeps English query plans for unknown countries", () => {
    const plan = buildLocalizedQueryPlan(furnitureNeed("office chair"), "en");
    expect(plan[0]).toBe("office chair");
    expect(plan.join(" ")).not.toMatch(/pisarniški/i);
  });
});
