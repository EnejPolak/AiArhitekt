import { describe, expect, it } from "vitest";
import { STYLE_ACCEPTANCE_THRESHOLD } from "./constants";
import { resolveStyleQueryStopAction } from "./stopPolicy";

describe("resolveStyleQueryStopAction", () => {
  it("stops immediately when styleScore meets acceptance threshold", () => {
    expect(
      resolveStyleQueryStopAction({
        styleEnabled: true,
        currentStyleScore: STYLE_ACCEPTANCE_THRESHOLD,
        queryLevel: 0,
        maxLevel: 3,
      })
    ).toBe("accept_and_stop");
  });

  it("continues when styleScore is below threshold and another level exists", () => {
    expect(
      resolveStyleQueryStopAction({
        styleEnabled: true,
        currentStyleScore: 0.38,
        queryLevel: 0,
        maxLevel: 3,
      })
    ).toBe("continue");
  });

  it("finalizes cross-level best at the last allowed level below threshold", () => {
    expect(
      resolveStyleQueryStopAction({
        styleEnabled: true,
        currentStyleScore: 0.31,
        queryLevel: 2,
        maxLevel: 3,
      })
    ).toBe("finalize_cross_level");
  });

  it("stops on first valid candidate when style ranking is disabled", () => {
    expect(
      resolveStyleQueryStopAction({
        styleEnabled: false,
        currentStyleScore: null,
        queryLevel: 0,
        maxLevel: 3,
      })
    ).toBe("accept_and_stop");
  });
});
