import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseNoStoreFetch } from "./noStoreFetch";

describe("supabaseNoStoreFetch", () => {
  it("always sets cache to no-store", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await supabaseNoStoreFetch("http://127.0.0.1:54421/rest/v1/projects", {
      headers: { accept: "application/json" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:54421/rest/v1/projects",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.any(Headers),
      })
    );
    const sent = fetchMock.mock.calls[0][1].headers as Headers;
    expect(sent.get("Cache-Control")).toBe("no-store");
    expect(sent.get("Pragma")).toBe("no-cache");
    vi.unstubAllGlobals();
  });

  it("is wired into the server and session clients", () => {
    const server = readFileSync(join(process.cwd(), "lib/supabase/server.ts"), "utf8");
    const session = readFileSync(join(process.cwd(), "lib/supabase/updateSession.ts"), "utf8");
    expect(server).toContain("supabaseNoStoreFetch");
    expect(session).toContain("supabaseNoStoreFetch");
  });
});
