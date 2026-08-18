import { describe, expect, it } from "vitest";
import {
  DEFAULT_POST_AUTH_PATH,
  isSafeInternalPath,
  safeInternalPath,
} from "./redirect";

describe("isSafeInternalPath", () => {
  it("accepts in-app relative paths", () => {
    expect(isSafeInternalPath("/app")).toBe(true);
    expect(isSafeInternalPath("/app?tab=1")).toBe(true);
    expect(isSafeInternalPath("/sign-in")).toBe(true);
  });

  it("rejects open redirects", () => {
    expect(isSafeInternalPath("https://evil.example")).toBe(false);
    expect(isSafeInternalPath("//evil.example")).toBe(false);
    expect(isSafeInternalPath("/\\evil.example")).toBe(false);
    expect(isSafeInternalPath("https://example.com")).toBe(false);
    expect(isSafeInternalPath("/app/@evil")).toBe(true);
    expect(isSafeInternalPath("app")).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath("")).toBe(false);
  });
});

describe("safeInternalPath", () => {
  it("falls back to /app", () => {
    expect(safeInternalPath("https://evil.example")).toBe(
      DEFAULT_POST_AUTH_PATH
    );
    expect(safeInternalPath("/sign-up")).toBe("/sign-up");
  });
});
