import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const image: unknown = body.image;
    const roomType: string = typeof body.roomType === "string" ? body.roomType : "room";
    const styles: string[] = Array.isArray(body.styles) ? body.styles.map(String) : [];
    const budget: string = typeof body.budget === "string" ? body.budget : "balanced";
    const preferences: any = body.preferences || {};
    const observation: string = typeof body.observation === "string" ? body.observation : "";

    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return NextResponse.json({ error: "image (data URL) is required" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system =
      "You are an interior architect and prompt engineer for OpenAI image editing (gpt-image-1). " +
      "Given an INPUT PHOTO and user preferences, produce a concise prompt and negative prompt. " +
      "CRITICAL: preserve exact geometry/camera: same walls, same ceiling height, same windows/doors, same perspective, same lens, same camera position. " +
      "You MUST explicitly lock ALL anchored elements seen in the photo (windows, blinds/curtains, shelves, radiators, switches, sockets, doors, built-ins). " +
      "Do NOT remove them, do NOT turn a window into a hole/opening, do NOT change their shape/size/position. " +
      "Allowed changes: furniture, materials, wall paint colors, lighting fixtures, decor. " +
      "Return ONLY strict JSON: { prompt: string, negativePrompt: string, decisions: { wallMain: string, wallAccent: string, flooring: string, heating: string, keyFurniture: string[], anchoredElements: string[] } }.";

    const user = {
      roomType,
      styles,
      budget,
      preferences,
      observation,
      rules: {
        preserve_geometry: true,
        keep_camera: true,
        no_room_shape_change: true,
        no_new_windows_or_doors: true,
        keep_all_anchored_elements: true,
        windows_must_remain_windows: true,
      },
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: `Build an image-edit prompt for this renovation.\n\nContext:\n${JSON.stringify(user, null, 2)}` },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const prompt = typeof parsed.prompt === "string" ? parsed.prompt : "";
    const negativePrompt = typeof parsed.negativePrompt === "string" ? parsed.negativePrompt : "";
    const decisions = typeof parsed.decisions === "object" && parsed.decisions ? parsed.decisions : {};

    if (!prompt.trim()) {
      return NextResponse.json({ error: "Failed to generate prompt" }, { status: 500 });
    }

    // Hard safety suffix (prevents window->hole / missing shelves even if model forgets)
    const safetyLock =
      "\n\nABSOLUTE LOCK:\n" +
      "- Keep the original camera position, lens, perspective, and framing EXACTLY.\n" +
      "- Keep ALL windows/doors/openings EXACTLY (same size, same position, same frame), no wall holes.\n" +
      "- Keep all built-ins and anchored items exactly (shelves, radiators, switches, sockets, trim).\n" +
      "- Do not add/remove/move windows, doors, shelves, radiators.\n";
    const safetyNegative =
      [
        "camera angle change",
        "different perspective",
        "window removed",
        "window resized",
        "missing window",
        "wall hole / opening",
        "missing shelves",
        "removed shelf",
        "moved shelf",
        "door moved",
        "new window",
        "new door",
        "structural changes",
      ]
        .filter(Boolean)
        .join(", ");

    return NextResponse.json({
      prompt: `${prompt}${safetyLock}`,
      negativePrompt: negativePrompt ? `${negativePrompt}, ${safetyNegative}` : safetyNegative,
      decisions,
    });
  } catch (e: any) {
    const status = e?.status || e?.response?.status || e?.statusCode;
    const msg = e?.message || "Failed";
    if (status === 400 || status === 401 || status === 403) {
      return NextResponse.json({ error: msg }, { status });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

