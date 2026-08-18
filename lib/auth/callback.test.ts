import { describe, expect, it } from "vitest";
import { parseAuthCallbackSearch } from "./callback";

describe("parseAuthCallbackSearch", () => {
  it("parses a PKCE code and sanitizes next", () => {
    const parsed = parseAuthCallbackSearch(
      new URLSearchParams("code=abc123&next=https://evil.example")
    );
    expect(parsed).toEqual({ kind: "code", code: "abc123", next: "/app" });
  });

  it("parses token_hash confirmation links", () => {
    const parsed = parseAuthCallbackSearch(
      new URLSearchParams("token_hash=tok&type=signup&next=/app")
    );
    expect(parsed).toEqual({
      kind: "token_hash",
      tokenHash: "tok",
      type: "signup",
      next: "/app",
    });
  });

  it("rejects malformed callback state", () => {
    expect(parseAuthCallbackSearch(new URLSearchParams("")).kind).toBe(
      "invalid"
    );
    expect(
      parseAuthCallbackSearch(
        new URLSearchParams("token_hash=tok&type=not-a-type")
      ).kind
    ).toBe("invalid");
    expect(parseAuthCallbackSearch(new URLSearchParams("code=")).kind).toBe(
      "invalid"
    );
  });
});
