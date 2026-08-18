import { describe, expect, it } from "vitest";
import {
  isAllowedStepKey,
  ROOM_STEP_KEYS,
  stepIndexFromKey,
  stepKeyFromIndex,
} from "./steps";

describe("wizard step keys", () => {
  it("starts at greeting", () => {
    expect(ROOM_STEP_KEYS[0]).toBe("greeting");
    expect(stepKeyFromIndex("room-renovation", 0)).toBe("greeting");
  });

  it("round-trips indexes for room renovation", () => {
    expect(stepIndexFromKey("room-renovation", "photo-upload")).toBe(2);
    expect(stepKeyFromIndex("room-renovation", 2)).toBe("photo-upload");
  });

  it("falls back to greeting for unknown keys", () => {
    expect(stepIndexFromKey("room-renovation", "not-a-step")).toBe(0);
  });

  it("does not expose inactive home or new-construction steps", () => {
    expect(isAllowedStepKey("home-renovation", "greeting")).toBe(false);
    expect(isAllowedStepKey("home-renovation", "floor-plan-upload")).toBe(false);
    expect(isAllowedStepKey("new-construction", "greeting")).toBe(false);
    expect(isAllowedStepKey("room-renovation", "photo-upload")).toBe(true);
  });
});
