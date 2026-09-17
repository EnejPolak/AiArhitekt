import { afterEach, describe, expect, it, vi } from "vitest";
import { mapAuthError } from "./errors";

describe("mapAuthError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps invalid credentials without leaking existence", () => {
    const mapped = mapAuthError({
      code: "invalid_login_credentials",
      message: "Invalid login credentials",
    });
    expect(mapped.code).toBe("invalid_credentials");
    expect(mapped.message).toBe("Invalid email or password.");
  });

  it("maps email confirmation", () => {
    expect(mapAuthError({ code: "email_not_confirmed" }).code).toBe(
      "email_confirmation_required"
    );
  });

  it("maps weak passwords", () => {
    expect(mapAuthError({ code: "weak_password" }).code).toBe(
      "invalid_password"
    );
  });

  it("maps expired callback / PKCE errors", () => {
    expect(mapAuthError({ code: "otp_expired" }).code).toBe("callback_invalid");
    expect(
      mapAuthError({ message: "invalid flow state, no valid flow state found" })
        .code
    ).toBe("callback_invalid");
  });

  it("maps already-registered users without dumping the address", () => {
    const mapped = mapAuthError({
      code: "email_exists",
      message: "User already registered",
    });
    expect(mapped.code).toBe("user_already_exists");
    expect(mapped.message).toBe("Could not create this account. Try signing in instead.");
    expect(mapped.message).not.toMatch(/@/);
  });

  it("maps rate limits separately from network failures", () => {
    expect(mapAuthError({ code: "over_request_rate_limit" }).code).toBe(
      "rate_limited"
    );
    expect(mapAuthError({ status: 429, message: "Too Many Requests" }).code).toBe(
      "rate_limited"
    );
    expect(mapAuthError({ code: "over_email_send_rate_limit" }).message).toMatch(
      /few minutes/i
    );
  });

  it("maps signup disabled and captcha failures", () => {
    expect(mapAuthError({ message: "Signups not allowed for this instance" }).code).toBe(
      "signup_disabled"
    );
    expect(mapAuthError({ code: "captcha_failed" }).code).toBe("captcha_failed");
  });

  it("maps confirmation-email / SMTP failures as provider unavailable, not generic", () => {
    const mapped = mapAuthError({
      message: "Error sending confirmation email",
      status: 500,
    });
    expect(mapped.code).toBe("provider_unavailable");
    expect(mapped.message).not.toMatch(/smtp|confirmation email|supabase/i);
  });

  it("maps timeouts and 5xx as provider unavailable", () => {
    expect(mapAuthError({ message: "Request timed out", status: 504 }).code).toBe(
      "provider_unavailable"
    );
    expect(mapAuthError({ status: 500, message: "Database error saving new user" }).code).toBe(
      "provider_unavailable"
    );
  });

  it("maps invalid redirect allowlist errors as config without leaking the URL", () => {
    const mapped = mapAuthError({
      message: "Redirect URL 'http://127.0.0.1:3000/auth/callback' is not allowed",
    });
    expect(mapped.code).toBe("config");
    expect(mapped.message).not.toMatch(/127\.0\.0\.1|callback/i);
  });

  it("does not dump raw provider messages", () => {
    const mapped = mapAuthError({
      message: "AuthApiError: request id abc-123 stack boom",
    });
    expect(mapped.message).not.toMatch(/abc-123|stack/i);
    expect(mapped.code).toBe("generic");
  });
});
