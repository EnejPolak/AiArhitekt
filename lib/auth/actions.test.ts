import { afterEach, describe, expect, it, vi } from "vitest";
import { signIn, signUp } from "./actions";

const signInWithPassword = vi.fn();
const signUpMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword,
      signUp: signUpMock,
    },
  })),
}));

vi.mock("@/lib/env/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env/supabase")>(
    "@/lib/env/supabase"
  );
  return {
    ...actual,
    getAppOrigin: () => "http://127.0.0.1:3000",
  };
});

describe("auth actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sign-up with immediate session is ok without confirmation", async () => {
    signUpMock.mockResolvedValue({
      data: { session: { access_token: "t" }, user: { identities: [{}] } },
      error: null,
    });
    const result = await signUp({
      email: "new@example.com",
      password: "password12",
      confirmPassword: "password12",
      agreeToTerms: true,
    });
    expect(result).toEqual({ ok: true });
  });

  it("sign-up without session is confirmation required, not generic failure", async () => {
    signUpMock.mockResolvedValue({
      data: { session: null, user: { id: "u1", identities: [{}] } },
      error: null,
    });
    const result = await signUp({
      email: "new@example.com",
      password: "password12",
      confirmPassword: "password12",
      agreeToTerms: true,
    });
    expect(result).toEqual({ ok: true, needsEmailConfirmation: true });
  });

  it("maps already-registered provider errors", async () => {
    signUpMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "user_already_exists", message: "User already registered" },
    });
    const result = await signUp({
      email: "old@example.com",
      password: "password12",
      confirmPassword: "password12",
      agreeToTerms: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("user_already_exists");
    expect(result.message).not.toMatch(/old@example.com|supabase/i);
  });

  it("maps weak passwords", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "weak_password", message: "Password is known to be weak" },
    });
    const result = await signUp({
      email: "new@example.com",
      password: "password12",
      confirmPassword: "password12",
      agreeToTerms: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("invalid_password");
  });

  it("maps rate limits", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "over_request_rate_limit", message: "email rate limit exceeded" },
    });
    const result = await signUp({
      email: "new@example.com",
      password: "password12",
      confirmPassword: "password12",
      agreeToTerms: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("rate_limited");
  });

  it("sanitizes unknown provider errors", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "AuthApiError request-id xyz stack at GoTrue", status: 418 },
    });
    const result = await signUp({
      email: "new@example.com",
      password: "password12",
      confirmPassword: "password12",
      agreeToTerms: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.message).toBe("Something went wrong. Try again.");
    expect(result.message).not.toMatch(/xyz|GoTrue|stack/i);
  });

  it("sign-in rejects invalid credentials without leaking existence", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "invalid_login_credentials", message: "Invalid login credentials" },
    });
    const result = await signIn({ email: "a@example.com", password: "nope" });
    expect(result).toEqual({
      ok: false,
      code: "invalid_credentials",
      message: "Invalid email or password.",
    });
  });

  it("sign-in succeeds for a verified session", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "t" }, user: { id: "u1" } },
      error: null,
    });
    await expect(signIn({ email: "a@example.com", password: "password12" })).resolves.toEqual({
      ok: true,
    });
  });

  it("sign-in of an unverified account maps to confirmation required", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "email_not_confirmed", message: "Email not confirmed" },
    });
    const result = await signIn({ email: "a@example.com", password: "password12" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("email_confirmation_required");
  });
});
