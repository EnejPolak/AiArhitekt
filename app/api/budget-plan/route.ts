import { NextResponse } from "next/server";
import OpenAI from "openai";
import { budgetPlanSchema } from "@/lib/schemas/ai";
import { requireSpendRouteAuth } from "@/lib/api/spendAuth";
import { sanitizedInternalErrorResponse } from "@/lib/api/publicError";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireSpendRouteAuth();
  if (!auth.ok) return auth.response;
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const { roomType, budgetLevel, totalBudget, preferences } = body;

    if (!roomType || !budgetLevel || !totalBudget) {
      return NextResponse.json({ error: "roomType, budgetLevel, and totalBudget are required" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Use average of min/max for planning
    const avgBudget = Math.round((totalBudget.min + totalBudget.max) / 2);

    const systemPrompt = `You are a budget planning expert for home renovations. 
Given a room type, budget level, total budget, and user preferences, create a detailed budget allocation plan.
Return ONLY valid JSON with this structure:
{
  "caps": {
    "Category Name": { "max": number, "qty": number },
    ...
  },
  "reservedBufferRatio": number (0.05-0.10),
  "totalBudget": number
}

Categories should be relevant to the room type (e.g., "Paint & Wall Finishes", "Flooring", "Furniture", "Lighting", "Decor & Accessories").
The sum of all category max values should be approximately (1 - reservedBufferRatio) * totalBudget.
qty should be the expected quantity needed (usually 1, but can be higher for items like paint cans).`;

    const userPrompt = `Room type: ${roomType}
Budget level: ${budgetLevel}
Total budget: €${avgBudget}
Preferences: ${JSON.stringify(preferences || {})}

Create a budget allocation plan with category caps.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let parsedJson: unknown = {};
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      parsedJson = {};
    }

    const validated = budgetPlanSchema.safeParse(parsedJson);
    const parsed = validated.success
      ? validated.data
      : {
          caps: {
            "Paint & Wall Finishes": { max: Math.round(avgBudget * 0.15), qty: 1 },
            Flooring: { max: Math.round(avgBudget * 0.25), qty: 1 },
            Furniture: { max: Math.round(avgBudget * 0.35), qty: 1 },
            Lighting: { max: Math.round(avgBudget * 0.10), qty: 1 },
            "Decor & Accessories": { max: Math.round(avgBudget * 0.10), qty: 1 },
          },
          reservedBufferRatio: 0.05,
          totalBudget: avgBudget,
        };

    if (!parsed.totalBudget) {
      parsed.totalBudget = avgBudget;
    }

    if (typeof parsed.reservedBufferRatio !== "number") {
      parsed.reservedBufferRatio = 0.05;
    }

    return NextResponse.json(parsed);
  } catch (error: unknown) {
    return sanitizedInternalErrorResponse("Budget plan error:", error);
  }
}
