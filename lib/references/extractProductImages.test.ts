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
      declaredWidth: null,
      declaredHeight: null,
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
      declaredWidth: 415,
      declaredHeight: 415,
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
    expect(candidates.map((item) => item.url)).toEqual(["https://cdn.example/floor-1024.jpg"]);
    expect(candidates[0]).toMatchObject({
      source: "gallery",
      declaredWidth: 1024,
    });
  });

  it("collects JSON-LD thumbnail and a higher-res gallery srcset variant", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {"@type":"Product","name":"Sofa","image":"https://cdn.example/cache/265x265/sofa.jpg"}
          </script>
        </head>
        <body>
          <img src="https://cdn.example/cache/265x265/sofa.jpg" width="265" height="265"
            srcset="https://cdn.example/cache/265x265/sofa.jpg 265w, https://cdn.example/cache/1200x1200/sofa.jpg 1200w" />
          <img class="related-product-card" src="https://cdn.example/related-product/other.jpg" width="400" height="400" />
        </body>
      </html>
    `;
    const candidates = extractProductImageCandidates(html, "https://shop.example/p/sofa");
    expect(candidates.some((item) => item.url.includes("1200x1200"))).toBe(true);
    expect(candidates.some((item) => item.url.includes("related-product"))).toBe(false);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("skips navigation /menu/ thumbnails so later exact gallery images stay in the extract cap", () => {
    const navIcons = Array.from(
      { length: 30 },
      (_, index) => `<img src="https://shop.example/i/menu/cat-${index}.jpg" width="64" height="64" />`
    ).join("");
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {"@type":"Product","name":"Sofa","image":"https://shop.example/upload/catalog/sofa-main.jpg"}
          </script>
        </head>
        <body>
          ${navIcons}
          <a data-fancybox="single-product" href="https://shop.example/upload/catalog/sofa-side.jpg">
            <img src="https://shop.example/upload/catalog/sofa-side.jpg" />
          </a>
        </body>
      </html>
    `;
    const candidates = extractProductImageCandidates(html, "https://shop.example/p/sofa");
    expect(candidates.some((item) => item.url.includes("/i/menu/"))).toBe(false);
    expect(candidates.map((item) => item.url)).toEqual([
      "https://shop.example/upload/catalog/sofa-main.jpg",
      "https://shop.example/upload/catalog/sofa-side.jpg",
    ]);
  });

  it("reads gallery zoom attributes, preload image links, and image hrefs", () => {
    const html = `
      <html>
        <head>
          <link rel="preload" as="image" href="https://cdn.example/product-preload.jpg" />
        </head>
        <body>
          <img data-zoom-image="https://cdn.example/product-zoom.jpg" src="https://cdn.example/product-thumb.jpg" />
          <a href="https://cdn.example/product-gallery.jpg">photo</a>
          <a href="https://shop.example/p/other-product">not an image</a>
        </body>
      </html>
    `;
    const candidates = extractProductImageCandidates(html, "https://shop.example/p/lamp");
    expect(candidates.map((item) => item.url)).toEqual([
      "https://cdn.example/product-zoom.jpg",
      "https://cdn.example/product-gallery.jpg",
      "https://cdn.example/product-preload.jpg",
    ]);
  });
});
