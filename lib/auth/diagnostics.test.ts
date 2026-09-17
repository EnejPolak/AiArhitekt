import { describe, expect, it } from "vitest";
import {
  buildAuthDiagnostic,
  sanitizeAuthDiagnosticMessage,
} from "./diagnostics";

describe("auth diagnostics", () => {
  it("redacts email, JWT, and bearer tokens", () => {
    const sanitized = sanitizeAuthDiagnosticMessage(
      "fail for jane@example.com bearer secret.token eyJhbGciOiJIUzI1NiJ9.aaa.bbb"
    );
    expect(sanitized).toContain("[email]");
    expect(sanitized).toContain("[token]");
    expect(sanitized).not.toMatch(/jane@example.com/i);
    expect(sanitized).not.toMatch(/eyJhbGci/i);
    expect(sanitized).not.toMatch(/secret\.token/i);
  });

  it("builds a concise structured diagnostic", () => {
    const diagnostic = buildAuthDiagnostic("auth.sign_up", {
      code: "unexpected_failure",
      status: 500,
      message: "Error sending confirmation email to a@b.com",
    });
    expect(diagnostic).toEqual({
      stage: "auth.sign_up",
      code: "unexpected_failure",
      status: 500,
      message: "Error sending confirmation email to [email]",
      errorPresent: true,
    });
  });
});
