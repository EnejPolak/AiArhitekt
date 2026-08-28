import { describe, expect, it } from "vitest";
import { containsRootToken, containsToken, foldDiacritics, normalizeMatchText } from "@/lib/text/diacritics";

describe("diacritic normalization", () => {
  it("folds Slovenian letters for matching only", () => {
    expect(foldDiacritics("računalniška")).toBe("racunalniska");
    expect(foldDiacritics("črna")).toBe("crna");
    expect(normalizeMatchText("Računalniška miza")).toBe("racunalniska miza");
    expect(normalizeMatchText("racunalniska miza")).toBe("racunalniska miza");
  });
});

describe("matte token boundaries", () => {
  it("does not match mat inside material", () => {
    const haystack = normalizeMatchText("leseni material rdeca crna");
    expect(containsToken(haystack, "mat")).toBe(false);
    expect(containsToken(normalizeMatchText("crna mat 1 l"), "mat")).toBe(true);
  });

  it("matches inflected marble roots without substring accidents", () => {
    const haystack = normalizeMatchText("Marmorne talne ploščice");
    expect(containsRootToken(haystack, "marmor")).toBe(true);
    expect(containsRootToken(haystack, "mat")).toBe(false);
  });
});
