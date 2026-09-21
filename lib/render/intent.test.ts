import { describe, expect, it } from "vitest";
import { resolveRenderIntent } from "./intent";

describe("resolveRenderIntent", () => {
  it("defaults the renovation flow to COMPLETE_INTERIOR", () => {
    expect(
      resolveRenderIntent({
        keepExistingWalls: false,
        flooring: "keep",
        wallMainColor: "",
        wallAccentColor: "",
        hasGroundedMaterialReference: false,
      })
    ).toBe("complete_interior");
  });

  it("uses COMPLETE_INTERIOR when wall color or flooring change is requested", () => {
    expect(
      resolveRenderIntent({
        keepExistingWalls: true,
        flooring: "keep",
        wallMainColor: "warm greige",
        wallAccentColor: "",
        hasGroundedMaterialReference: false,
      })
    ).toBe("complete_interior");
    expect(
      resolveRenderIntent({
        keepExistingWalls: false,
        flooring: "hardwood",
        wallMainColor: "",
        wallAccentColor: "",
        hasGroundedMaterialReference: false,
      })
    ).toBe("complete_interior");
  });

  it("uses FURNISH_ONLY only when existing walls and floor are kept with no paint or material refs", () => {
    expect(
      resolveRenderIntent({
        keepExistingWalls: true,
        flooring: "keep",
        wallMainColor: "",
        wallAccentColor: "",
        hasGroundedMaterialReference: false,
      })
    ).toBe("furnish_only");
  });

  it("uses COMPLETE_INTERIOR when a grounded material reference is present", () => {
    expect(
      resolveRenderIntent({
        keepExistingWalls: true,
        flooring: "keep",
        wallMainColor: "",
        wallAccentColor: "",
        hasGroundedMaterialReference: true,
      })
    ).toBe("complete_interior");
  });
});
