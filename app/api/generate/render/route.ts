/**
 * ============================================
 * RENDER API ROUTE (Standalone)
 * ============================================
 * 
 * Standalone endpoint for testing Replicate render only.
 * 
 * This is separate from the main /api/generate route
 * for easier testing and debugging.
 */

import { NextResponse } from "next/server";
import { generateRender } from "../render";

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] 📥 Incoming request to /api/generate/render`);

  try {
    // Check if API key is configured
    if (!process.env.REPLICATE_API_TOKEN) {
      console.error(`[${requestId}] ❌ REPLICATE_API_TOKEN is missing`);
      return NextResponse.json(
        { error: "Replicate API token is not configured. Please contact support." },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { image, prompt, negativePrompt, mode = "floorplan" } = body;

    // Validate required fields
    if (!image) {
      return NextResponse.json(
        { error: "Image is required. Please provide a base64 encoded image or image URL." },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 }
      );
    }

    // Validate mode
    if (mode !== "normal" && mode !== "floorplan") {
      return NextResponse.json(
        { error: "Mode must be either 'normal' or 'floorplan'." },
        { status: 400 }
      );
    }

    console.log(`[${requestId}] 🎨 Generating render with mode: ${mode}`);
    console.log(`[${requestId}] 📝 Prompt length: ${prompt.length} chars`);
    console.log(`[${requestId}] 📝 Negative prompt length: ${negativePrompt?.length || 0} chars`);

    // Generate render
    const imageUrl = await generateRender(
      {
        image,
        prompt,
        negativePrompt: negativePrompt || "",
      },
      process.env.REPLICATE_API_TOKEN
    );

    console.log(`[${requestId}] ✅ Render generated successfully`);
    console.log(`[${requestId}] 🖼️ Image URL: ${imageUrl}`);

    return NextResponse.json({
      imageUrl,
      prompt,
      mode,
    });
  } catch (error: any) {
    console.error(`[${requestId}] ❌ RENDER ROUTE ERROR:`, error?.message || "Unknown error");
    console.error(`[${requestId}] Error type:`, error?.constructor?.name);
    console.error(`[${requestId}] Error stack:`, error?.stack);

    let errorMessage = "AI rendering failed. Please try again.";
    let statusCode = 500;

    if (error?.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;

      console.error(`[${requestId}] Replicate API error:`, status, statusText);

      if (status === 404) {
        errorMessage = "AI model not found. Please contact support.";
        statusCode = 404;
      } else if (status === 429) {
        errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
        statusCode = 429;
      } else if (status === 402) {
        errorMessage = "Insufficient credits. Please add credits to your Replicate account.";
        statusCode = 402;
      } else if (status >= 500) {
        errorMessage = "AI service is temporarily unavailable. Please try again in a few moments.";
        statusCode = 503;
      }
    } else if (error?.message?.includes("rate limit") || error?.message?.includes("429")) {
      errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
      statusCode = 429;
    } else if (error?.message?.includes("required")) {
      errorMessage = error.message;
      statusCode = 400;
    }

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: statusCode }
    );
  }
}
