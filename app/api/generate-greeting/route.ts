import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const context = body.context || "room-renovation";

    if (!process.env.OPENAI_API_KEY) {
      const defaultGreeting = context === "home-renovation"
        ? "Hello 👋\n\nI'll help you plan a complete home renovation, step by step.\n\nLet's start with the basics."
        : "Hello 👋\n\nI'll help you redesign your space step by step.\n\nLet's start simple.\nWhich room would you like to renovate today?";
      return NextResponse.json({ greeting: defaultGreeting }, { status: 200 });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const systemPrompt = context === "home-renovation"
      ? "You are a professional interior architect. Greet the user warmly but professionally. Use a calm, premium tone. Include one subtle emoji (👋) in the greeting. Keep it concise - 3-4 sentences maximum."
      : "You are a professional interior architect. Greet the user warmly but professionally. Use a calm, premium tone. Include one subtle emoji (👋) in the greeting. Keep it concise - 3-4 sentences maximum.";

    const userPrompt = context === "home-renovation"
      ? "Generate a greeting for a user starting a complete home renovation project. End by saying 'Let's start with the basics.'"
      : "Generate a greeting for a user starting a room renovation project. End by asking which room they'd like to renovate.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 150,
    });

    const defaultGreeting = context === "home-renovation"
      ? "Hello 👋\n\nI'll help you plan a complete home renovation, step by step.\n\nLet's start with the basics."
      : "Hello 👋\n\nI'll help you redesign your space step by step.\n\nLet's start simple.\nWhich room would you like to renovate today?";

    const greeting =
      completion.choices[0]?.message?.content || defaultGreeting;

    return NextResponse.json({ greeting });
  } catch (error: any) {
    console.error("Error generating greeting:", error);
    const defaultGreeting = "Hello 👋\n\nI'll help you plan a complete home renovation, step by step.\n\nLet's start with the basics.";
    return NextResponse.json({ greeting: defaultGreeting }, { status: 200 });
  }
}
