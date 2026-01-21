import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

/**
 * Test Render API Route (OpenAI-only)
 *
 * Generates / edits images using OpenAI Images API (gpt-image-1).
 * - Server-side only
 * - Backwards compatible request/response for existing frontend
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterSeconds(error: unknown): number | null {
  const e = error as any;
  if (e?.response?.headers?.get) {
    const retryAfter = e.response.headers.get("retry-after");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return seconds;
    }
  }
  if (e?.headers?.get) {
    const retryAfter = e.headers.get("retry-after");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return seconds;
    }
  }
  return null;
}

const ALLOWED_SIZES = ["1024x1024", "1024x1536", "1536x1024", "auto"] as const;
type ImageSize = (typeof ALLOWED_SIZES)[number];

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl || "");
  if (!m) throw new Error("Invalid image data URL");
  const mime = m[1];
  const b64 = m[2];
  return { mime, buffer: Buffer.from(b64, "base64") };
}

function normalizeSize(size: unknown): ImageSize {
  if (typeof size === "string" && (ALLOWED_SIZES as readonly string[]).includes(size)) {
    return size as ImageSize;
  }
  return "1024x1536";
}

function normalizeN(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  const int = Math.floor(n);
  return Math.max(1, Math.min(4, int));
}

function buildFinalPrompt(prompt: string, negativePrompt?: string): string {
  const p = prompt.trim();
  const neg = typeof negativePrompt === "string" ? negativePrompt.trim() : "";
  if (!neg) return p;
  return `${p}\n\nAvoid:\n${neg}`;
}

function dataUrlToFile(nameBase: string, dataUrl: string): File {
  const { mime, buffer } = parseDataUrl(dataUrl);
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const bytes = new Uint8Array(buffer);
  return new File([bytes], `${nameBase}.${ext}`, { type: mime });
}

async function with429Backoff<T>(fn: () => Promise<T>): Promise<T> {
  // 2-3 retries total (max 3 attempts)
  let attempt = 0;
  let backoffMs = 800;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (e: any) {
      const status = e?.status || e?.response?.status || e?.statusCode;
      if (status === 429 && attempt < 2) {
        const retryAfterSec = getRetryAfterSeconds(e);
        const waitMs = retryAfterSec ? retryAfterSec * 1000 : backoffMs;
        const jitter = Math.floor(Math.random() * 200);
        await sleep(waitMs + jitter);
        attempt += 1;
        backoffMs = Math.min(4000, Math.floor(backoffMs * 2));
        continue;
      }
      throw e;
    }
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b: any = body || {};
  const inputImage: unknown = b.image; // existing frontend sends "image" as data URL
  const inputMask: unknown = b.mask ?? b.maskImage; // optional
  const prompt: unknown = b.prompt;
  const negativePrompt: unknown = b.negativePrompt;
  const size = normalizeSize(b.size);
  const n = normalizeN(b.n);

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const finalPrompt = buildFinalPrompt(prompt, typeof negativePrompt === "string" ? negativePrompt : undefined);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // If the client provides an image, use Images Edits (image-to-image).
    // Otherwise, use Images Generations (text-to-image).
    const isEdit = typeof inputImage === "string" && inputImage.startsWith("data:image/");

    const images: string[] = await with429Backoff(async () => {
      const takeFromResp = (resp: any): string[] => {
        const arr = Array.isArray(resp?.data) ? resp.data : [];
        const b64 = arr.map((d: any) => d?.b64_json).filter((v: any) => typeof v === "string") as string[];
        if (b64.length > 0) return b64.map((x) => `data:image/png;base64,${x}`);
        const urls = arr.map((d: any) => d?.url).filter((v: any) => typeof v === "string") as string[];
        return urls;
      };

      // If edit and n>1, request n but also dedupe and top-up with small prompt variations.
      if (isEdit) {
        const imageFile = dataUrlToFile("input", inputImage as string);
        const maskFile =
          typeof inputMask === "string" && inputMask.startsWith("data:image/")
            ? dataUrlToFile("mask", inputMask)
            : undefined;

        const collected: string[] = [];
        const seen = new Set<string>();

        const runOnce = async (variationTag?: string) => {
          const resp = await openai.images.edit({
            model: "gpt-image-1",
            image: imageFile,
            ...(maskFile ? { mask: maskFile } : {}),
            prompt: variationTag ? `${finalPrompt}\n\nVariation: ${variationTag}` : finalPrompt,
            size,
            n: 1,
            quality: "high",
          } as any);
          return takeFromResp(resp);
        };

        // First try: one call with n (some accounts support it, but we still dedupe)
        try {
          const resp = await openai.images.edit({
            model: "gpt-image-1",
            image: imageFile,
            ...(maskFile ? { mask: maskFile } : {}),
            prompt: finalPrompt,
            size,
            n,
            quality: "high",
          } as any);
          for (const img of takeFromResp(resp)) {
            if (!img) continue;
            if (seen.has(img)) continue;
            seen.add(img);
            collected.push(img);
          }
        } catch {
          // fallback to single-shot below
        }

        // Top-up with explicit variations if we got duplicates / not enough
        let i = 0;
        while (collected.length < n && i < 4) {
          const imgs = await runOnce(String(i + 1));
          for (const img of imgs) {
            if (!img) continue;
            if (seen.has(img)) continue;
            seen.add(img);
            collected.push(img);
          }
          i++;
        }

        return collected.slice(0, n);
      }

      const resp = await openai.images.generate({
        model: "gpt-image-1",
        prompt: finalPrompt,
        size,
        n,
        quality: "high",
      } as any);

      const out = takeFromResp(resp);
      // basic dedupe
      return Array.from(new Set(out)).slice(0, n);
    });

    if (!images[0]) {
      return NextResponse.json({ error: "OpenAI did not return an image" }, { status: 500 });
    }

    return NextResponse.json({
      imageUrl: images[0],
      metadata: { provider: "openai", size, n, mode: isEdit ? "edits" : "generations" },
      ...(images.length > 1 ? { images } : {}),
    });
  } catch (error: any) {
    const status = error?.status || error?.response?.status || error?.statusCode;
    const message = error?.message || "Failed to generate image";

    if (status === 429) {
      return NextResponse.json(
        { error: "OpenAI rate limit hit. Please retry in a moment." },
        { status: 429 }
      );
    }

    if (status === 400 || status === 401 || status === 403) {
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
