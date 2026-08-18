import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("legacy unauthenticated analyze-room path", () => {
  it("no longer exists as a paid OpenAI route", async () => {
    const route = join(process.cwd(), "app/api/analyze-room/route.ts");
    expect(existsSync(route)).toBe(false);

    const openaiCreate = vi.fn();
    await expect(import("../../app/api/analyze-room/route")).rejects.toThrow();
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});
