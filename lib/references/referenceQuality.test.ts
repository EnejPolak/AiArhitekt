import { describe, expect, it } from "vitest";
import type { ProductImageEvidence } from "./imageEvidence";
import {
  candidateCouldBeatCurrent,
  parseDeclaredSizeFromUrl,
  rankExactProductEvidence,
  referenceQualityFromDimensions,
} from "./referenceQuality";

function evidence(
  url: string,
  source: ProductImageEvidence["source"],
  confidence: ProductImageEvidence["confidence"] = "medium"
): ProductImageEvidence {
  return {
    url,
    source,
    sourcePageUrl: "https://www.shop.example/p/sofa",
    merchantDomain: "shop.example",
    confidence,
    exactProductAssociation: true,
  };
}

describe("reference quality ranking", () => {
  it("classifies HIGH / MEDIUM / LOW from longest edge", () => {
    expect(referenceQualityFromDimensions(800, 600)).toBe("high");
    expect(referenceQualityFromDimensions(400, 300)).toBe("medium");
    expect(referenceQualityFromDimensions(265, 265)).toBe("low");
  });

  it("parses generic cache size tokens from URLs", () => {
    expect(parseDeclaredSizeFromUrl("https://cdn.shop.example/cache/265x265/sofa.jpg")).toEqual({
      width: 265,
      height: 265,
    });
    expect(parseDeclaredSizeFromUrl("https://cdn.shop.example/sofa.jpg?w=1200&h=900")).toEqual({
      width: 1200,
      height: 900,
    });
  });

  it("prefers a larger exact-product gallery image over a JSON-LD thumbnail", () => {
    const ranked = rankExactProductEvidence([
      evidence("https://cdn.shop.example/cache/265x265/sofa.jpg", "json_ld_product", "high"),
      evidence("https://cdn.shop.example/cache/1200x1200/sofa.jpg", "merchant_gallery", "medium"),
    ]);
    expect(ranked[0]?.url).toContain("1200x1200");
  });

  it("ranks a declared 415px page image above an undeclared thumbnail URL", () => {
    const ranked = rankExactProductEvidence(
      [
        evidence("https://cdn.shop.example/pr00Q/image.jpeg", "merchant_gallery"),
        evidence("https://cdn.shop.example/prZZB/image.jpeg", "merchant_gallery"),
      ],
      new Map([["https://cdn.shop.example/prZZB/image.jpeg", { width: 415, height: 415 }]])
    );
    expect(ranked[0]?.url).toContain("prZZB");
  });

  it("still ranks an undeclared original above an explicit 265px thumbnail", () => {
    const ranked = rankExactProductEvidence([
      evidence("https://cdn.shop.example/cache/265x265/sofa.jpg", "json_ld_product", "high"),
      evidence("https://cdn.shop.example/upload/catalog/sofa.jpg", "merchant_gallery"),
    ]);
    expect(ranked[0]?.url).toContain("/upload/catalog/sofa.jpg");
  });

  it("never prefers a larger search-evidence image over a weaker exact page association", () => {
    const ranked = rankExactProductEvidence([
      evidence("https://cdn.shop.example/cache/265x265/sofa.jpg", "json_ld_product", "high"),
      evidence("https://cdn.shop.example/huge-2000.jpg", "search_evidence", "low"),
    ]);
    expect(ranked[0]?.source).toBe("json_ld_product");
    expect(ranked[0]?.url).toContain("265x265");
  });

  it("does not fetch a declared thumbnail after a HIGH original", () => {
    expect(
      candidateCouldBeatCurrent(
        { width: 265, height: 265 },
        { width: 950, height: 700 }
      )
    ).toBe(false);
    expect(
      candidateCouldBeatCurrent(
        { width: 1200, height: 1200 },
        { width: 265, height: 265 }
      )
    ).toBe(true);
  });
});
