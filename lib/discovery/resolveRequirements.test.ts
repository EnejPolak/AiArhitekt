import { describe, expect, it } from "vitest";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { shoppingPreferenceHash } from "./preferenceHash";
import { canonicalShoppingPreferences, shoppingPreferencesMatch } from "./preferences";
import {
  debugResolvedShoppingRequirements,
  resolveShoppingRequirements,
} from "./resolveRequirements";

const woodLookAnalysis = {
  ...validRoomAnalysisResult.designRequirements,
  furnitureNeeds: [
    {
      category: "office chair",
      quantity: 1,
      placementNotes: null,
      constraints: [],
    },
    {
      category: "desk",
      quantity: 1,
      placementNotes: null,
      constraints: ["computer desk"],
    },
  ],
  materialNeeds: [
    {
      surface: "floor",
      category: "light tone wood-look flooring",
      finishDirection: "light natural",
      constraints: ["wood-look"],
    },
    {
      surface: "wall",
      category: "interior wall paint",
      finishDirection: "olive green",
      constraints: ["olive green"],
    },
  ],
};

describe("resolveShoppingRequirements", () => {
  it("A. flooring override: marble replaces wood-look", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: woodLookAnalysis,
      preferences: { flooring: "marble" },
    });
    const labels = searched.map((item) => item.displayLabel ?? item.itemSpec).join(" | ");
    expect(labels.toLowerCase()).toContain("marble");
    expect(labels.toLowerCase()).not.toContain("wood-look");
    expect(searched.some((item) => item.provenance?.concept === "marble")).toBe(true);
  });

  it("B. flooring keep suppresses AI flooring", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: woodLookAnalysis,
      preferences: { flooring: "keep" },
    });
    expect(searched.every((item) => !/wood-look|flooring|marble|laminate/i.test(item.itemSpec))).toBe(
      true
    );
  });

  it("C. laminate override replaces hardwood analysis", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: {
        ...validRoomAnalysisResult.designRequirements,
        materialNeeds: [
          {
            surface: "floor",
            category: "hardwood flooring",
            finishDirection: null,
            constraints: ["hardwood"],
          },
        ],
      },
      preferences: { flooring: "laminate" },
    });
    expect(searched.some((item) => item.provenance?.concept === "laminate")).toBe(true);
    expect(searched.some((item) => /hardwood/i.test(item.itemSpec))).toBe(false);
  });

  it("D. gaming chair from English notes", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: validRoomAnalysisResult.designRequirements,
      preferences: { notes: "I want a gaming chair" },
    });
    expect(searched.some((item) => item.provenance?.concept === "gaming_chair")).toBe(true);
  });

  it("E. gaming chair from Slovenian notes", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: validRoomAnalysisResult.designRequirements,
      preferences: { notes: "Rad bi gaming stol" },
    });
    expect(searched.some((item) => item.provenance?.concept === "gaming_chair")).toBe(true);
  });

  it("F. gaming chair refines AI office chair", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: woodLookAnalysis,
      preferences: { notes: "gaming chair" },
    });
    const chairItems = searched.filter((item) =>
      ["gaming_chair", "office_chair", "chair"].includes(item.provenance?.concept ?? "")
    );
    expect(chairItems).toHaveLength(1);
    expect(chairItems[0]?.provenance?.concept).toBe("gaming_chair");
  });

  it("G. negative notes suppress chair shopping intent", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: woodLookAnalysis,
      preferences: { notes: "Keep my current chair" },
    });
    expect(searched.some((item) => item.provenance?.concept === "gaming_chair")).toBe(false);
    expect(searched.some((item) => item.provenance?.concept === "office_chair")).toBe(false);
    expect(searched.some((item) => item.provenance?.concept === "chair")).toBe(false);
  });

  it("H. irrelevant notes add nothing", () => {
    const base = resolveShoppingRequirements({
      analysisRequirements: validRoomAnalysisResult.designRequirements,
    });
    const cozy = resolveShoppingRequirements({
      analysisRequirements: validRoomAnalysisResult.designRequirements,
      preferences: { notes: "Make the room feel warm and cozy" },
    });
    expect(cozy.searched.map((item) => item.requirementKey)).toEqual(
      base.searched.map((item) => item.requirementKey)
    );
  });

  it("I. structured flooring wins over conflicting notes", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: woodLookAnalysis,
      preferences: { flooring: "marble", notes: "maybe wood floor" },
    });
    expect(searched.some((item) => item.provenance?.concept === "marble")).toBe(true);
    expect(searched.some((item) => /wood-look/i.test(item.itemSpec))).toBe(false);
  });

  it("resolves the current live project shape without providers", () => {
    const resolved = debugResolvedShoppingRequirements({
      analysisRequirements: {
        ...woodLookAnalysis,
        furnitureNeeds: [
          {
            category: "desk",
            quantity: 1,
            placementNotes: null,
            constraints: ["computer desk", "multiple monitors"],
          },
        ],
        materialNeeds: [
          {
            surface: "floor",
            category: "light tone wood-look flooring",
            finishDirection: "light natural",
            constraints: ["wood-look"],
          },
        ],
      },
      preferences: {
        flooring: "marble",
        wallMainColor: "matte black",
        wallAccentColor: "olive green",
        notes: "I want a gaming chair",
      },
    });

    const concepts = resolved.map((item) => item.concept);
    expect(concepts).toContain("gaming_chair");
    expect(concepts).toContain("desk");
    expect(concepts).toContain("marble");
    expect(resolved.some((item) => /matte black/i.test(item.displayLabel))).toBe(true);
    expect(resolved.some((item) => /olive green/i.test(item.displayLabel))).toBe(true);
    expect(resolved.some((item) => /wood-look/i.test(item.displayLabel))).toBe(false);
  });
});

describe("notes shopping identity", () => {
  it("A. equivalent gaming-chair notes share identity", () => {
    const a = shoppingPreferenceHash({ notes: "I want a gaming chair" });
    const b = shoppingPreferenceHash({ notes: "Gaming chair please." });
    expect(a).toBe(b);
    expect(canonicalShoppingPreferences({ notes: "I want a gaming chair" }).noteShoppingIntents).toEqual([
      "gaming_chair",
    ]);
  });

  it("B. gaming chair vs office chair makes discovery stale", () => {
    const gaming = shoppingPreferenceHash({ notes: "gaming chair" });
    const office = shoppingPreferenceHash({ notes: "office chair" });
    expect(gaming).not.toBe(office);
  });

  it("C. irrelevant prose changes do not invalidate discovery", () => {
    const cozy = shoppingPreferenceHash({ notes: "Make the room feel cozy" });
    const warm = shoppingPreferenceHash({ notes: "Make the room feel warm and cozy" });
    expect(cozy).toBe(warm);
  });

  it("D. marble vs laminate makes discovery stale", () => {
    const marble = shoppingPreferenceHash({ flooring: "marble" });
    const laminate = shoppingPreferenceHash({ flooring: "laminate" });
    expect(marble).not.toBe(laminate);
  });

  it("treats legacy v1 snapshots as stale when note intents appear", () => {
    const legacy = {
      schemaVersion: 1,
      selectedStyles: [],
      wallMainColor: "",
      wallAccentColor: "",
      flooring: "keep",
      underfloorHeating: false,
      bedType: "none",
      keepExistingWalls: false,
    };
    const current = canonicalShoppingPreferences({ notes: "gaming chair" });
    expect(shoppingPreferencesMatch(legacy, { notes: "gaming chair" })).toBe(false);
    expect(current.noteShoppingIntents).toEqual(["gaming_chair"]);
  });
});
