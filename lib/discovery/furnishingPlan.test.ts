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
    expect(concepts).toEqual(["sofa", "coffee_table", "rug", "floor_lamp"]);
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
    expect(plan.suggested.some((item) => item.concept === "floor_lamp")).toBe(true);
    expect(searched.some((item) => item.provenance?.concept === "lighting")).toBe(false);
    expect(searched.some((item) => item.provenance?.concept === "floor_lamp")).toBe(false);
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

const liveV2Analysis = {
  designRequirements: {
    preserve: [],
    constraints: [],
    materialNeeds: [],
    furnitureNeeds: [
      {
        role: "required_for_render" as const,
        category: "sofa",
        quantity: null,
        rationale: "Primary seating; the room is empty.",
        constraints: ["must not block windows or door"],
        placementNotes: "against a wall or centrally if space allows",
      },
      {
        role: "required_for_render" as const,
        category: "coffee table",
        quantity: null,
        rationale: "Central table surface for living room use.",
        constraints: [],
        placementNotes: "in front of sofa",
      },
      {
        role: "required_for_render" as const,
        category: "rug",
        quantity: null,
        rationale: "Define seating area and add comfort.",
        constraints: [],
        placementNotes: "under sofa and coffee table",
      },
      {
        role: "required_for_render" as const,
        category: "lighting",
        quantity: null,
        rationale: "Functional lighting needed for evenings.",
        constraints: [],
        placementNotes: "ceiling or floor lamps",
      },
    ],
    replaceOrRemove: [],
  },
  observation: observation({
    constraints: ["large windows and sliding door limit wall space"],
    architecture: {
      doors: ["large sliding glass door"],
      floor: "unfinished concrete",
      walls: ["white, unfinished"],
      windows: ["large, multiple, providing natural light"],
      fixedElements: [],
    },
    visualCondition: {
      colors: ["white"],
      overall: "unfinished",
      lighting: "natural light from windows",
    },
    measurementStatus: { exactDimensionsKnown: false, qualitativeNotes: ["large open space"] },
    uncertainties: ["room purpose inferred as living-room"],
  }),
};

