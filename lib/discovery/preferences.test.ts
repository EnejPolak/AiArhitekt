import { describe, expect, it } from "vitest";
import { canonicalShoppingPreferences } from "./preferences";
import { shoppingPreferenceHash } from "./preferenceHash";

describe("canonical shopping preferences", () => {
  it("normalizes whitespace, case, and style order", () => {
    const a = shoppingPreferenceHash({
      selectedStyles: ["Industrial", "modern"],
      wallMainColor: "Metallic  Black",
      wallAccentColor: " Olive Green ",
      flooring: "marble",
      underfloorHeating: false,
      bedType: "none",
    });
    const b = shoppingPreferenceHash({
      selectedStyles: ["modern", "industrial"],
      wallMainColor: "metallic black",
      wallAccentColor: "olive green",
      flooring: "marble",
      underfloorHeating: false,
      bedType: "none",
    });
    expect(a).toBe(b);
    expect(canonicalShoppingPreferences({ flooring: "not-a-floor" }).flooring).toBe("keep");
  });
});
