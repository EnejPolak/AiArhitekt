import { NextResponse } from "next/server";
import Replicate from "replicate";
import OpenAI from "openai";

type StyleOptions = {
  style: "luxury-modern" | string;
  wallColor: "medium grey" | string;
  materials: "marble" | string;
  budgetTier: "premium" | string;
};

type ScanSummary = {
  roomType: string;
  camera: string;
  proportions: string;
  immutableConstraints: string[];
};

type MaskEval = {
  changeScoreInsideMask: number; // 0..100 higher = more changed
  stabilityScoreOutsideMask: number; // 0..100 higher = more preserved
  notes: string;
};

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function getRetryAfter(error: any): number | null {
  if (error?.response?.headers?.get) {
    const ra = error.response.headers.get("retry-after");
    if (ra) {
      const s = parseInt(ra, 10);
      if (!isNaN(s)) return s;
    }
  }
  if (error?.headers?.get) {
    const ra = error.headers.get("retry-after");
    if (ra) {
      const s = parseInt(ra, 10);
      if (!isNaN(s)) return s;
    }
  }
  return null;
}

function buildReplicateInpaintPrompt(style: StyleOptions, scan: ScanSummary): string {
  // Compact, SDXL-friendly, descriptive.
  return [
    "photorealistic architectural kitchen renovation render",
    "luxury modern kitchen design",
    "professional architectural photography, neutral even lighting, no dramatic lighting",
    "ultra-sharp focus, crisp edges, straight vertical walls, clean geometry",
    "medium grey walls (elegant modern grey, not white, not dark charcoal)",
    "premium modern cabinetry (new door profiles), premium appliances, modern lighting fixtures",
    "marble countertop and marble backsplash with subtle natural veining",
    "clean minimal surfaces, no clutter",
    "visible textures: wood grain, marble veining, fabric, metal reflections",
    // Explicit replacement instruction (mandatory)
    "all kitchen cabinets, counters and appliances in the masked area must be fully replaced with a completely new luxury design",
    // Geometry preservation (mandatory)
    "preserve exact room geometry from the input image",
    "same wall positions, same ceiling height, same window placement, same door placement",
    `same camera position and viewing angle (${scan.camera})`,
  ].join(", ");
}

function buildNegativePrompt(): string {
  return [
    "blur", "blurry", "soft focus", "depth of field", "DOF", "bokeh",
    "cinematic", "moody lighting", "dramatic lighting", "film grain", "vignette",
    "fisheye", "distorted perspective", "exaggerated wide angle", "warped walls",
    "stylized", "artistic", "illustration", "concept art", "cartoon",
    "original cabinets", "same cabinetry", "unchanged interior", "before renovation", "photo copy", "minimal changes",
    "clutter", "dishes", "plates", "cups", "boxes", "trash", "mess",
    "text", "logo", "watermark",
    "people", "person",
  ].join(", ");
}

async function scanKitchen(imageDataUrl: string): Promise<ScanSummary> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      roomType: "kitchen",
      camera: "eye-level interior view",
      proportions: "standard residential proportions",
      immutableConstraints: ["walls", "ceiling height", "windows/doors", "camera perspective"],
    };
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "ANALYSIS MODE (SCAN). Extract ONLY immutable spatial facts from this kitchen photo: room type, camera/view direction, proportions, and immutable constraints (walls/windows/doors/ceiling/camera). "
            + "Do NOT mention cabinetry/furniture as constraints. Return ONLY JSON with keys: roomType, camera, proportions, immutableConstraints.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Scan this interior photo for geometry constraints only." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const immutableConstraints = Array.isArray(parsed.immutableConstraints)
      ? parsed.immutableConstraints.map((s: any) => String(s)).slice(0, 8)
      : ["walls", "ceiling height", "windows/doors", "camera perspective"];

    return {
      roomType: String(parsed.roomType || "kitchen"),
      camera: String(parsed.camera || "eye-level interior view"),
      proportions: String(parsed.proportions || "standard residential proportions"),
      immutableConstraints,
    };
  } catch (e: any) {
    console.warn("[RENOVATE-KITCHEN][SCAN] failed, continuing:", e?.message || String(e));
    return {
      roomType: "kitchen",
      camera: "eye-level interior view",
      proportions: "standard residential proportions",
      immutableConstraints: ["walls", "ceiling height", "windows/doors", "camera perspective"],
    };
  }
}

