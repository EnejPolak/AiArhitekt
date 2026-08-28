import { describe, expect, it, vi } from "vitest";
import { mapProjectPreferencesDbError, projectPreferencesErrorMessage } from "./errors";

describe("project preference errors", () => {
  it("does not leak SQL or policy names", () => {
    const mapped = mapProjectPreferencesDbError({
      message:
        'new row violates row-level security policy "project_room_preferences_insert_own"',
      code: "42501",
    });
    expect(mapped.code).toBe("not_found");
    expect(mapped.message).toBe("Project not found.");
    expect(mapped.message).not.toMatch(/policy|SQL|project_room_preferences_insert_own/i);
  });

  it("maps missing rows without revealing ownership", () => {
    const mapped = mapProjectPreferencesDbError({ code: "PGRST116" });
    expect(mapped.code).toBe("not_found");
    expect(mapped.message).toBe(projectPreferencesErrorMessage("not_found"));
    expect(mapped.message).not.toMatch(/another user|belongs/i);
  });

  it("maps list/select failures without calling them saves", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mapped = mapProjectPreferencesDbError(
      {
        message: "Could not find the table 'public.project_room_preferences' in the schema cache",
        code: "PGRST205",
      },
      "load"
    );
    expect(mapped.code).toBe("failed");
    expect(mapped.message).toBe("Could not load your preferences. Try again.");
    expect(mapped.message).not.toMatch(/save|schema cache|PGRST|SQL|policy/i);
    errorSpy.mockRestore();
  });

  it("keeps save copy for write failures", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mapped = mapProjectPreferencesDbError(
      { message: "deadlock detected", code: "40P01" },
      "mutate"
    );
    expect(mapped.message).toBe("Could not save your preferences. Try again.");
    expect(mapped.message).not.toMatch(/deadlock|40P01/i);
    errorSpy.mockRestore();
  });
});
