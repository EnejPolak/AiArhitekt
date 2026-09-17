import { PNG } from "pngjs";

export function createSolidPng(
  width: number,
  height: number,
  rgb: [number, number, number] = [180, 160, 140]
): Uint8Array {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = rgb[0];
      png.data[idx + 1] = rgb[1];
      png.data[idx + 2] = rgb[2];
      png.data[idx + 3] = 255;
    }
  }
  return Uint8Array.from(PNG.sync.write(png));
}

export const USABLE_PRODUCT_PNG = createSolidPng(128, 128);
export const TINY_PRODUCT_PNG = createSolidPng(1, 1);
