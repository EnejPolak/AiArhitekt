import { describe, expect, it } from "vitest";
import {
  domainAllowed,
  normalizeProductDiscoveryAllowlist,
  normalizeUrlForEvidenceMatch,
  urlsEvidenceMatch,
} from "./domains";

describe("productDiscovery domains", () => {
  it("normalizes https://www.merkur.si/foo to merkur.si", () => {
    expect(normalizeProductDiscoveryAllowlist(["https://www.merkur.si/foo"])).toEqual(["merkur.si"]);
  });

  it("deduplicates and rejects malformed domains", () => {
    expect(
      normalizeProductDiscoveryAllowlist([
        "merkur.si",
        "MERKUR.SI",
        "https://www.merkur.si/",
        "not-a-domain",
        "localhost",
      ])
    ).toEqual(["merkur.si"]);
  });

  it("domainAllowed accepts only allowlisted registrable domains", () => {
    const allowlist = ["merkur.si", "bauhaus.si"];
    expect(domainAllowed("https://www.merkur.si/p/foo", allowlist)).toBe(true);
    expect(domainAllowed("https://evil.example/p/foo", allowlist)).toBe(false);
  });

  it("urlsEvidenceMatch treats trailing slashes and paths as equivalent evidence", () => {
    const productUrl = "https://merkur.si/p/laminat/";
    const sourceUrl = "https://www.merkur.si/p/laminat";
    expect(urlsEvidenceMatch(productUrl, sourceUrl)).toBe(true);
    expect(normalizeUrlForEvidenceMatch(productUrl)).toBe(
      normalizeUrlForEvidenceMatch(sourceUrl)
    );
  });
});
