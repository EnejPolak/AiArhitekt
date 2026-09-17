import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getVerifiedUser, requireAppUser } from "./session";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const createClientMock = vi.mocked(createClient);
const redirectMock = vi.mocked(redirect);

function mockGetUser(
  user: { id: string; email?: string } | null,
  error: unknown = null
) {
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error,
      })),
    },
  } as never);
}

describe("getVerifiedUser / requireAppUser", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("denies unauthenticated access", async () => {
    mockGetUser(null);
    expect(await getVerifiedUser()).toBeNull();
    await expect(requireAppUser()).rejects.toThrow(
      "REDIRECT:/sign-in?next=/app"
    );
    expect(redirectMock).toHaveBeenCalledWith("/sign-in?next=/app");
  });

  it("allows an authenticated user", async () => {
    mockGetUser({ id: "user-1", email: "a@example.com" });
    const user = await requireAppUser();
    expect(user.id).toBe("user-1");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("treats getUser errors as unauthenticated", async () => {
    mockGetUser(null, { message: "Auth session missing" });
    expect(await getVerifiedUser()).toBeNull();
  });

  it("dedupes getUser within a request via cache()", () => {
    const source = readFileSync(join(process.cwd(), "lib/auth/session.ts"), "utf8");
    expect(source).toContain("cache(");
    expect(source).toContain("getVerifiedUser");
  });
});
