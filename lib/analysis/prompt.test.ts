import { describe, expect, it } from "vitest";
import { ROOM_ANALYSIS_SYSTEM_PROMPT, ROOM_ANALYSIS_USER_PROMPT } from "./prompt";

describe("room analysis furnishing-plan prompt", () => {
  it("asks for complete interior evaluation with verified vs inferred observations", () => {
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("complete interior furnishing plan");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("VERIFIED observations");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("INFERRED assumptions");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("likely_keep");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("no plants, artwork, books");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("required_for_render");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("suggested_only");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).toContain("Do not automatically require a TV unit");
    expect(ROOM_ANALYSIS_SYSTEM_PROMPT).not.toContain("often around four");
    expect(ROOM_ANALYSIS_USER_PROMPT).toContain("Do not include flooring, wall paint, or ceiling finish");
  });
});
