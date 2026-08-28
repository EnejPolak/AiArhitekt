import { describe, expect, it } from "vitest";
import {
  classifyCandidateProductKind,
  titleIsExplicitWallOnlyTile,
} from "./productKind";
import {
  evaluateCandidateHardGate,
} from "./requirementFidelity";
import { candidateMatchesRequirement } from "../categoryGate";
import { resolveShoppingRequirements } from "../resolveRequirements";
import { withLocalizedQueryPlan } from "../locales";

const LIVE_CERSANIT = "Cersanit Stenska ploščica Exclusive Marble (60 x 120 cm, Bela)";

function marbleRequirement() {
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
  return withLocalizedQueryPlan(searched.find((i) => i.provenance?.concept === "marble")!, "sl", "SI");
}

describe("P1.6.6.4 marble floor gate", () => {
  it("rejects live Cersanit wall tile for marble flooring", () => {
    expect(classifyCandidateProductKind({ title: LIVE_CERSANIT })).toBe("wall_tile");
    expect(titleIsExplicitWallOnlyTile(LIVE_CERSANIT)).toBe(true);
    const gate = evaluateCandidateHardGate(marbleRequirement(), { title: LIVE_CERSANIT });
    expect(gate.hardValid).toBe(false);
    expect(gate.fidelity.productKind).toBe("wall_tile");
    expect(gate.hardGateReasons).toEqual(expect.arrayContaining(["wall_tile", "not_floor_covering"]));
    expect(candidateMatchesRequirement(marbleRequirement(), LIVE_CERSANIT)).toBe(false);
  });

  it("rejects live Cersanit even when snippet suggests floor use", () => {
    const gate = evaluateCandidateHardGate(marbleRequirement(), {
      title: LIVE_CERSANIT,
      snippet: "Primerna za talne in stenske površine, 60 x 120 cm",
    });
    expect(gate.hardValid).toBe(false);
    expect(gate.fidelity.productKind).toBe("wall_tile");
  });

  it("accepts explicit floor tiles and rejects generic marble tiles", () => {
    const req = marbleRequirement();
    expect(candidateMatchesRequirement(req, "Talna ploščica Exclusive Marble")).toBe(true);
    expect(candidateMatchesRequirement(req, "Talna in stenska ploščica Marble")).toBe(true);
    expect(candidateMatchesRequirement(req, "Max Zagozda za ploščice")).toBe(false);
    expect(candidateMatchesRequirement(req, "Max Distančnik za ploščice 1 mm")).toBe(false);
    expect(candidateMatchesRequirement(req, "Marmorne ploščice antičnega videza")).toBe(false);
  });

  it("does not mark unknown generic marble tile as exact floor match", () => {
    const fidelity = evaluateCandidateHardGate(marbleRequirement(), {
      title: "Marmorne ploščice antičnega videza",
    }).fidelity;
    expect(fidelity.productKind).toBe("unknown");
    expect(fidelity.productKindMatch).not.toBe("exact");
  });
});
