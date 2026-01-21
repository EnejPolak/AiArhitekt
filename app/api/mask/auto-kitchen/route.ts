import { NextResponse } from "next/server";
import Replicate from "replicate";
import { PNG } from "pngjs";

type AutoKitchenRequest = {
  imageDataUrl: string;
  imageWidth?: number;
  imageHeight?: number;
};

type Segment = {
  label: string;
  mask: string; // uri
  score?: number;
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function pngDataUrlFromMask(mask: Uint8Array, width: number, height: number): string {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const v = mask[i] ? 255 : 0;
    const p = i * 4;
    png.data[p + 0] = v;
    png.data[p + 1] = v;
    png.data[p + 2] = v;
    png.data[p + 3] = 255;
  }
  const buf = PNG.sync.write(png);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function fetchPngMask(url: string): Promise<{ mask: Uint8Array; width: number; height: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch mask: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const png = PNG.sync.read(buf);
  const { width, height } = png;
  const mask = new Uint8Array(width * height);

  // Some Replicate masks encode foreground in alpha (transparent background),
  // but sometimes alpha is 255 everywhere (uninformative). In that case, use luminance.
  let alphaMin = 255, alphaMax = 0;
  let lumMin = 255, lumMax = 0;
  for (let i = 0; i < width * height; i += 13) { // sample for speed
    const p = i * 4;
    const r = png.data[p + 0];
    const g = png.data[p + 1];
    const b = png.data[p + 2];
    const a = png.data[p + 3];
    const lum = (r + g + b) / 3;
    if (a < alphaMin) alphaMin = a;
    if (a > alphaMax) alphaMax = a;
    if (lum < lumMin) lumMin = lum;
    if (lum > lumMax) lumMax = lum;
  }

  const alphaInformative = alphaMin < 50 && alphaMax > 200; // has real transparency signal
  const lumInformative = lumMin < 50 && lumMax > 200; // has real grayscale mask signal

  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const r = png.data[p + 0];
    const g = png.data[p + 1];
    const b = png.data[p + 2];
    const a = png.data[p + 3];
    const lum = (r + g + b) / 3;

    if (alphaInformative) {
      mask[i] = a > 127 ? 1 : 0;
    } else if (lumInformative) {
      mask[i] = lum > 127 ? 1 : 0;
    } else {
      // last resort (should be rare): treat bright pixels as foreground
      mask[i] = lum > 200 ? 1 : 0;
    }
  }

  return { mask, width, height };
}

function unionInto(base: Uint8Array, add: Uint8Array) {
  const n = Math.min(base.length, add.length);
  for (let i = 0; i < n; i++) {
    base[i] = base[i] || add[i] ? 1 : 0;
  }
}

function removeSmallComponents(mask: Uint8Array, width: number, height: number, minSize: number) {
  const visited = new Uint8Array(mask.length);
  const dirs = [1, -1, width, -width];
  const inBounds = (idx: number) => idx >= 0 && idx < mask.length;

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || visited[i]) continue;
    // BFS
    const queue: number[] = [i];
    visited[i] = 1;
    const comp: number[] = [i];

    while (queue.length) {
      const cur = queue.pop()!;
      const x = cur % width;
      // neighbors (4-connected)
      // left/right need row check
      const n1 = cur - 1;
      if (x > 0 && inBounds(n1) && mask[n1] && !visited[n1]) {
        visited[n1] = 1; queue.push(n1); comp.push(n1);
      }
      const n2 = cur + 1;
      if (x < width - 1 && inBounds(n2) && mask[n2] && !visited[n2]) {
        visited[n2] = 1; queue.push(n2); comp.push(n2);
      }
      const n3 = cur - width;
      if (inBounds(n3) && mask[n3] && !visited[n3]) {
        visited[n3] = 1; queue.push(n3); comp.push(n3);
      }
      const n4 = cur + width;
      if (inBounds(n4) && mask[n4] && !visited[n4]) {
        visited[n4] = 1; queue.push(n4); comp.push(n4);
      }
    }

    if (comp.length < minSize) {
      for (const idx of comp) mask[idx] = 0;
    }
  }
}

