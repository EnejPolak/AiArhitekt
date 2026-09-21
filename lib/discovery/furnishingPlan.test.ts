import { describe, expect, it } from "vitest";
import type { DesignRequirements, RoomAnalysisObservation } from "@/lib/analysis/schema";
import { ROOM_ANALYSIS_SCHEMA_VERSION } from "@/lib/analysis/constants";
import { completeRoomGate } from "./completeRoomGate";
import {
  EMPTY_FURNISHING_PLAN_OVERRIDES,
  normalizeFurnishingPlan,
  parseFurnishingPlanOverrides,
  type FurnishingPlanOverrides,
} from "./furnishingPlan";
import { canonicalShoppingPreferences, furnitureShoppingPreferencesMatch } from "./preferences";
import { evaluateCompleteRoomReadiness } from "@/lib/render/readiness";
import { resolveShoppingRequirements } from "./resolveRequirements";

function observation(overrides: Partial<RoomAnalysisObservation> = {}): RoomAnalysisObservation {
  return {
    roomType: "living-room",
    architecture: {
      walls: ["open wall"],
      floor: "bare screed",
      windows: ["one window"],
      doors: ["entry door"],
      fixedElements: [],
    },
    existingElements: [],
    visualCondition: {
      lighting: "daylight",
      colors: ["white walls"],
      overall: "empty",
    },
    constraints: [],
    preserve: [],
    replaceOrRemove: [],
    measurementStatus: { exactDimensionsKnown: false, qualitativeNotes: ["open wall"] },
    uncertainties: [],
    ...overrides,
  };
}

function furnitureNeed(
  category: string,
  extra: Partial<DesignRequirements["furnitureNeeds"][number]> = {}
): DesignRequirements["furnitureNeeds"][number] {
  return {
    category,
    quantity: 1,
    placementNotes: null,
    constraints: [],
    ...extra,
  };
}

function requirements(
  furnitureNeeds: DesignRequirements["furnitureNeeds"],
  materialNeeds: DesignRequirements["materialNeeds"] = []
): DesignRequirements {
  return {
    furnitureNeeds,
    materialNeeds,
    constraints: [],
    preserve: [],
    replaceOrRemove: [],
  };
}

const emptyLivingNeeds = requirements([
  furnitureNeed("sofa", { rationale: "Primary seating for an empty living room." }),
  furnitureNeed("coffee table", { rationale: "Central surface." }),
  furnitureNeed("rug", { rationale: "Grounds the seating area." }),
  furnitureNeed("floor lamp", { rationale: "No usable floor lighting." }),
  furnitureNeed("plant"),
  furnitureNeed("artwork"),
]);

