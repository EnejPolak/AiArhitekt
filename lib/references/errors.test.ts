import { describe, expect, it } from "vitest";
import { ReferenceError, referenceErrorMessage } from "./errors";

describe("reference errors", () => {
  it("does not leak fetch or storage internals", () => {
    expect(referenceErrorMessage("unsafe_url")).not.toMatch(/ssrf|169\.254|localhost/i);
    expect(referenceErrorMessage("invalid_image")).toMatch(/jpeg|png|webp/i);
    const err = new ReferenceError("failed", referenceErrorMessage("failed"));
    expect(err.code).toBe("failed");
  });
});
