import { describe, expect, it } from "vitest";
import { mapProjectDbError, projectErrorMessage } from "./errors";

describe("project errors", () => {
  it("does not leak SQL or policy names", () => {
    const mapped = mapProjectDbError({
      message:
        'new row violates row-level security policy "projects_insert_own" on table projects',
      code: "42501",
    });
    expect(mapped.code).toBe("not_found");
    expect(mapped.message).toBe("Project not found.");
    expect(mapped.message).not.toMatch(/policy|SQL|projects_insert_own/i);
  });

  it("maps missing rows without revealing ownership", () => {
    const mapped = mapProjectDbError({ code: "PGRST116" });
    expect(mapped.code).toBe("not_found");
    expect(mapped.message).toBe(projectErrorMessage("not_found"));
    expect(mapped.message).not.toMatch(/another user|belongs/i);
  });

  it("hides generic postgres failures", () => {
    const mapped = mapProjectDbError({
      message: "permission denied for table projects",
      code: "42501",
    });
    expect(mapped.message).toBe("Project not found.");
  });
});
