/**
 * Unit tests: domain normalization + reject list
 */

import { normalizeDomainToRoot, isRejectedDomain } from "./domainUtils";

describe("domainUtils", () => {
  describe("normalizeDomainToRoot", () => {
    it("strips protocol and www", () => {
      expect(normalizeDomainToRoot("https://www.merkur.si/path")).toBe("merkur.si");
      expect(normalizeDomainToRoot("http://www.jysk.si")).toBe("jysk.si");
    });
    it("strips path, query, fragment", () => {
      expect(normalizeDomainToRoot("https://bauhaus.si/trgovina?q=1#anchor")).toBe("bauhaus.si");
    });
    it("returns lowercase", () => {
      expect(normalizeDomainToRoot("https://Merkur.SI")).toBe("merkur.si");
    });
    it("handles domain-only input", () => {
      expect(normalizeDomainToRoot("xxxlesnina.si")).toBe("xxxlesnina.si");
    });
    it("returns empty for empty input", () => {
      expect(normalizeDomainToRoot("")).toBe("");
      expect(normalizeDomainToRoot("   ")).toBe("");
    });
  });

  describe("isRejectedDomain", () => {
    it("rejects social domains", () => {
      expect(isRejectedDomain("facebook.com")).toBe(true);
      expect(isRejectedDomain("https://www.facebook.com/page")).toBe(true);
      expect(isRejectedDomain("instagram.com")).toBe(true);
      expect(isRejectedDomain("linkedin.com")).toBe(true);
    });
    it("rejects google/maps/youtube", () => {
      expect(isRejectedDomain("google.com")).toBe(true);
      expect(isRejectedDomain("maps.google.com")).toBe(true);
      expect(isRejectedDomain("youtu.be")).toBe(true);
      expect(isRejectedDomain("youtube.com")).toBe(true);
    });
    it("rejects directory/aggregator domains", () => {
      expect(isRejectedDomain("bizi.si")).toBe(true);
      expect(isRejectedDomain("najdi.si")).toBe(true);
      expect(isRejectedDomain("bolha.com")).toBe(true);
      expect(isRejectedDomain("avto.net")).toBe(true);
    });
    it("allows retail/store domains", () => {
      expect(isRejectedDomain("merkur.si")).toBe(false);
      expect(isRejectedDomain("jysk.si")).toBe(false);
      expect(isRejectedDomain("xxxlesnina.si")).toBe(false);
      expect(isRejectedDomain("bauhaus.si")).toBe(false);
    });
    it("rejects empty or invalid", () => {
      expect(isRejectedDomain("")).toBe(true);
    });
  });
});
