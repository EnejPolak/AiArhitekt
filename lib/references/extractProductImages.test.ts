import { describe, expect, it } from "vitest";
import {
  extractProductImageCandidates,
  isCandidateProductImageUrl,
  selectPrimaryProductImage,
} from "./extractProductImages";

describe("extractProductImageCandidates", () => {
  it("prefers JSON-LD Product.image over OpenGraph", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="https://cdn.example/og.jpg" />
          <script type="application/ld+json">
            {"@type":"Product","name":"Sofa","image":["https://cdn.example/sofa.jpg","https://cdn.example/sofa-side.jpg"]}
          </script>
        </head>
      </html>
    `;
    const candidates = extractProductImageCandidates(html, "https://shop.example/p/sofa");
    expect(candidates[0]).toMatchObject({ url: "https://cdn.example/sofa.jpg", source: "jsonld" });
    expect(candidates.map((item) => item.source)).toContain("og");
    expect(selectPrimaryProductImage(candidates)?.url).toBe("https://cdn.example/sofa.jpg");
  });

  it("falls back to og:image when JSON-LD has no image", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="/images/chair.jpg" />
        </head>
      </html>
    `;
    const candidates = extractProductImageCandidates(html, "https://shop.example/p/chair");
    expect(candidates[0]).toEqual({
      url: "https://shop.example/images/chair.jpg",
      source: "og",
    });
  });

  it("falls back to twitter then a gallery product image", () => {
    const html = `
      <html>
        <head>
          <meta name="twitter:image" content="https://cdn.example/twitter.jpg" />
        </head>
        <body>
          <img src="https://cdn.example/gallery.jpg" width="800" height="600" />
          <img src="https://cdn.example/logo.png" width="32" height="32" />
        </body>
      </html>
    `;
    const candidates = extractProductImageCandidates(html, "https://shop.example/p/1");
    expect(candidates.map((item) => item.source)).toEqual(["twitter", "gallery"]);
    expect(candidates.find((item) => item.url.includes("logo"))).toBeUndefined();
  });

  it("rejects logos, icons, svg, javascript URLs, and unresolved template leftovers", () => {
    expect(isCandidateProductImageUrl("https://cdn.example/logo.png")).toBe(false);
    expect(isCandidateProductImageUrl("https://cdn.example/favicon.ico")).toBe(false);
    expect(isCandidateProductImageUrl("https://cdn.example/icon.svg")).toBe(false);
    expect(isCandidateProductImageUrl("javascript:alert(1)")).toBe(false);
    expect(isCandidateProductImageUrl("https://shop.example/p/getUrl(searchResult.thumbnail)")).toBe(false);
    expect(isCandidateProductImageUrl("https://cdn.example/sofa.jpg")).toBe(true);
  });

  it("ignores Vue/Alpine bound :src templates and keeps the real itemprop image", () => {
    const html = `
      <html>
        <body>
          <img itemprop="image" :src="getUrl(searchResult.thumbnail)" alt="template" />
          <img itemprop="image" src="https://cdn.retailer.example/product.jpeg" width="415" height="415" />
        </body>
      </html>
    `;
    const candidates = extractProductImageCandidates(html, "https://www.retailer.example/p/oak-floor");
    expect(candidates.some((item) => item.url.includes("getUrl"))).toBe(false);
    expect(candidates[0]).toEqual({
      url: "https://cdn.retailer.example/product.jpeg",
      source: "schema",
    });
  });

  it("reads gallery srcset URLs when src is missing", () => {
    const html = `
      <html>
        <body>
          <picture>
            <source srcset="https://cdn.example/floor-1024.jpg 1024w, https://cdn.example/floor-800.jpg 800w" />
            <img alt="floor" width="800" height="800" />
          </picture>
        </body>
      </html>
    `;
    const candidates = extractProductImageCandidates(html, "https://shop.example/p/floor");
    expect(candidates.map((item) => item.url)).toEqual([
      "https://cdn.example/floor-1024.jpg",
      "https://cdn.example/floor-800.jpg",
    ]);
    expect(candidates[0]?.source).toBe("gallery");
  });
});
