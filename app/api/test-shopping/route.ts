import { NextResponse } from "next/server";
import OpenAI from "openai";
import { PNG } from "pngjs";

export const runtime = "nodejs";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl || "");
  if (!m) throw new Error("Invalid image data URL");
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

function getImageDimensions(buf: Buffer, mime: string): { width: number; height: number } {
  // PNG: IHDR
  if (mime.includes("png")) {
    if (buf.length < 24) throw new Error("PNG too small");
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }

  // JPEG: scan for SOF markers
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    let i = 2; // skip SOI
    while (i < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
      const isSOF =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSOF) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }

      // skip marker segment
      const len = buf.readUInt16BE(i + 2);
      if (!len) break;
      i += 2 + len;
    }
    throw new Error("Could not read JPEG dimensions");
  }

  throw new Error(`Unsupported image type for mask sizing: ${mime}`);
}

function dataUrlToFile(nameBase: string, dataUrl: string): File {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl || "");
  if (!m) throw new Error("Invalid image data URL");
  const mime = m[1];
  const b64 = m[2];
  const buf = Buffer.from(b64, "base64");
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const bytes = new Uint8Array(buf);
  return new File([bytes], `${nameBase}.${ext}`, { type: mime });
}

async function downloadAsFile(url: string, nameBase: string): Promise<File> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (AI Architect test-shopping)",
      accept: "image/*,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") || "image/jpeg";
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  const bytes = new Uint8Array(buf);
  return new File([bytes], `${nameBase}.${ext}`, { type: ct });
}

async function renderWithRefs(
  openai: OpenAI,
  args: { roomDataUrl: string; selected: any; userDirection?: string }
) {
  const roomFile = dataUrlToFile("room", args.roomDataUrl);
  const { mime, buffer } = parseDataUrl(args.roomDataUrl);
  const { width, height } = getImageDimensions(buffer, mime);

  // Geometry-preserving mask: only allow edits on the floor/furniture zone.
  // Mask semantics: transparent areas = editable.
  const maskPng = new PNG({ width, height });
  const x0 = Math.floor(width * 0.12);
  const x1 = Math.floor(width * 0.88);
  // Keep this lower to avoid touching windows/walls.
  const y0 = Math.floor(height * 0.55);
  const y1 = height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      maskPng.data[p + 0] = 0;
      maskPng.data[p + 1] = 0;
      maskPng.data[p + 2] = 0;
      // editable (transparent) in floor band, preserve (opaque) elsewhere
      const editableFloor = x >= x0 && x < x1 && y >= y0 && y < y1;
      const editable = editableFloor;
      maskPng.data[p + 3] = editable ? 0 : 255;
    }
  }
  const maskBuf = PNG.sync.write(maskPng);
  const maskFile = new File([new Uint8Array(maskBuf)], "mask.png", { type: "image/png" });

  const images: any = [roomFile];

  const prompt =
    "You will receive multiple reference images.\n" +
    "- Image 1 is the ORIGINAL living room photo (keep geometry identical).\n" +
    "\nCRITICAL GEOMETRY LOCK (MUST FOLLOW):\n" +
    "- DO NOT change the room shape, wall positions, ceiling height, floor outline, window/door placement, or camera viewpoint.\n" +
    "- DO NOT widen/narrow the room, do not change perspective, do not move the camera, do not change lens.\n" +
    "- Keep the background architecture IDENTICAL. Only edit surfaces and furnishings.\n" +
    "\nTASK:\n" +
    "- Create a modern luxurious living room design.\n" +
    "- Add furniture into the existing photo (do not remodel the room).\n" +
    "- Add typical living-room items: sofa, coffee table, rug, TV + low media console, and at least one lamp.\n" +
    "- Keep it minimal and intentional; do not sprinkle random items.\n" +
    "- You may change wall paint colors and finishes, but the room geometry must stay identical.\n" +
    "- You may change wall paint colors and finishes ONLY IF it does not alter geometry.\n" +
    "- Keep everything photorealistic, clean and decluttered, neutral even lighting, ultra-sharp focus.\n" +
    "\nIMPORTANT:\n" +
    "- Do NOT change the architecture. No new windows/doors. No moving walls.\n" +
    `User direction: ${args.userDirection || ""}\n\n` +
    "Do not add any text, watermark, or logos.";

  const resp = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    mask: maskFile,
    prompt,
    // Use auto to preserve the input photo's aspect/geometry.
    size: "auto",
    quality: "high",
  } as any);

  const arr = Array.isArray((resp as any)?.data) ? (resp as any).data : [];
  const b64 = arr.map((d: any) => d?.b64_json).find((x: any) => typeof x === "string");
  const url = arr.map((d: any) => d?.url).find((x: any) => typeof x === "string");
  return {
    imageUrl: b64 ? `data:image/png;base64,${b64}` : url || null,
    mode: "edits+mask",
    maskMeta: { width, height, x0, x1, y0, y1 },
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const image: unknown = body.image;
    const userDirection: string = typeof body.userDirection === "string" ? body.userDirection : "";

    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return NextResponse.json({ error: "image (data URL) is required" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Deterministic design decisions (so you always see what colors were used)
    const designDecisions = {
      wall_main: "warm greige",
      wall_accent: "deep olive green",
      lighting_temperature: "neutral white (4000K)",
      overall_style: "modern luxury",
    };

    // F) Render with refs
    const render = await renderWithRefs(openai, {
      roomDataUrl: image,
      selected: {},
      userDirection:
        `${userDirection}\n\n` +
        `Use wall color main: ${designDecisions.wall_main}. Accent wall: ${designDecisions.wall_accent}. Lighting: ${designDecisions.lighting_temperature}.`,
    });

    return NextResponse.json({
      designDecisions,
      render,
    });
  } catch (e: any) {
    const status = e?.status || e?.response?.status || e?.statusCode;
    const msg = e?.message || "Failed";
    if (status === 403 || status === 401 || status === 400) {
      return NextResponse.json({ error: msg }, { status });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

