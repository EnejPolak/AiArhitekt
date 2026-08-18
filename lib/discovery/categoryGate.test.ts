import { describe, expect, it } from "vitest";
import { candidateMatchesRequirement } from "./categoryGate";
import type { SearchableRequirement } from "./itemSpecs";

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
  };
}

function paintRequirement(color: string): SearchableRequirement {
  return {
    requirementType: "material",
    requirementKey: `material:wall:interior-wall-paint:${color}`,
    itemSpec: `interior wall paint ${color}`,
    queryPlan: [`interior wall paint ${color}`, `wall paint ${color}`],
    snapshot: {
      surface: "wall",
      category: "interior wall paint",
      finishDirection: color,
      constraints: [color, "main wall"],
    },
  };
}

describe("semantic category gate", () => {
  it("accepts a desk and rejects unrelated furniture for a desk requirement", () => {
    const requirement = deskRequirement();
    expect(candidateMatchesRequirement(requirement, "Large Computer Desk for Dual Monitors")).toBe(
      true
    );
    expect(candidateMatchesRequirement(requirement, "Ergonomic mesh office chair")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "Modern beige sofa")).toBe(false);
  });

  it("rejects a random unrelated paint color", () => {
    const requirement = paintRequirement("metallic black");
    expect(candidateMatchesRequirement(requirement, "Metallic Black Interior Wall Paint 10L")).toBe(
      true
    );
    expect(candidateMatchesRequirement(requirement, "White interior wall paint")).toBe(false);
    expect(candidateMatchesRequirement(requirement, "Olive green sofa")).toBe(false);
  });
});
