import { describe, it, expect } from "vitest";
import { normalizeDomainToRoot, validateAndNormalizeAllowlist } from "./domains";

describe("SERP allowlist domains", () => {
  it("normalizes URLs to registrable root", () => {
    expect(normalizeDomainToRoot("https://www.merkur.si/p/foo")).toBe("merkur.si");
    expect(normalizeDomainToRoot("JYSK.SI")).toBe("jysk.si");
  });

  it("keeps unique sane hostnames and drops junk", () => {
    const out = validateAndNormalizeAllowlist([
      "https://www.merkur.si/path",
      "merkur.si",
      "localhost",
      "not a domain",
      "127.0.0.1",
      "jysk.si",
    ]);
    expect(out).toEqual(["merkur.si", "jysk.si"]);
  });
});
