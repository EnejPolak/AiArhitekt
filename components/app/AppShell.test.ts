import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("authenticated mobile shell", () => {
  it("keeps the desktop sidebar and uses a mobile drawer", () => {
    const layout = readFileSync(join(process.cwd(), "app/app/layout.tsx"), "utf8");
    const shell = readFileSync(join(process.cwd(), "components/app/AppShell.tsx"), "utf8");
    expect(layout).toContain("AppShell");
    expect(layout).toContain("ProjectsSidebar");
    expect(shell).toContain("hidden h-full shrink-0 md:flex");
    expect(shell).toContain("Open projects menu");
    expect(shell).toContain("Escape");
    expect(shell).toContain("setOpen(false)");
    expect(shell).toContain("usePathname");
  });
});