async function evaluateMaskAware(args: {
  originalImage: string;
  maskImage: string;
  outputImageUrl: string;
}): Promise<MaskEval | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 260,
      messages: [
        {
          role: "system",
          content:
            "You are a strict architectural QA system. You have BEFORE image, a binary MASK (white=regenerate, black=preserve), and AFTER image. "
            + "Return ONLY JSON with keys: changeScoreInsideMask (0-100), stabilityScoreOutsideMask (0-100), notes. "
            + "changeScoreInsideMask is high when cabinetry/counters/appliances/materials in the masked region are clearly replaced. "
            + "stabilityScoreOutsideMask is high when unmasked areas (walls/windows/doors/camera/perspective) remain unchanged.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "BEFORE (original):" },
            { type: "image_url", image_url: { url: args.originalImage } },
            { type: "text", text: "MASK (white=change, black=preserve):" },
            { type: "image_url", image_url: { url: args.maskImage } },
            { type: "text", text: "AFTER (generated):" },
            { type: "image_url", image_url: { url: args.outputImageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    return {
      changeScoreInsideMask: Math.max(0, Math.min(100, Number(parsed.changeScoreInsideMask ?? 0))),
      stabilityScoreOutsideMask: Math.max(0, Math.min(100, Number(parsed.stabilityScoreOutsideMask ?? 0))),
      notes: String(parsed.notes || ""),
    };
  } catch (e: any) {
    console.warn("[RENOVATE-KITCHEN][EVAL] failed, continuing:", e?.message || String(e));
    return null;
  }
}

async function replicateRunSerialWithRetry(
  replicate: Replicate,
  model: `${string}/${string}` | `${string}/${string}:${string}`,
  input: any
): Promise<string> {
  const runOnce = async () => {
    const out = await replicate.run(model as any, { input });
    if (Array.isArray(out)) {
      const last = out[out.length - 1];
      return typeof last === "string" ? last : String(last);
    }
    return typeof out === "string" ? out : String(out);
  };

  try {
    return await runOnce();
  } catch (error: any) {
    const status = error?.status || error?.response?.status || error?.statusCode;
    if (status === 429) {
      const wait = getRetryAfter(error) || 10;
      await sleep(wait);
      // retry once
      return await runOnce();
    }
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: "Replicate API token not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const {
      originalImage,
      maskImage,
      styleOptions,
      preserveGeometry,
      seed,
    }: {
      originalImage: string;
      maskImage: string;
      styleOptions: StyleOptions;
      preserveGeometry: boolean;
      seed?: number;
    } = body;

    if (!originalImage || !maskImage) {
      return NextResponse.json({ error: "originalImage and maskImage are required" }, { status: 400 });
    }
    if (!styleOptions) {
      return NextResponse.json({ error: "styleOptions is required" }, { status: 400 });
    }
    if (preserveGeometry !== true) {
      return NextResponse.json({ error: "preserveGeometry must be true" }, { status: 400 });
    }

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

    const scan = await scanKitchen(originalImage);
    const prompt = buildReplicateInpaintPrompt(styleOptions, scan);
    const negative = buildNegativePrompt();

    // Defaults per spec
    let inpaintStrength = 0.55; // masked denoise strength
    let depthScale = 0.55;
    let depthEnd = 0.40;

    const depthStart = 0.0;
    const softEdgeScale = 0.30;
    const softEdgeStart = 0.10;
    const softEdgeEnd = 0.85;

    const userSeed = typeof seed === "number" ? seed : undefined;

    const MODEL =
      "fofr/realvisxl-v3-multi-controlnet-lora:1a3ade8e0dda7e1dbc652fe9ceda0f3cf0cc2ced1cccd217a035a3bc1a8a9f08" as const;

    const makeInput = (useSoftEdge: boolean) => ({
      prompt,
      negative_prompt: negative,
      image: originalImage,
      mask: maskImage, // inpaint mask: white=inpaint, black=preserve
      prompt_strength: inpaintStrength,

      width: 1024,
      height: 1536,
      num_inference_steps: 28,
      guidance_scale: 6.1,
      scheduler: "KarrasDPM",
      ...(typeof userSeed === "number" ? { seed: userSeed } : {}),

      // ControlNet depth (mandatory)
      controlnet_1: "depth_midas",
      controlnet_1_image: originalImage,
      controlnet_1_conditioning_scale: depthScale,
      controlnet_1_start: depthStart,
      controlnet_1_end: depthEnd,

      // Optional 2nd ControlNet (soft edge)
      ...(useSoftEdge
        ? {
            controlnet_2: "soft_edge_pidi",
            controlnet_2_image: originalImage,
            controlnet_2_conditioning_scale: softEdgeScale,
            controlnet_2_start: softEdgeStart,
            controlnet_2_end: softEdgeEnd,
          }
        : {}),

      lora_scale: 0.8,
      num_outputs: 1,
    });

    const runInpaint = async (): Promise<{ imageUrl: string; usedSoftEdge: boolean }> => {
      try {
        const imageUrl = await replicateRunSerialWithRetry(replicate, MODEL, makeInput(true));
        return { imageUrl, usedSoftEdge: true };
      } catch (e: any) {
        // If schema rejects controlnet_2, retry once with depth-only (still serial)
        const msg = e?.message || String(e);
        if (msg.includes("controlnet_2") || msg.includes("input.controlnet_2")) {
          const imageUrl = await replicateRunSerialWithRetry(replicate, MODEL, makeInput(false));
          return { imageUrl, usedSoftEdge: false };
        }
        throw e;
      }
    };

    // Attempt 1
    const attempt1 = await runInpaint();
    const eval1 = await evaluateMaskAware({
      originalImage,
      maskImage,
      outputImageUrl: attempt1.imageUrl,
    });

    let finalImageUrl = attempt1.imageUrl;
    let attempt2: { imageUrl: string; usedSoftEdge: boolean } | null = null;
    let eval2: MaskEval | null = null;

    // Self-correction (mask-aware), limit to 2 attempts total
    if (eval1) {
      const insideLow = eval1.changeScoreInsideMask < 65;
      const outsideLow = eval1.stabilityScoreOutsideMask < 85;

      if (insideLow || outsideLow) {
        if (insideLow) {
          inpaintStrength = Math.min(0.75, inpaintStrength + 0.05);
          depthScale = Math.max(0.50, depthScale - 0.05);
          depthEnd = Math.max(0.30, depthEnd - 0.05);
        }
        if (outsideLow) {
          inpaintStrength = Math.max(0.45, inpaintStrength - 0.05);
          depthScale = Math.min(0.65, depthScale + 0.05);
          depthEnd = Math.min(0.55, depthEnd + 0.05);
        }

        await sleep(2);
        attempt2 = await runInpaint();
        eval2 = await evaluateMaskAware({
          originalImage,
          maskImage,
          outputImageUrl: attempt2.imageUrl,
        });

        // Choose better: prioritize higher inside change + higher outside stability
        if (eval2) {
          const score1 = (eval1.changeScoreInsideMask * 0.6) + (eval1.stabilityScoreOutsideMask * 0.4);
          const score2 = (eval2.changeScoreInsideMask * 0.6) + (eval2.stabilityScoreOutsideMask * 0.4);
          finalImageUrl = score2 >= score1 ? attempt2.imageUrl : attempt1.imageUrl;
        } else {
          finalImageUrl = attempt2.imageUrl;
        }
      }
    }

    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json({
      finalImageUrl,
      ...(isDev
        ? {
            debug: {
              scan,
              prompt,
              attempt1: { ...attempt1, eval: eval1 },
              attempt2: attempt2 ? { ...attempt2, eval: eval2 } : null,
              tuned: { inpaintStrength, depthScale, depthEnd },
            },
          }
        : {}),
    });
  } catch (error: any) {
    console.error("[RENOVATE-KITCHEN] Error:", error);
    const msg = error?.message || "Kitchen renovation failed";
    const status = msg.includes("Rate limit") ? 429 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