describe("furnishing plan normalization", () => {
  it("A. empty living room keeps a restrained functional set without default decor", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: emptyLivingNeeds,
      observation: observation(),
    });
    const concepts = plan.required.map((item) => item.concept);
    expect(concepts).toEqual(["sofa", "coffee_table", "rug", "lighting"]);
    expect(concepts).not.toContain("other");
    expect(plan.required.some((item) => /plant|artwork/i.test(item.category))).toBe(false);
    expect(new Set(concepts).size).toBe(concepts.length);
    expect(plan.required.length).toBeLessThanOrEqual(6);
  });

  it("B. likely_keep sofa suppresses a new sofa requirement", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: requirements([furnitureNeed("sofa"), furnitureNeed("coffee table")]),
      observation: observation({
        existingElements: [{ description: "fabric sofa on the back wall", disposition: "likely_keep" }],
      }),
    });
    expect(plan.required.some((item) => item.concept === "sofa")).toBe(false);
    expect(plan.required.some((item) => item.concept === "coffee_table")).toBe(true);
  });

  it("C. user notes keep sofa and no rug win over analysis", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: requirements([
        furnitureNeed("sofa"),
        furnitureNeed("coffee table"),
        furnitureNeed("rug"),
      ]),
      observation: observation(),
      preferences: { notes: "keep sofa, no rug" },
    });
    expect(plan.required.some((item) => item.concept === "sofa")).toBe(false);
    expect(plan.required.some((item) => item.concept === "rug")).toBe(false);
    expect(plan.required.some((item) => item.concept === "coffee_table")).toBe(true);
  });

  it("D. user notes add a reading-chair requirement", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: requirements([furnitureNeed("sofa"), furnitureNeed("coffee table")]),
      observation: observation(),
      preferences: { notes: "I want a reading chair" },
    });
    expect(plan.required.some((item) => item.concept === "reading_chair")).toBe(true);
  });

  it("E. bedroom built-in wardrobe likely_keep does not add a wardrobe", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: requirements([
        furnitureNeed("bed"),
        furnitureNeed("wardrobe"),
        furnitureNeed("bedside table"),
      ]),
      observation: observation({
        roomType: "bedroom",
        architecture: {
          walls: ["alcove"],
          floor: "wood",
          windows: [],
          doors: [],
          fixedElements: ["built-in wardrobe"],
        },
        existingElements: [{ description: "built-in wardrobe", disposition: "likely_keep" }],
      }),
    });
    expect(plan.required.some((item) => item.concept === "wardrobe")).toBe(false);
    expect(plan.required.some((item) => item.concept === "bed")).toBe(true);
  });

  it("F. sofa / sectional sofa / couch normalize to one sofa requirement", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: requirements([
        furnitureNeed("sofa"),
        furnitureNeed("sectional sofa"),
        furnitureNeed("couch"),
      ]),
      observation: observation(),
    });
    const sofas = plan.required.filter((item) => item.concept === "sofa");
    expect(sofas).toHaveLength(1);
    expect(sofas[0]?.requirementKey).toBe("furniture:sofa:0");
  });

  it("G. requirement keys stay stable when analysis order changes", () => {
    const first = normalizeFurnishingPlan({
      analysisRequirements: requirements([furnitureNeed("coffee table"), furnitureNeed("sofa")]),
      observation: observation(),
    });
    const second = normalizeFurnishingPlan({
      analysisRequirements: requirements([furnitureNeed("sofa"), furnitureNeed("coffee table")]),
      observation: observation(),
    });
    expect(first.required.map((item) => item.requirementKey).sort()).toEqual(
      second.required.map((item) => item.requirementKey).sort()
    );
    expect(first.required.find((item) => item.concept === "sofa")?.requirementKey).toBe("furniture:sofa:0");
    expect(first.required.find((item) => item.concept === "coffee_table")?.requirementKey).toBe(
      "furniture:coffee-table:0"
    );
  });
});

