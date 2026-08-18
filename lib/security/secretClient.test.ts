import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("secret persist-client ownership invariant", () => {
  it("never prefixes secret or render kill switch as NEXT_PUBLIC", () => {
    const envExample = source("env.example");
    expect(envExample).not.toMatch(/NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
    expect(envExample).not.toMatch(/NEXT_PUBLIC_OPENAI_API_KEY/);
    expect(envExample).not.toMatch(/NEXT_PUBLIC_OPENAI_IMAGE_RENDER_ENABLED/);
    expect(envExample).toContain("SUPABASE_SECRET_KEY=");
    expect(envExample).toContain("OPENAI_IMAGE_RENDER_ENABLED=");
  });

  it("creates the persist client only after user ownership checks", () => {
    for (const file of ["lib/discovery/actions.ts", "lib/render/actions.ts"]) {
      const text = source(file);
      expect(text).toContain("getVerifiedUser");
      expect(text).toContain("createPersistClient");
      expect(text.indexOf("getVerifiedUser")).toBeLessThan(text.indexOf("createPersistClient"));
      expect(text).toContain("getProjectById");
    }
  });
});
