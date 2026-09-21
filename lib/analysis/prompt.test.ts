import { describe, expect, it } from "vitest";
import { ROOM_ANALYSIS_SYSTEM_PROMPT, ROOM_ANALYSIS_USER_PROMPT } from "./prompt";

describe("room analysis furnishing-plan prompt", () => {
  it("asks for a complete but restrained functional plan, not likely categories", () => {
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain(
      "complete but restrained functional furnishing plan"
    );
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).not.toContain("List likely furniture categories");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("likely_keep");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("no plants, artwork, books");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("required_for_render");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("suggested_only");
    expect(ROOM_ANALYSIS_USER_PROMPT).toContain("Do not include flooring, wall paint, or ceiling finish");
  });
});
