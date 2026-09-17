import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireSpendRouteAuth } from "@/lib/api/spendAuth";
import { sanitizedInternalErrorResponse } from "@/lib/api/publicError";

export const runtime = "nodejs";

/** One pick from GPT pick-candidates */
type PickInput = {
  item: string;
  pickedUrl: string | null;
  pickedTitle?: string;
  pickedPrice?: { value: number; currency: "EUR"; unit?: "item" | "m2" | "from" | "set" } | null;
  confidence?: string;
  reason?: string;
};

/** Request: rooms + style/colors/budget + items + picks (from GPT pick) */
interface SummarizeRequest {
  rooms?: string[];
  scope?: "materials" | "contractors" | "both";
  style?: string;
  colors?: string[];
  budgetMax?: number;
  items: string[];
  picks: PickInput[];
  quantities?: Record<string, number>;
  /** Legacy: full serpResult for backward compat */
  serpResult?: Record<string, unknown>;
  generatedItems?: string[];
}

/** Response: markdown + totals */
interface SummarizeResponse {
  markdown: string;
  totals: {
    knownItemsTotal?: number;
    unknownPriceCount: number;
    unitCostsOrRanges?: Array<{ item: string; value: number; unit: string }>;
  };
}

export async function POST(req: Request) {
  const auth = await requireSpendRouteAuth();
  if (!auth.ok) return auth.response;
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body: SummarizeRequest = await req.json().catch(() => ({}));
    const {
      rooms = [],
      scope,
      style,
      colors = [],
      budgetMax,
      items = [],
      picks = [],
      quantities,
      serpResult,
      generatedItems = [],
    } = body;

    const itemsList = items.length > 0 ? items : generatedItems;
    const usePicks = picks.length > 0;
    if (!usePicks && !serpResult) {
      return NextResponse.json(
        { error: "picks or serpResult is required" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const itemPrices = usePicks
      ? picks.filter(
          (p) =>
            p.pickedPrice != null &&
            typeof p.pickedPrice.value === "number" &&
            (p.pickedPrice.unit === "item" || p.pickedPrice.unit == null)
        )
      : [];
    const knownItemsTotal =
      itemPrices.length > 0 ? itemPrices.reduce((a, p) => a + p.pickedPrice!.value, 0) : undefined;
    const unknownPriceCount = usePicks
      ? picks.filter(
          (p) => p.pickedUrl != null && (p.pickedPrice == null || typeof p.pickedPrice?.value !== "number")
        ).length
      : 0;
    const unitCostsOrRanges = usePicks
      ? picks.filter(
          (p) =>
            p.pickedPrice != null &&
            typeof p.pickedPrice.value === "number" &&
            p.pickedPrice.unit != null &&
            p.pickedPrice.unit !== "item"
        )
      : [];

    const systemPrompt = usePicks
      ? `You are summarizing product picks for a renovation project.
Output valid Markdown only. No code fences around the whole output.

Strict rules:
- Use ONLY data from the provided picks. Do NOT invent any prices, titles, or links.
- If a price is missing, write "price not found".
- Every listed product MUST include its URL as a link (format: [title](url)).
- Group items by room where possible (infer from the item spec: bathroom, kitchen, living room, bedroom, hallway). Use [ROOM] if present in item strings; otherwise best-effort grouping.
- Total = sum of ONLY per-item prices (unit "item" or no unit). Do NOT add €/m2 or "from X" prices to the total.
- Put prices with unit m2, "from", or "set" in a separate "Unit costs / Ranges" section (e.g. "X EUR/m2", "from Y EUR").
- Report "Partial total: X EUR" (items only) and "Y items without price" when applicable.
- Include a short "Assumptions / Missing data" section at the end.
- Do not add content not derived from the picks.`
      : `You are summarizing SERP product search results for a renovation project.
Output valid Markdown only. No code fences around the whole output.

Strict rules:
- Use ONLY data from the provided serpResult. Do NOT invent any prices, titles, or links.
- If a price is missing in the data, write "price not found".
- Every listed product MUST include its URL as a link (format: [title](url)).
- Group items by room where possible. For totals: only sum prices that exist.`;

    const userPrompt = usePicks
      ? `Rooms: ${rooms.join(", ") || "—"}.${scope ? ` Scope: ${scope}.` : ""}${style ? ` Style: ${style}.` : ""}${colors.length ? ` Colors: ${colors.join(", ")}.` : ""}${budgetMax != null ? ` Budget max: ${budgetMax} EUR.` : ""}

Items:
${itemsList.map((i) => `- ${i}`).join("\n")}

Picks (item, pickedUrl, pickedTitle, pickedPrice):
${JSON.stringify(picks, null, 2)}
${quantities && Object.keys(quantities).length > 0 ? `\nQuantities (optional): ${JSON.stringify(quantities)}` : ""}

Produce a clean room-by-room summary: each product with its link and price (or "price not found"). Sum only per-item prices in the total. Put m2/from/set prices in "Unit costs / Ranges" section. End with "Assumptions / Missing data".`
      : `Rooms: ${rooms.join(", ") || "—"}. Scope: ${scope || "—"}.${style ? ` Style: ${style}.` : ""}

Generated item specs:
${itemsList.map((i) => `- ${i}`).join("\n")}

Full SERP result (JSON):
${JSON.stringify(serpResult, null, 2)}

Produce a clean room-by-room summary in Markdown.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const markdown = completion.choices[0]?.message?.content?.trim() ?? "";

    const response: SummarizeResponse = {
      markdown,
      totals: {
        knownItemsTotal,
        unknownPriceCount,
        unitCostsOrRanges:
          unitCostsOrRanges.length > 0
            ? unitCostsOrRanges.map((p) => ({
                item: p.item,
                value: p.pickedPrice!.value,
                unit: p.pickedPrice!.unit!,
              }))
            : undefined,
      },
    };
    return NextResponse.json(response);
  } catch (error: unknown) {
    return sanitizedInternalErrorResponse("summarize error:", error);
  }
}
