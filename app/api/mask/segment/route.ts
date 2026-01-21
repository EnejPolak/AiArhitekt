import { NextResponse } from "next/server";
import Replicate from "replicate";
import { PNG } from "pngjs";
import zlib from "zlib";

type SegmentRequest = {
  image: string; // data URL
  pointX: number; // pixel coordinates in original image space
  pointY: number; // pixel coordinates in original image space
};

type SamMaskDetail = {
  segmentation?: string; // base64+zlib encoded boolean array
  stability_score?: number;
  iou?: number;
  area?: number;
};

type SamOutput = {
  shapes?: [number, number, number] | [number, number];
  mask_details?: SamMaskDetail[];
};

function toPngDataUrlFromBoolMask(mask: Uint8Array, width: number, height: number): string {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x);
      const v = mask[idx] ? 255 : 0;
      const p = idx * 4;
      png.data[p + 0] = v;
      png.data[p + 1] = v;
      png.data[p + 2] = v;
      png.data[p + 3] = 255;
    }
  }
  const buf = PNG.sync.write(png);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function decodeSamSegmentationToBoolMask(segmentation: string, width: number, height: number): Uint8Array {
  // SAM model returns base64(zlib(bool_array_bytes))
  const compressed = Buffer.from(segmentation, "base64");
  const decompressed = zlib.inflateSync(compressed);

  // bool array bytes -> convert to 0/1 mask
  // Some implementations store as uint8 0/1, some as bool bytes.
  const arr = new Uint8Array(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);
  const expected = width * height;
  const out = new Uint8Array(expected);
  for (let i = 0; i < expected && i < arr.length; i++) {
    out[i] = arr[i] ? 1 : 0;
  }
  return out;
}

export async function POST(req: Request) {
  try {
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: "Replicate API token not configured" }, { status: 500 });
    }

    const body = (await req.json().catch(() => null)) as SegmentRequest | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { image, pointX, pointY } = body;
    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "image is required (data URL)" }, { status: 400 });
    }
    if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) {
      return NextResponse.json({ error: "pointX and pointY are required numbers" }, { status: 400 });
    }

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

    // Segment Anything Model (SAM) for click-to-select masks
    const SAM_MODEL =
      "ayumuakagi/segment_anything_model:e0d5c56062fb1dc6ed738e09997b421442e0e86983052de6861b82b0f05c6876" as const;

    const input: any = {
      image,
      point_coords: [[Math.round(pointX), Math.round(pointY)]],
      point_labels: [1],
    };

    const output = (await replicate.run(SAM_MODEL as any, { input })) as SamOutput;

    const maskDetails = output?.mask_details || [];
    if (!Array.isArray(maskDetails) || maskDetails.length === 0) {
      return NextResponse.json({ error: "No mask returned from segmentation model" }, { status: 500 });
    }

    const shapes = output.shapes;
    const height = Array.isArray(shapes) ? Number(shapes[0]) : NaN;
    const width = Array.isArray(shapes) ? Number(shapes[1]) : NaN;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return NextResponse.json({ error: "Invalid mask shape returned from model" }, { status: 500 });
    }

    // Pick best mask: highest stability_score, fallback to iou
    const best = [...maskDetails].sort((a, b) => {
      const sa = Number(a.stability_score ?? -1);
      const sb = Number(b.stability_score ?? -1);
      if (sb !== sa) return sb - sa;
      const ia = Number(a.iou ?? -1);
      const ib = Number(b.iou ?? -1);
      return ib - ia;
    })[0];

    if (!best?.segmentation) {
      return NextResponse.json({ error: "Mask missing segmentation payload" }, { status: 500 });
    }

    const boolMask = decodeSamSegmentationToBoolMask(best.segmentation, width, height);
    const maskDataUrl = toPngDataUrlFromBoolMask(boolMask, width, height);

    return NextResponse.json({
      maskDataUrl,
      meta: {
        width,
        height,
        stability_score: best.stability_score ?? null,
        iou: best.iou ?? null,
        area: best.area ?? null,
      },
    });
  } catch (error: any) {
    console.error("[MASK-SEGMENT] Error:", error);
    return NextResponse.json({ error: error?.message || "Mask segmentation failed" }, { status: 500 });
  }
}