describe("approved plan discovery and complete-room gate", () => {
  it("H. user-removed required item is not searched, rendered, or gated", () => {
    const analysisRequirements = emptyLivingNeeds;
    const overrides: FurnishingPlanOverrides = {
      ...EMPTY_FURNISHING_PLAN_OVERRIDES,
      removedRequirementKeys: ["furniture:rug:0"],
    };
    const { searched, plan } = resolveShoppingRequirements({
      analysisRequirements,
      observation: observation(),
      planOverrides: overrides,
    });
    expect(plan.removed.some((item) => item.requirementKey === "furniture:rug:0")).toBe(true);
    expect(searched.some((item) => item.requirementKey === "furniture:rug:0")).toBe(false);
    const gate = completeRoomGate({
      searchedItemCount: searched.length,
      readyRequirementKeys: searched.map((item) => item.requirementKey),
      unmatched: [],
    });
    expect(gate.unresolvedLabels.join(" ")).not.toMatch(/rug/i);
    expect(searched.some((item) => item.requirementKey === "furniture:rug:0")).toBe(false);
  });

  it("I. suggested-only items are not searched, gated, or renderable", () => {
    const { searched, plan } = resolveShoppingRequirements({
      analysisRequirements: requirements([
        furnitureNeed("sofa"),
        furnitureNeed("floor lamp", { role: "suggested_only", rationale: "Optional extra light." }),
      ]),
      observation: observation(),
    });
    expect(plan.suggested.some((item) => item.concept === "lighting")).toBe(true);
    expect(searched.some((item) => item.provenance?.concept === "lighting")).toBe(false);
    expect(searched.some((item) => /lamp|lighting/i.test(item.itemSpec))).toBe(false);
    const gate = completeRoomGate({
      searchedItemCount: searched.length,
      readyRequirementKeys: searched.map((item) => item.requirementKey),
      unmatched: [],
    });
    expect(gate.requiredSlots).toBe(searched.length);
    expect(gate.unresolvedLabels.join(" ")).not.toMatch(/lamp|lighting/i);
  });

  it("J. an unresolved approved required item blocks render", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: requirements([
        furnitureNeed("sofa"),
        furnitureNeed("coffee table"),
        furnitureNeed("rug"),
        furnitureNeed("floor lamp"),
        furnitureNeed("tv console"),
      ]),
      observation: observation(),
    });
    const ready = searched.slice(0, -1).map((item) => item.requirementKey);
    const unresolved = searched.at(-1)!;
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: searched.length,
      readyRequirementKeys: ready,
      unmatched: [
        {
          requirementKey: unresolved.requirementKey,
          requirementType: unresolved.requirementType,
          itemSpec: unresolved.itemSpec,
          displayLabel: unresolved.displayLabel,
          reason: "no_valid_product",
        },
      ],
      preferences: {
        selectedStyles: [],
        budgetLevel: null,
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        wallFinishMode: "keep_existing",
        floorFinishMode: "keep_existing",
        notes: "",
      },
    });
    expect(gate.readySlots).toBe(searched.length - 1);
    expect(gate.requiredSlots).toBe(searched.length);
    expect(gate.allowed).toBe(false);
  });

  it("K. all approved required items READY allows render", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: requirements([
        furnitureNeed("sofa"),
        furnitureNeed("coffee table"),
        furnitureNeed("rug"),
        furnitureNeed("floor lamp"),
      ]),
      observation: observation(),
    });
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: searched.length,
      readyRequirementKeys: searched.map((item) => item.requirementKey),
      unmatched: [],
      preferences: {
        selectedStyles: [],
        budgetLevel: null,
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        wallFinishMode: "keep_existing",
        floorFinishMode: "keep_existing",
        notes: "",
      },
    });
    expect(gate.requiredSlots).toBe(searched.length);
    expect(gate.readySlots).toBe(searched.length);
    expect(gate.allowed).toBe(true);
  });

  it("L. floor and wall finishes stay in the finish system, not the furniture plan", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: requirements(
        [furnitureNeed("sofa"), furnitureNeed("oak flooring"), furnitureNeed("wall paint")],
        [
          {
            surface: "floor",
            category: "wood-look flooring",
            finishDirection: "matte",
            constraints: [],
          },
        ]
      ),
      observation: observation(),
    });
    expect(plan.required.some((item) => item.concept === "sofa")).toBe(true);
    expect(plan.required.some((item) => /floor|paint|wall/i.test(item.category))).toBe(false);

    const { searched } = resolveShoppingRequirements({
      analysisRequirements: requirements([furnitureNeed("sofa")]),
      observation: observation(),
      preferences: { flooring: "laminate", keepExistingWalls: true },
    });
    expect(searched.some((item) => item.provenance?.concept === "laminate")).toBe(true);
    expect(searched.some((item) => item.requirementType === "furniture" && /flooring|paint/i.test(item.itemSpec))).toBe(
      false
    );
  });
});

describe("furnishing plan identity and persistence parsing", () => {
  it("empty overrides do not change shopping identity", () => {
    const without = canonicalShoppingPreferences({ notes: "" });
    const withEmpty = canonicalShoppingPreferences({
      notes: "",
      furnishingPlanIdentity: "",
    });
    expect(furnitureShoppingPreferencesMatch(without, withEmpty)).toBe(true);
  });

  it("removing a required item changes furniture shopping identity", () => {
    const base = canonicalShoppingPreferences({ notes: "" });
    const removed = canonicalShoppingPreferences({
      notes: "",
      furnishingPlanIdentity: JSON.stringify({ r: ["furniture:rug:0"], a: [], n: [], e: [] }),
    });
    expect(furnitureShoppingPreferencesMatch(base, removed)).toBe(false);
  });

  it("parses unknown JSON as empty overrides", () => {
    expect(parseFurnishingPlanOverrides(null)).toMatchObject({
      removedRequirementKeys: [],
      addedRequirements: [],
    });
  });

  it("bumped analysis schema version is 2", () => {
    expect(ROOM_ANALYSIS_SCHEMA_VERSION).toBe(2);
  });
});