function fillHoles(mask: Uint8Array, width: number, height: number) {
  // Flood-fill background from borders; any remaining background is a hole → fill to 1
  const bg = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) bg[i] = mask[i] ? 0 : 1;

  const visited = new Uint8Array(mask.length);
  const queue: number[] = [];
  const push = (idx: number) => { visited[idx] = 1; queue.push(idx); };

  // seed border pixels that are background
  for (let x = 0; x < width; x++) {
    const top = x;
    const bot = (height - 1) * width + x;
    if (bg[top] && !visited[top]) push(top);
    if (bg[bot] && !visited[bot]) push(bot);
  }
  for (let y = 0; y < height; y++) {
    const left = y * width;
    const right = y * width + (width - 1);
    if (bg[left] && !visited[left]) push(left);
    if (bg[right] && !visited[right]) push(right);
  }

  while (queue.length) {
    const cur = queue.pop()!;
    const x = cur % width;
    // 4-neighbors
    const n1 = cur - 1;
    if (x > 0 && bg[n1] && !visited[n1]) push(n1);
    const n2 = cur + 1;
    if (x < width - 1 && bg[n2] && !visited[n2]) push(n2);
    const n3 = cur - width;
    if (n3 >= 0 && bg[n3] && !visited[n3]) push(n3);
    const n4 = cur + width;
    if (n4 < bg.length && bg[n4] && !visited[n4]) push(n4);
  }

  // any bg pixel not visited is a hole
  for (let i = 0; i < bg.length; i++) {
    if (bg[i] && !visited[i]) mask[i] = 1;
  }
}

function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const r = Math.max(0, Math.floor(radius));
  if (r === 0) return mask;

  // Horizontal max filter with sliding window
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    let count = 0;
    // init window
    for (let x = 0; x <= r && x < width; x++) count += mask[rowStart + x] ? 1 : 0;
    for (let x = 0; x < width; x++) {
      const left = x - r - 1;
      const right = x + r;
      if (left >= 0) count -= mask[rowStart + left] ? 1 : 0;
      if (right < width) count += mask[rowStart + right] ? 1 : 0;
      tmp[rowStart + x] = count > 0 ? 1 : 0;
    }
  }

  // Vertical max filter
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y <= r && y < height; y++) count += tmp[y * width + x] ? 1 : 0;
    for (let y = 0; y < height; y++) {
      const top = y - r - 1;
      const bot = y + r;
      if (top >= 0) count -= tmp[top * width + x] ? 1 : 0;
      if (bot < height) count += tmp[bot * width + x] ? 1 : 0;
      out[y * width + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

function makeFallbackRoiMask(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const x0 = clampInt(width * 0.15, 0, width - 1);
  const x1 = clampInt(width * 0.85, 0, width);
  const y0 = clampInt(height * 0.40, 0, height - 1);
  const y1 = clampInt(height * 1.00, 0, height);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      mask[y * width + x] = 1;
    }
  }
  return mask;
}

