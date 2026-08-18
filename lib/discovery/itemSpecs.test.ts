import { describe, expect, it } from "vitest";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { MAX_ITEM_SPEC_LENGTH, MAX_PRODUCT_DISCOVERY_ITEMS } from "./constants";
import {
  buildSearchableRequirements,
  furnitureItemSpec,
  furnitureQueryPlan,
  furnitureRequirementKey,
  materialItemSpec,
  materialRequirementKey,
  slugRequirementPart,
} from "./itemSpecs";

describe("deterministic requirement → item spec", () => {
  it("builds a furniture spec from trusted fields only", () => {
    expect(
      furnitureItemSpec({
        category: "sofa",
        quantity: 1,
        placementNotes: "back wall",
        constraints: ["modern", "beige"],
      })
    ).toBe("modern beige sofa");
  });

  it("builds a material spec including flooring for floor surfaces", () => {
    expect(
      materialItemSpec({
        surface: "floor",
        category: "oak laminate",
        finishDirection: "light natural",
        constraints: [],
      })
    ).toBe("light natural oak laminate flooring");
  });

  it("normalizes whitespace and clamps length", () => {
    const spec = furnitureItemSpec({
      category: "sofa",
      quantity: 1,
      placementNotes: null,
      constraints: ["   modern   ", `${"very-long-constraint-".repeat(20)}`],
    });
    expect(spec).not.toMatch(/\s{2,}/);
    expect(spec.length).toBeLessThanOrEqual(MAX_ITEM_SPEC_LENGTH);
  });

  it("uses stable requirement keys, not product titles", () => {
    expect(
      furnitureRequirementKey(
        { category: "Coffee Table", quantity: 1, placementNotes: null, constraints: [] },
        1
      )
    ).toBe("furniture:coffee-table:1");
    expect(
      materialRequirementKey(
        { surface: "floor", category: "oak laminate", finishDirection: null, constraints: [] },
        0
      )
    ).toBe("material:floor:oak-laminate:0");
    expect(slugRequirementPart("  TV unit ")).toBe("tv-unit");
  });

  it("does not put site operators, domains, or fake prices in the spec", () => {
    const spec = furnitureItemSpec({
      category: "sofa",
      quantity: 1,
      placementNotes: null,
      constraints: ["beige"],
    });
    expect(spec).not.toMatch(/site:/i);
    expect(spec).not.toMatch(/ikea\.com|jysk\.si|merkur\.si/i);
    expect(spec).not.toMatch(/€|sku/i);
  });

  it("caps searched items at MAX_PRODUCT_DISCOVERY_ITEMS and reports the rest as not_searched", () => {
    const furnitureNeeds = Array.from({ length: 8 }, (_, i) => ({
      category: `item ${i}`,
      quantity: 1,
      placementNotes: null,
      constraints: [],
    }));
    const materialNeeds = Array.from({ length: 5 }, (_, i) => ({
      surface: "wall",
      category: `material ${i}`,
      finishDirection: null,
      constraints: [],
    }));
    const { searched, notSearched } = buildSearchableRequirements({
      ...validRoomAnalysisResult.designRequirements,
      furnitureNeeds,
      materialNeeds,
    });
    expect(searched).toHaveLength(MAX_PRODUCT_DISCOVERY_ITEMS);
    expect(notSearched).toHaveLength(3);
    expect(searched[0].requirementKey).toBe("furniture:item-0:0");
    expect(notSearched[0].requirementType).toBe("material");
  });

  it("uses analysis order: furniture needs then material needs", () => {
    const { searched } = buildSearchableRequirements(validRoomAnalysisResult.designRequirements);
    expect(searched.map((item) => item.requirementType)).toEqual(["furniture", "material"]);
    expect(searched[0].itemSpec).toContain("sofa");
    expect(searched[1].itemSpec).toContain("flooring");
  });

  it("adds both explicit wall-paint requirements from user colors", () => {
    const { searched } = buildSearchableRequirements(validRoomAnalysisResult.designRequirements, {
      wallMainColor: "metallic black",
      wallAccentColor: "olive green",
    });
    const paintSpecs = searched
      .filter((item) => item.requirementType === "material" && /paint/i.test(item.itemSpec))
      .map((item) => item.itemSpec.toLowerCase());
    expect(
      paintSpecs.some((spec) => spec.includes("interior wall paint") && spec.includes("metallic black"))
    ).toBe(true);
    expect(
      paintSpecs.some((spec) => spec.includes("interior wall paint") && spec.includes("olive green"))
    ).toBe(true);
  });

  it("does not search paint when the user keeps existing walls", () => {
    const { searched } = buildSearchableRequirements(
      {
        ...validRoomAnalysisResult.designRequirements,
        materialNeeds: [],
      },
      {
        wallMainColor: "metallic black",
        wallAccentColor: "olive green",
        keepExistingWalls: true,
      }
    );
    expect(searched.every((item) => !/paint/i.test(item.itemSpec))).toBe(true);
  });

  it("builds a commerce desk query instead of an instructional phrase", () => {
    const need = {
      category: "desk",
      quantity: 1,
      placementNotes: null,
      constraints: ["must support multiple monitors"],
    };
    expect(furnitureItemSpec(need)).toBe("large computer desk multiple monitors");
    expect(furnitureItemSpec(need)).not.toMatch(/must support multiple monitors desk/i);
    expect(furnitureQueryPlan(need)).toEqual([
      "large computer desk multiple monitors",
      "large computer desk",
      "computer desk",
    ]);
  });
});
