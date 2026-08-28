import { describe, expect, it } from "vitest";
import {
  canonicalShoppingPreferences,
  DISCOVERY_PREFERENCE_SCHEMA_VERSION,
  loadStoredShoppingPreferenceSnapshot,
  shoppingPreferenceInputFromSnapshot,
  shoppingPreferencesMatch,
} from "./preferences";
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

  it("preserves noteShoppingIntents when reloading persisted discovery snapshot", () => {
    const snapshot = canonicalShoppingPreferences({
      notes: "gaming chair",
      flooring: "marble",
      wallMainColor: "matte black",
      wallAccentColor: "olive green",
    });
    const reloaded = loadStoredShoppingPreferenceSnapshot(snapshot);
    expect(reloaded.noteShoppingIntents).toEqual(["gaming_chair"]);
    expect(shoppingPreferencesMatch(snapshot, reloaded)).toBe(true);
  });
});