export async function POST(req: Request) {
  const isDev = process.env.NODE_ENV !== "production";
  let parsedBody: AutoKitchenRequest | null = null;
  try {
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: "Replicate API token not configured" }, { status: 500 });
    }

    parsedBody = (await req.json().catch(() => null)) as AutoKitchenRequest | null;
    if (!parsedBody) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const { imageDataUrl, imageWidth, imageHeight } = parsedBody;
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return NextResponse.json({ error: "imageDataUrl is required" }, { status: 400 });
    }

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

    // ADE20K semantic segmentation (SegFormer)
    const MODEL =
      "bfirsh/segformer-b0-finetuned-ade-512-512:3dc0eb0749bb1476c498881e7aaaa2aa9ce9d0fb8780fd93c851d13da44b96cd" as const;

    const input: any = { image: imageDataUrl };

    const segments = (await replicate.run(MODEL as any, { input })) as Segment[];
    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error("Segmentation model returned no segments");
    }

    const targetLabels = new Set([
      "cabinet",
      "counter", // ADE20K has both counter + countertop (counter is very common)
      "countertop",
      "kitchen island",
      "stove",
      "refrigerator",
      "sink",
      "microwave",
      "dishwasher",
      "oven",
    ]);

    const used: string[] = [];
    const keywordMatchers = [
      "cabinet",
      "counter",
      "countertop",
      "island",
      "stove",
      "refrigerator",
      "fridge",
      "sink",
      "dishwasher",
      "microwave",
      "oven",
      "range",
    ];

    const chosen = segments.filter((s) => {
      const label = String(s.label || "").toLowerCase().trim();
      // exact matches
      if (targetLabels.has(label)) {
        used.push(label);
        return true;
      }
      // fuzzy matches (replicate labels sometimes include extra words)
      if (keywordMatchers.some((k) => label.includes(k))) {
        used.push(label);
        return true;
      }
      return false;
    });

    if (isDev) {
      const topLabels = segments
        .slice(0, 30)
        .map((s) => String(s.label || "").toLowerCase().trim());
      console.log("[AUTO-MASK] sample labels:", topLabels);
      console.log("[AUTO-MASK] chosen labels:", Array.from(new Set(used)));
    }

    // If nothing detected, fail-open to ROI
    if (chosen.length === 0) {
      const w = Number.isFinite(imageWidth) ? Math.max(1, Math.floor(imageWidth!)) : 1024;
      const h = Number.isFinite(imageHeight) ? Math.max(1, Math.floor(imageHeight!)) : 1536;
      const roi = makeFallbackRoiMask(w, h);
      const maskDataUrl = pngDataUrlFromMask(roi, w, h);
      const coveragePct = (roi.reduce((a, b) => a + b, 0) / roi.length) * 100;
      if (isDev) {
        console.log("[AUTO-MASK] No kitchen classes detected, using ROI fallback.");
        console.log("[AUTO-MASK] coveragePct", coveragePct.toFixed(2));
      }
      return NextResponse.json({
        maskDataUrl,
        meta: { coveragePct, classesUsed: ["roi_fallback"] },
      });
    }

    // Fetch and union masks
    let base: Uint8Array | null = null;
    let mw = 0;
    let mh = 0;
    for (const seg of chosen) {
      const { mask, width, height } = await fetchPngMask(seg.mask);
      if (!base) {
        base = new Uint8Array(width * height);
        mw = width;
        mh = height;
      }
      // If dimensions mismatch, skip (keep it safe)
      if (width !== mw || height !== mh) continue;
      unionInto(base, mask);
    }

    if (!base) throw new Error("Failed to build mask from segments");

    // Post-process (production critical)
    const minComponentSize = 350;
    const dilatePx = 12;

    removeSmallComponents(base, mw, mh, minComponentSize);
    fillHoles(base, mw, mh);
    const dilated = dilate(base, mw, mh, dilatePx);

    const whiteCount = dilated.reduce((a, b) => a + b, 0);
    const coveragePct = (whiteCount / dilated.length) * 100;

    // Safety: if mask ends up empty, fail-open to ROI (better than 0%)
    if (whiteCount === 0) {
      const roi = makeFallbackRoiMask(mw, mh);
      const roiWhite = roi.reduce((a, b) => a + b, 0);
      const roiCoverage = (roiWhite / roi.length) * 100;
      if (isDev) {
        console.log("[AUTO-MASK] mask empty after postprocess → ROI fallback", {
          roiCoverage: roiCoverage.toFixed(2),
        });
      }
      return NextResponse.json({
        maskDataUrl: pngDataUrlFromMask(roi, mw, mh),
        meta: { coveragePct: roiCoverage, classesUsed: ["roi_fallback_empty_mask"] },
      });
    }

    // Safety: if mask covers basically the whole image, it's almost certainly wrong
    // (kitchen elements should not be 90–100% of pixels). Fall back to ROI.
    if (coveragePct > 90) {
      const roi = makeFallbackRoiMask(mw, mh);
      const roiWhite = roi.reduce((a, b) => a + b, 0);
      const roiCoverage = (roiWhite / roi.length) * 100;
      if (isDev) {
        console.log("[AUTO-MASK] over-coverage detected → ROI fallback", {
          coveragePct: coveragePct.toFixed(2),
          roiCoverage: roiCoverage.toFixed(2),
        });
      }
      return NextResponse.json({
        maskDataUrl: pngDataUrlFromMask(roi, mw, mh),
        meta: { coveragePct: roiCoverage, classesUsed: ["roi_fallback_overcoverage"] },
      });
    }

    const maskDataUrl = pngDataUrlFromMask(dilated, mw, mh);

    if (isDev) {
      console.log("[AUTO-MASK] classes used:", Array.from(new Set(used)));
      console.log("[AUTO-MASK] coveragePct:", coveragePct.toFixed(2));
      console.log("[AUTO-MASK] postprocess:", { dilatePx, minComponentSize, maskSize: `${mw}x${mh}` });
    }

    return NextResponse.json({
      maskDataUrl,
      meta: {
        coveragePct,
        classesUsed: Array.from(new Set(used)),
      },
    });
  } catch (error: any) {
    console.error("[AUTO-MASK] Error:", error);

    // Fail-open: ROI fallback (do not block user)
    const w =
      parsedBody?.imageWidth && Number.isFinite(parsedBody.imageWidth)
        ? Math.max(1, Math.floor(parsedBody.imageWidth))
        : 1024;
    const h =
      parsedBody?.imageHeight && Number.isFinite(parsedBody.imageHeight)
        ? Math.max(1, Math.floor(parsedBody.imageHeight))
        : 1536;
    const roi = makeFallbackRoiMask(w, h);
    const maskDataUrl = pngDataUrlFromMask(roi, w, h);
    const coveragePct = (roi.reduce((a, b) => a + b, 0) / roi.length) * 100;
    return NextResponse.json({
      maskDataUrl,
      meta: { coveragePct, classesUsed: ["roi_fallback"] },
    });
  }
}

