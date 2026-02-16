import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

/** Request: location + rooms + scope + optional style/colors/budget + Places output for context */
interface GenerateItemsRequest {
  location: {
    formattedAddress?: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
  };
  rooms: string[];
  scope: "materials" | "contractors" | "both";
  style?: string;
  colors?: string[];
  budgetMax?: number;
  allowlistStoreDomains: string[];
  domainCategoryMapStores?: Record<string, string[]>;
}

/** Response: items[] ready for /api/serp/search; optional notes and laborSpecs */
interface GenerateItemsResponse {
  items: string[];
  notes?: string[];
  laborSpecs?: string[];
}

const ROOM_LABELS: Record<string, string> = {
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  living_room: "Living room",
  bedroom: "Bedroom",
  hallway: "Hallway",
  whole_home: "Whole home",
};

/** If scope includes contractors, always include these 3 labor specs (formattedAddress substituted). */
function requiredLaborSpecs(formattedAddress: string): string[] {
  const addr = formattedAddress || "{{formattedAddress}}";
  return [
    `Polaganje ploščic cena na m2 ${addr}`,
    `Zidarska dela cena ${addr}`,
    `Slikopleskarstvo/pleskanje cena na m2 ${addr}`,
  ];
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body: GenerateItemsRequest = await req.json().catch(() => ({}));
    const {
      location = {},
      rooms = [],
      scope = "materials",
      style,
      colors = [],
      budgetMax,
      allowlistStoreDomains = [],
      domainCategoryMapStores = {},
    } = body;

    const formattedAddress = location.formattedAddress ?? "{{formattedAddress}}";
    const roomLabels = rooms.length > 0
      ? rooms.map((r) => ROOM_LABELS[r] ?? r).join(", ")
      : "whole home";

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `You are an expert for generating product search specs for a renovation project in Slovenia.
Your output must be valid JSON only, no markdown or extra text.

Rules:
- Generate 8–20 item specs total depending on selected rooms (one short phrase per item).
- Each item is a single line: product description + optional size/constraint (e.g. "Keramične ploščice 60x60 bela", "Ogledalo 60-80 cm", "Jedilni stol modern max 150 EUR").
- Do NOT mention any store names or domain names.
- Use Slovenian or English keywords that work for product search (e.g. ploščice, stol, luč, pipe, barve).
- If style is given, reflect it (e.g. modern, Scandinavian).
- If colors are given, include them where relevant.
- If budgetMax is given (in EUR), scale max prices logically per item type (chairs, lights, mirror, tiles, etc.) and add "max X EUR" where appropriate.
- Include sizes only when common (e.g. tiles 60x60, mirror 60–80 cm).
- Output format: { "items": ["spec1", "spec2", ...], "notes": ["optional note"] }
- If scope is "contractors" or "both", you MUST also include a "laborSpecs" array with exactly these 3 strings (use the provided formattedAddress):
  1. "Polaganje ploščic cena na m2 " + formattedAddress
  2. "Zidarska dela cena " + formattedAddress
  3. "Slikopleskarstvo/pleskanje cena na m2 " + formattedAddress
  So laborSpecs is always these three when scope includes contractors.`;

    const userPrompt = `Location: ${formattedAddress}. Radius: ${location.radiusKm ?? "?"} km.
Rooms: ${roomLabels}.
Scope: ${scope}.
${style ? `Style: ${style}.` : ""}
${colors.length ? `Colors: ${colors.join(", ")}.` : ""}
${budgetMax != null ? `Budget max total: ${budgetMax} EUR. Distribute max prices per item type (e.g. chairs, lights, tiles).` : ""}

Store domains (for context only; do NOT mention in specs): ${allowlistStoreDomains.slice(0, 15).join(", ")}${allowlistStoreDomains.length > 15 ? "..." : ""}.

Generate a JSON object with "items" (array of product search specs, one per line). ${scope === "contractors" || scope === "both" ? `Also include "laborSpecs" with the 3 required labor lines using this address: ${formattedAddress}.` : ""}
Optional: "notes" array with short comments.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json(
        { error: "Empty response from LLM" },
        { status: 502 }
      );
    }

    let parsed: { items?: string[]; notes?: string[]; laborSpecs?: string[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON from LLM", raw },
        { status: 502 }
      );
    }

    const items = Array.isArray(parsed.items)
      ? parsed.items.filter((i) => typeof i === "string").map((i) => String(i).trim()).filter(Boolean)
      : [];

    const response: GenerateItemsResponse = { items };
    if (Array.isArray(parsed.notes) && parsed.notes.length > 0) {
      response.notes = parsed.notes.filter((n) => typeof n === "string");
    }

    // Hard rule: if scope includes contractors, always include the 3 labor specs
    if (scope === "contractors" || scope === "both") {
      response.laborSpecs = requiredLaborSpecs(formattedAddress);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("generate-items error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
