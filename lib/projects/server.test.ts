import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("loadWorkspaceProjects", () => {
  it("returns empty lists when there is no authenticated user", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/session", () => ({
      getVerifiedUser: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => {
        throw new Error("createClient must not run for an anonymous workspace load");
      }),
    }));
    const { loadWorkspaceProjects } = await import("./server");
    await expect(loadWorkspaceProjects()).resolves.toEqual({ active: [], archived: [] });
  });

  it("dedupes workspace loads per request", () => {
    const source = readFileSync(join(process.cwd(), "lib/projects/server.ts"), "utf8");
    expect(source).toMatch(/export const loadWorkspaceProjects = cache\(/);
  });
});
