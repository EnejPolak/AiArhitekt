import { describe, expect, it } from "vitest";
import { mapAuthError } from "./errors";

describe("mapAuthError", () => {
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

  it("does not dump raw provider messages", () => {
    const mapped = mapAuthError({
      message: "AuthApiError: request id abc-123 stack boom",
    });
    expect(mapped.message).not.toMatch(/abc-123|stack/i);
  });
});
