import { describe, expect, it } from "vitest";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { localizeSearchableRequirements } from "./locales/queryPlan";
import { extractShoppingIntentsFromNotes } from "./noteIntents";
import { resolveShoppingRequirements } from "./resolveRequirements";

const emptyAnalysis = {
  furnitureNeeds: [] as const,
  materialNeeds: [] as const,
  constraints: [] as const,
  preserve: [] as const,
  replaceOrRemove: [] as const,
};

const LIVE_PHASE_2E_NOTES = [
  "Keep my current sofa. Keep my current chair. Keep my current desk. Keep my current bed. Keep my current wardrobe.",
  "Need only these three products:",
  "1. black floor lamp, metal, max 150 EUR",
  "2. light-colored ceramic decorative vase, around 30 cm, max 60 EUR",
  "3. neutral living-room rug, approximately 160x230 cm, max 250 EUR",
].join(" ");

function blobOf(item: {
  itemSpec: string;
  displayLabel?: string;
  snapshot: { category?: string; constraints?: string[] };
}) {
  const snapshot = item.snapshot;
  return `${item.itemSpec} ${item.displayLabel ?? ""} ${snapshot.category ?? ""} ${(snapshot.constraints ?? []).join(" ")}`;
}

describe("explicit product requests from notes", () => {
  it("preserves the live Phase 2E product list without dropping vase or rug", () => {
    const { searched, notSearched } = resolveShoppingRequirements({
      analysisRequirements: emptyAnalysis,
      preferences: { notes: LIVE_PHASE_2E_NOTES, flooring: "keep" },
    });
    expect(searched).toHaveLength(3);
    expect(notSearched).toHaveLength(0);

    const blobs = searched.map((item) => blobOf(item).toLowerCase());
    const floorLamp = searched.find((item) => /floor lamp/i.test(blobOf(item)));
    const vase = searched.find((item) => /vase/i.test(blobOf(item)));
    const rug = searched.find((item) => /rug/i.test(blobOf(item)));

    expect(floorLamp).toBeTruthy();
    expect(vase).toBeTruthy();
    expect(rug).toBeTruthy();
    expect(blobs.join(" ")).not.toMatch(/ceiling|stropn|pendant/i);

    expect(blobOf(floorLamp!).toLowerCase()).toMatch(/black/);
    expect(blobOf(floorLamp!).toLowerCase()).toMatch(/metal/);
    expect(blobOf(floorLamp!).toLowerCase()).toMatch(/150/);

    expect(blobOf(vase!).toLowerCase()).toMatch(/ceramic/);
    expect(blobOf(vase!).toLowerCase()).toMatch(/30/);
    expect(blobOf(vase!).toLowerCase()).toMatch(/60/);
    expect(blobOf(vase!).toLowerCase()).toMatch(/light/);

    expect(blobOf(rug!).toLowerCase()).toMatch(/160/);
    expect(blobOf(rug!).toLowerCase()).toMatch(/230/);
    expect(blobOf(rug!).toLowerCase()).toMatch(/250/);
    expect(blobOf(rug!).toLowerCase()).toMatch(/neutral/);
  });

  it("does not localize a user floor lamp into a ceiling lamp", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: emptyAnalysis,
      preferences: { notes: LIVE_PHASE_2E_NOTES, selectedStyles: ["modern"] },
    });
    const localized = localizeSearchableRequirements(searched, "SI", ["modern"]);
    const queries = localized.flatMap((item) => item.queryPlan).join(" ");
    expect(queries).toMatch(/floor lamp/i);
    expect(queries).not.toMatch(/stropna svetilka/i);
    expect(queries).not.toMatch(/ceiling/i);
    expect(localized[0]?.queryPlan[0]).not.toMatch(/moderna stropna/i);
  });

  it("preserves an unknown explicit product noun without a pattern entry", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: emptyAnalysis,
      preferences: { notes: "I need a mid-century sideboard, walnut, max 400 EUR" },
    });
    const sideboard = searched.find((item) => /sideboard/i.test(blobOf(item)));
    expect(sideboard).toBeTruthy();
    expect(blobOf(sideboard!).toLowerCase()).toMatch(/walnut/);
    expect(blobOf(sideboard!).toLowerCase()).toMatch(/400/);
    expect(extractShoppingIntentsFromNotes("I need a mid-century sideboard, walnut, max 400 EUR").map((item) => item.concept)).toEqual([
      "other",
    ]);
  });

  it("does not turn design-only prose into a product search", () => {
    const base = resolveShoppingRequirements({
      analysisRequirements: validRoomAnalysisResult.designRequirements,
    });
    const calm = resolveShoppingRequirements({
      analysisRequirements: validRoomAnalysisResult.designRequirements,
      preferences: { notes: "I want the room to feel calm and elegant" },
    });
    expect(calm.searched.map((item) => item.requirementKey)).toEqual(
      base.searched.map((item) => item.requirementKey)
    );
  });

  it("deduplicates a generic lamp against a more specific floor lamp", () => {
    const { searched } = resolveShoppingRequirements({
      analysisRequirements: emptyAnalysis,
      preferences: {
        notes: "1. black floor lamp, metal, max 150 EUR 2. floor lamp",
      },
    });
    const lamps = searched.filter((item) => /lamp/i.test(blobOf(item)));
    expect(lamps).toHaveLength(1);
    expect(blobOf(lamps[0]!).toLowerCase()).toMatch(/black/);
    expect(blobOf(lamps[0]!).toLowerCase()).toMatch(/floor lamp/);
  });
});
