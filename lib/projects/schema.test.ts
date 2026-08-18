import { describe, expect, it } from "vitest";
import { PROJECT_NAME_MAX } from "./types";
import {
  createProjectSchema,
  projectIdSchema,
  renameProjectSchema,
  updateWizardSchema,
} from "./schema";

const PROJECT_ID = "3b1c2d4e-5f67-4901-a345-6789abcdef01";

describe("createProjectSchema", () => {
  it("accepts room-renovation", () => {
    const parsed = createProjectSchema.parse({
      projectType: "room-renovation",
      name: "  Kitchen  ",
    });
    expect(parsed.projectType).toBe("room-renovation");
    expect(parsed.name).toBe("Kitchen");
  });

  it("defaults omitted type to room-renovation", () => {
    const parsed = createProjectSchema.parse({});
    expect(parsed.projectType).toBe("room-renovation");
  });

  it("rejects home-renovation even in a crafted payload", () => {
    const result = createProjectSchema.safeParse({
      projectType: "home-renovation",
      name: "Whole house",
    });
    expect(result.success).toBe(false);
  });

  it("rejects new-construction even in a crafted payload", () => {
    const result = createProjectSchema.safeParse({
      projectType: "new-construction",
      name: "New house",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty project name", () => {
    const result = createProjectSchema.safeParse({
      projectType: "room-renovation",
      name: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an oversized project name", () => {
    const result = createProjectSchema.safeParse({
      projectType: "room-renovation",
      name: "x".repeat(PROJECT_NAME_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown project types", () => {
    const result = createProjectSchema.safeParse({
      projectType: "interior",
    });
    expect(result.success).toBe(false);
  });
});

describe("projectIdSchema", () => {
  it("accepts a UUID", () => {
    expect(projectIdSchema.parse(PROJECT_ID)).toBe(PROJECT_ID);
  });

  it("rejects sequential or non-uuid ids", () => {
    expect(projectIdSchema.safeParse("1").success).toBe(false);
    expect(projectIdSchema.safeParse("project-123").success).toBe(false);
  });
});

describe("renameProjectSchema", () => {
  it("trims the new name", () => {
    const parsed = renameProjectSchema.parse({
      projectId: PROJECT_ID,
      name: "  Living room  ",
    });
    expect(parsed.name).toBe("Living room");
  });
});

describe("updateWizardSchema", () => {
  it("accepts a real room-renovation step", () => {
    const parsed = updateWizardSchema.parse({
      projectId: PROJECT_ID,
      projectType: "room-renovation",
      currentStepKey: "photo-upload",
    });
    expect(parsed.currentStepKey).toBe("photo-upload");
  });

  it("rejects unknown wizard steps", () => {
    const result = updateWizardSchema.safeParse({
      projectId: PROJECT_ID,
      projectType: "room-renovation",
      currentStepKey: "upload",
    });
    expect(result.success).toBe(false);
  });

  it("rejects home-renovation wizard updates", () => {
    const result = updateWizardSchema.safeParse({
      projectId: PROJECT_ID,
      projectType: "home-renovation",
      currentStepKey: "floor-plan-upload",
    });
    expect(result.success).toBe(false);
  });
});
