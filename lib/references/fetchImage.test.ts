import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_PRODUCT_REFERENCE_BYTES } from "./constants";
import { fetchValidatedProductImage } from "./fetchImage";
import { ReferenceError } from "./errors";
import { TINY_PRODUCT_PNG, USABLE_PRODUCT_PNG } from "./imageFixtures";

const JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ...Array.from({ length: 400 }, () => 0),
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
      fetch: async () => imageResponse(USABLE_PRODUCT_PNG, "image/png"),
    });
    expect(png.mime).toBe("image/png");
    expect(png.dimensions).toEqual({ width: 128, height: 128 });
  });

  it("rejects HTML, mismatched magic, oversize, tiny logos, and redirects to a private host", async () => {
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
      fetchValidatedProductImage("https://cdn.example/icon.png", {
        lookup: PUBLIC_LOOKUP,
        fetch: async () => imageResponse(TINY_PRODUCT_PNG, "image/png"),
      })
    ).rejects.toMatchObject({ code: "invalid_image" });

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

    await expect(
      fetchValidatedProductImage("http://127.0.0.1/secret.jpg", {
        lookup: PUBLIC_LOOKUP,
        fetch: async () => imageResponse(USABLE_PRODUCT_PNG, "image/png"),
      })
    ).rejects.toMatchObject({ code: "unsafe_url" });
  });
});
