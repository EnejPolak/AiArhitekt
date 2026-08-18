import type { ProductReferenceMimeType } from "./constants";

export type ImageDimensions = { width: number; height: number };

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) return null;
  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  if (width < 1 || height < 1) return null;
  return { width, height };
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const size = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (size < 2) return null;
    const sof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (sof && offset + 8 < bytes.length) {
      const height = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      const width = ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0);
      if (width < 1 || height < 1) return null;
      return { width, height };
    }
    offset += 2 + size;
  }
  return null;
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (chunk === "VP8X") {
    const width =
      1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16));
    const height =
      1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16));
    if (width < 1 || height < 1) return null;
    return { width, height };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    const width = ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff;
    const height = ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff;
    if (width < 1 || height < 1) return null;
    return { width, height };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const bits =
      (bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8) | ((bytes[23] ?? 0) << 16) | ((bytes[24] ?? 0) << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    if (width < 1 || height < 1) return null;
    return { width, height };
  }
  return null;
}

export function readImageDimensions(
  bytes: Uint8Array,
  mime: ProductReferenceMimeType
): ImageDimensions | null {
  try {
    if (mime === "image/png") return readPngDimensions(bytes);
    if (mime === "image/jpeg") return readJpegDimensions(bytes);
    return readWebpDimensions(bytes);
  } catch {
    return null;
  }
}
