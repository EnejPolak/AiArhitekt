import { describe, expect, it } from "vitest";
import { formatRelativeUpdated } from "./format";
import { isProjectArchived } from "./types";

describe("formatRelativeUpdated", () => {
  it("formats recent updates", () => {
    const now = Date.parse("2026-08-18T12:00:00.000Z");
    expect(
      formatRelativeUpdated("2026-08-18T11:59:20.000Z", now)
    ).toBe("Just now");
    expect(
      formatRelativeUpdated("2026-08-18T11:10:00.000Z", now)
    ).toBe("50 min ago");
  });
});

describe("archive model", () => {
  it("treats null archived_at as active", () => {
    expect(isProjectArchived({ archived_at: null })).toBe(false);
  });

  it("treats a timestamp as archived", () => {
    expect(
      isProjectArchived({ archived_at: "2026-08-18T12:00:00.000Z" })
    ).toBe(true);
  });
});