describe("atomic furnishing requirements", () => {
  it("A. generic lighting + ceiling electrical point becomes ceiling_light", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: requirements([
        furnitureNeed("lighting", {
          placementNotes: "needed for evenings",
          rationale: "No usable fixture.",
        }),
      ]),
      observation: observation({
        architecture: {
          walls: ["open wall"],
          floor: "bare screed",
          windows: ["one window"],
          doors: ["entry door"],
          fixedElements: ["dangling ceiling electrical point"],
        },
      }),
    });
    expect(plan.required).toHaveLength(1);
    expect(plan.required[0]?.concept).toBe("ceiling_light");
    expect(plan.required[0]?.displayLabel).toBe("Ceiling light fixture");
    expect(plan.required[0]?.requirementKey).toBe("furniture:ceiling-light:0");
    expect(plan.required[0]?.quantity).toBeNull();
    expect(plan.required.some((item) => item.concept === "lighting")).toBe(false);
  });

  it("B. generic lighting + placement next to sofa becomes floor_lamp", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: requirements([
        furnitureNeed("lighting", { placementNotes: "next to sofa" }),
      ]),
      observation: observation(),
    });
    expect(plan.required.map((item) => item.concept)).toEqual(["floor_lamp"]);
    expect(plan.required[0]?.displayLabel).toBe("Floor lamp");
    expect(plan.required[0]?.requirementKey).toBe("furniture:floor-lamp:0");
  });

  it("C. ceiling or floor lamp with no disambiguating evidence is not required", () => {
    const { searched, plan } = resolveShoppingRequirements({
      analysisRequirements: requirements([
        furnitureNeed("ceiling or floor lamp", { placementNotes: "ceiling or floor lamps" }),
      ]),
      observation: observation(),
    });
    expect(plan.required).toHaveLength(0);
    expect(searched.some((item) => /ceiling or floor/i.test(item.itemSpec))).toBe(false);
    expect(searched.some((item) => item.provenance?.concept === "lighting")).toBe(false);
    expect(plan.suggested.length).toBeGreaterThan(0);
  });

  it("D. explicit user floor lamp wins", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: requirements([furnitureNeed("lighting")]),
      observation: observation(),
      preferences: { notes: "I want a floor lamp" },
    });
    expect(plan.required.some((item) => item.concept === "floor_lamp")).toBe(true);
    expect(plan.required.some((item) => item.concept === "lighting")).toBe(false);
    expect(plan.required.some((item) => item.concept === "ceiling_light")).toBe(false);
  });

  it("E. explicit user pendant above dining table wins", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: requirements([furnitureNeed("sofa")]),
      observation: observation(),
      preferences: { notes: "pendant above dining table" },
    });
    expect(plan.required.some((item) => item.concept === "pendant_light")).toBe(true);
    expect(plan.required.find((item) => item.concept === "pendant_light")?.displayLabel).toBe(
      "Pendant light"
    );
  });

  it("F. atomic lighting keys stay stable across reorder", () => {
    const first = normalizeFurnishingPlan({
      analysisRequirements: requirements([
        furnitureNeed("coffee table"),
        furnitureNeed("lighting", { placementNotes: "next to sofa" }),
        furnitureNeed("sofa"),
      ]),
      observation: observation(),
    });
    const second = normalizeFurnishingPlan({
      analysisRequirements: requirements([
        furnitureNeed("sofa"),
        furnitureNeed("lighting", { placementNotes: "next to sofa" }),
        furnitureNeed("coffee table"),
      ]),
      observation: observation(),
    });
    expect(first.required.map((item) => item.requirementKey).sort()).toEqual(
      second.required.map((item) => item.requirementKey).sort()
    );
    expect(first.required.find((item) => item.concept === "floor_lamp")?.requirementKey).toBe(
      "furniture:floor-lamp:0"
    );
  });

  it("G. normalization does not call providers", () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("provider called");
    }) as typeof fetch;
    try {
      normalizeFurnishingPlan({
        analysisRequirements: liveV2Analysis.designRequirements,
        observation: liveV2Analysis.observation,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("H. sofa / coffee table / rug behavior is unchanged", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: liveV2Analysis.designRequirements,
      observation: liveV2Analysis.observation,
    });
    expect(plan.required.find((item) => item.concept === "sofa")?.requirementKey).toBe("furniture:sofa:0");
    expect(plan.required.find((item) => item.concept === "coffee_table")?.requirementKey).toBe(
      "furniture:coffee-table:0"
    );
    expect(plan.required.find((item) => item.concept === "rug")?.requirementKey).toBe("furniture:rug:0");
  });

  it("replays the saved empty living-room v2 analysis into a ceiling light fixture", () => {
    const { searched, plan } = resolveShoppingRequirements({
      analysisRequirements: liveV2Analysis.designRequirements,
      observation: liveV2Analysis.observation,
    });
    expect(plan.required.map((item) => item.displayLabel)).toEqual([
      "Sofa",
      "Coffee table",
      "Rug",
      "Ceiling light fixture",
    ]);
    expect(plan.required.map((item) => item.concept)).toEqual([
      "sofa",
      "coffee_table",
      "rug",
      "ceiling_light",
    ]);
    expect(plan.required.some((item) => item.concept === "lighting")).toBe(false);
    expect(plan.required.some((item) => /ceiling or floor/i.test(item.category))).toBe(false);
    expect(searched.some((item) => item.provenance?.concept === "lighting")).toBe(false);
    expect(searched.some((item) => /ceiling or floor/i.test(item.itemSpec))).toBe(false);
    const light = plan.required.find((item) => item.concept === "ceiling_light")!;
    expect(light.requirementKey).toBe("furniture:ceiling-light:0");
    expect(light.quantity).toBeNull();
  });

  it("user can change a ceiling light fixture to a floor lamp without a provider call", () => {
    const plan = normalizeFurnishingPlan({
      analysisRequirements: liveV2Analysis.designRequirements,
      observation: liveV2Analysis.observation,
      planOverrides: {
        ...EMPTY_FURNISHING_PLAN_OVERRIDES,
        editedRequirements: {
          "furniture:ceiling-light:0": { category: "Floor lamp" },
        },
      },
    });
    const light = plan.required.find((item) => item.requirementKey === "furniture:ceiling-light:0");
    expect(light?.concept).toBe("floor_lamp");
    expect(light?.displayLabel).toBe("Floor lamp");
    expect(plan.required.some((item) => item.concept === "ceiling_light")).toBe(false);
  });
});
