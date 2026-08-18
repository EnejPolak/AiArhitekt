import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

const createClientMock = vi.mocked(createClient);

describe("GET /auth/callback", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("redirects to sign-in when code/token is missing", async () => {
    const res = await GET(new Request("http://localhost:3000/auth/callback"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?error=callback"
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("does not redirect to an external next URL", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      },
    } as never);

    const res = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=abc&next=https://evil.example"
      )
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("fails closed when code exchange errors", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          error: { message: "expired" },
        })),
      },
    } as never);

    const res = await GET(
      new Request("http://localhost:3000/auth/callback?code=stale")
    );
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?error=callback"
    );
  });
});
