import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is missing in environment variables");
      return NextResponse.json(
        { error: "AI service is not configured. Please contact support." },
        { status: 500 }
      );
    }

    // Parse request body
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required and must be a non-empty string." },
        { status: 400 }
      );
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using gpt-4o-mini (gpt-4.1-mini doesn't exist)
      messages: [
        {
          role: "system",
          content:
            "You are AI Architect, an expert architectural assistant. You help users understand their home renovation and construction projects. Provide clear, professional, and helpful guidance about architectural concepts, building regulations, cost estimates, and design considerations. Be concise but thorough.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const reply = completion.choices[0]?.message?.content;

    if (!reply) {
      return NextResponse.json(
        { error: "No response generated from AI." },
        { status: 500 }
      );
    }

    return NextResponse.json({ reply });
  } catch (error: any) {
    // Log error server-side only (never expose keys or detailed errors to client)
    console.error("AI ROUTE ERROR:", error?.message || "Unknown error");
    console.error("Error type:", error?.constructor?.name);
    if (error?.response) {
      console.error("OpenAI API error:", error.response.status, error.response.statusText);
    }

    // Return generic error to client
    return NextResponse.json(
      { error: "AI request failed. Please try again." },
      { status: 500 }
    );
  }
}

