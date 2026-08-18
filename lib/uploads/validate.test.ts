import { describe, expect, it } from "vitest";
import { MAX_ROOM_PHOTO_BYTES } from "./constants";
import { detectImageMime } from "./signature";
import { validateRoomPhotoBytes } from "./validate";
import { prepareRoomPhotoSchema } from "./schema";

const PROJECT_ID = "2cc85a10-1111-4111-8111-abcdef000001";
const UPLOAD_ID = "90e41b20-2222-4222-8222-abcdef000002";

const JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56,
  0x50, 0x38, 0x20, 0x0e, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a,
  0x01, 0x00, 0x01, 0x00,
]);

describe("image signatures", () => {
  it("accepts JPEG, PNG, and WebP magic bytes", () => {
    expect(detectImageMime(JPEG)).toBe("image/jpeg");
    expect(detectImageMime(PNG)).toBe("image/png");
    expect(detectImageMime(WEBP)).toBe("image/webp");
  });

  it("rejects spoofed jpeg bytes", () => {
    expect(detectImageMime(new TextEncoder().encode("not an image"))).toBeNull();
  });
});

describe("validateRoomPhotoBytes", () => {
  it("accepts matching jpeg path", () => {
    expect(
      validateRoomPhotoBytes(JPEG, `projects/${PROJECT_ID}/uploads/${UPLOAD_ID}.jpg`)
    ).toBe("image/jpeg");
  });

  it("rejects empty files", () => {
    expect(() =>
      validateRoomPhotoBytes(new Uint8Array(), `projects/${PROJECT_ID}/uploads/${UPLOAD_ID}.jpg`)
    ).toThrow("empty");
  });

  it("rejects oversize files", () => {
    const huge = new Uint8Array(MAX_ROOM_PHOTO_BYTES + 1);
    huge.set(JPEG, 0);
    expect(() =>
      validateRoomPhotoBytes(huge, `projects/${PROJECT_ID}/uploads/${UPLOAD_ID}.jpg`)
    ).toThrow("oversize");
  });

  it("rejects a fake .jpg", () => {
    expect(() =>
      validateRoomPhotoBytes(
        new TextEncoder().encode("hello"),
        `projects/${PROJECT_ID}/uploads/${UPLOAD_ID}.jpg`
      )
    ).toThrow("invalid");
  });
});

describe("prepareRoomPhotoSchema", () => {
  it("rejects wrong MIME and empty size", () => {
    expect(
      prepareRoomPhotoSchema.safeParse({
        projectId: PROJECT_ID,
        originalFilename: "x.svg",
        mimeType: "image/svg+xml",
        sizeBytes: 12,
      }).success
    ).toBe(false);
    expect(
      prepareRoomPhotoSchema.safeParse({
        projectId: PROJECT_ID,
        originalFilename: "x.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 0,
      }).success
    ).toBe(false);
  });
});
