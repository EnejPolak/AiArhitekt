import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_PRODUCT_REFERENCE_BYTES } from "./constants";
import { fetchValidatedProductImage } from "./fetchImage";
import { ReferenceError } from "./errors";

const JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0x0f, 0x00, 0x00,
  0x01, 0x01, 0x01, 0x00, 0x1b, 0xb6, 0xee, 0x56, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
  0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe,
  0x07, 0x00,
]);

const PUBLIC_LOOKUP = async () => ({ address: "203.0.113.10", family: 4 });

function imageResponse(bytes: Uint8Array, contentType: string, status = 200) {
  return new Response(bytes, {
    status,
    headers: { "content-type": contentType, "content-length": String(bytes.byteLength) },
  });
}

describe("validated product image fetch", () => {
  it("accepts jpeg, png, and webp with matching magic bytes", async () => {
    const jpeg = await fetchValidatedProductImage("https://cdn.example/sofa.jpg", {
      lookup: PUBLIC_LOOKUP,
      fetch: async () => imageResponse(JPEG, "image/jpeg"),
    });
    expect(jpeg.mime).toBe("image/jpeg");
    expect(jpeg.sizeBytes).toBe(JPEG.byteLength);
    expect(jpeg.sourceUrl).toBe("https://cdn.example/sofa.jpg");
    expect(createHash("sha256").update(JPEG).digest("hex")).toHaveLength(64);

    const png = await fetchValidatedProductImage("https://cdn.example/sofa.png", {
      lookup: PUBLIC_LOOKUP,
      fetch: async () => imageResponse(PNG, "image/png"),
    });
    expect(png.mime).toBe("image/png");
    expect(png.dimensions).toEqual({ width: 1, height: 1 });

    const webp = await fetchValidatedProductImage("https://cdn.example/sofa.webp", {
      lookup: PUBLIC_LOOKUP,
      fetch: async () => imageResponse(WEBP, "image/webp"),
    });
    expect(webp.mime).toBe("image/webp");
  });

  it("rejects HTML, mismatched magic, oversize, and redirects to a private host", async () => {
    await expect(
      fetchValidatedProductImage("https://cdn.example/sofa.jpg", {
        lookup: PUBLIC_LOOKUP,
        fetch: async () => imageResponse(JPEG, "text/html"),
      })
    ).rejects.toBeInstanceOf(ReferenceError);

    await expect(
      fetchValidatedProductImage("https://cdn.example/sofa.jpg", {
        lookup: PUBLIC_LOOKUP,
        fetch: async () =>
          imageResponse(Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), "image/jpeg"),
      })
    ).rejects.toBeInstanceOf(ReferenceError);

    await expect(
      fetchValidatedProductImage("https://cdn.example/sofa.jpg", {
        lookup: PUBLIC_LOOKUP,
        fetch: async () =>
          new Response(JPEG, {
            status: 200,
            headers: {
              "content-type": "image/jpeg",
              "content-length": String(MAX_PRODUCT_REFERENCE_BYTES + 1),
            },
          }),
      })
    ).rejects.toBeInstanceOf(ReferenceError);

    await expect(
      fetchValidatedProductImage("https://cdn.example/sofa.jpg", {
        lookup: PUBLIC_LOOKUP,
        fetch: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/secret.jpg" },
          }),
      })
    ).rejects.toMatchObject({ code: "unsafe_url" });
  });
});
