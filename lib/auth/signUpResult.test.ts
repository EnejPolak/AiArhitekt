import { describe, expect, it } from "vitest";
import { interpretSignUpData } from "./signUpResult";

describe("interpretSignUpData", () => {
  it("treats an immediate session as signed in", () => {
    expect(interpretSignUpData({ session: { access_token: "x" }, user: { identities: [{}] } })).toEqual({
      ok: true,
    });
  });

  it("treats missing session as email confirmation, not failure", () => {
    expect(interpretSignUpData({ session: null, user: { identities: [{}] } })).toEqual({
      ok: true,
      needsEmailConfirmation: true,
    });
  });

  it("treats existing-email obfuscation (empty identities, no session) as confirmation", () => {
    expect(interpretSignUpData({ session: null, user: { identities: [] } })).toEqual({
      ok: true,
      needsEmailConfirmation: true,
    });
  });
});
