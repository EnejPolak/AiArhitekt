import { NextResponse } from "next/server";
import Replicate from "replicate";

// Style presets for different design styles
const STYLE_PRESETS = {
  modern: {
    prompt: "modern minimalist interior design, clean lines, neutral colors, contemporary furniture, bright natural lighting, spacious, sleek surfaces",
    negative_prompt: "cluttered, outdated, dark, cramped, old-fashioned",
  },
  scandinavian: {
    prompt: "scandinavian interior design, light wood, white walls, cozy textiles, hygge atmosphere, natural materials, minimalist, warm lighting",
    negative_prompt: "dark colors, heavy furniture, ornate decorations, cluttered",
  },
  minimalist: {
    prompt: "minimalist interior design, clean lines, neutral palette, functional furniture, uncluttered spaces, simple forms, natural light",
    negative_prompt: "ornate, cluttered, busy patterns, excessive decoration, dark colors",
  },
  industrial: {
    prompt: "industrial interior design, exposed brick, concrete surfaces, metal fixtures, raw materials, urban loft aesthetic, high ceilings, vintage elements",
    negative_prompt: "delicate, ornate, pastel colors, soft textures, traditional",
  },
  luxury: {
    prompt: "luxury interior design, high-end materials, marble, gold accents, elegant furniture, sophisticated, premium finishes, opulent",
    negative_prompt: "cheap, basic, simple, low-quality, budget",
  },
  rustic: {
    prompt: "rustic interior design, natural wood, stone elements, warm earth tones, cozy atmosphere, vintage furniture, country charm, textured surfaces",
    negative_prompt: "modern sleek, minimalist, cold colors, industrial, urban",
  },
  japandi: {
    prompt: "japandi interior design, japanese minimalism meets scandinavian design, natural materials, neutral colors, zen atmosphere, clean lines, functional beauty",
    negative_prompt: "ornate, cluttered, bright colors, excessive decoration, busy patterns",
  },
  mediterranean: {
    prompt: "mediterranean interior design, warm colors, terracotta, stone, natural textures, arched elements, rustic charm, coastal influences, earthy tones",
    negative_prompt: "cold colors, modern sleek, minimalist, industrial, dark moody",
  },
};

// ONLY TWO MODELS - NO FALLBACKS
const MODELS = {
  normal: "sdxl-based/realvisxl-v3", // Primary model for normal renders
  floorplan: "sdxl-based/realvisxl-v3-multi-controlnet-lora:90a4a3604cd637cb9f1a2bdae1cfa9ed869362ca028814cdce310a78e27daade", // Floorplan model with ControlNet
};

// Global lock to prevent concurrent requests
let isProcessing = false;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 10000; // 10 seconds minimum between requests

// Rate limiting: Max 6 requests per minute
const requestHistory: number[] = [];
const MAX_REQUESTS_PER_MINUTE = 6;

function checkRateLimit(): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  // Remove old requests
  while (requestHistory.length > 0 && requestHistory[0] < oneMinuteAgo) {
    requestHistory.shift();
  }

  // Check if we're at the limit
  if (requestHistory.length >= MAX_REQUESTS_PER_MINUTE) {
    const oldestRequest = requestHistory[0];
    const retryAfter = Math.ceil((oldestRequest + 60000 - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

function addRequestToHistory() {
  requestHistory.push(Date.now());
}

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] 📥 Incoming request to /api/replicate/render`);

  try {
    // Check if API key is configured
    if (!process.env.REPLICATE_API_TOKEN) {
      console.error(`[${requestId}] ❌ REPLICATE_API_TOKEN is missing`);
      return NextResponse.json(
        { error: "AI service is not configured. Please contact support." },
        { status: 500 }
      );
    }

    // Protection 1: Check global lock
    if (isProcessing) {
      console.warn(`[${requestId}] ⚠️ [RATE LIMIT] Request rejected - already processing another request`);
      return NextResponse.json(
        { error: "Another generation is already in progress. Please wait." },
        { status: 429 }
      );
    }

    // Protection 2: Check minimum interval (8-10 seconds)
    const timeSinceLastRequest = Date.now() - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastRequest) / 1000);
      console.warn(`[${requestId}] ⚠️ [RATE LIMIT] Request rejected - too soon (${waitTime}s remaining)`);
      return NextResponse.json(
        { 
          error: `Please wait ${waitTime} seconds before generating again.`,
          retry_after: waitTime
        },
        { status: 429 }
      );
    }

    // Protection 3: Check rate limit (6 per minute)
    const rateLimitCheck = checkRateLimit();
    if (!rateLimitCheck.allowed) {
      console.warn(`[${requestId}] ⚠️ [RATE LIMIT] Request rejected - rate limit exceeded (${requestHistory.length}/${MAX_REQUESTS_PER_MINUTE} requests)`);
      return NextResponse.json(
        { 
          error: `Rate limit exceeded. Please wait ${rateLimitCheck.retryAfter} seconds before trying again.`,
          retry_after: rateLimitCheck.retryAfter
        },
        { status: 429 }
      );
    }

    // Set lock
    isProcessing = true;
    lastRequestTime = Date.now();
    addRequestToHistory();

    console.log(`[${requestId}] 🔒 Lock acquired. Processing request...`);

    // Parse request body
    const body = await req.json();
    const { image, style = "modern", mode = "normal" } = body;

    if (!image) {
      isProcessing = false;
      return NextResponse.json(
        { error: "Image is required. Please provide a base64 encoded image or image URL." },
        { status: 400 }
      );
    }

    // Validate mode
    if (mode !== "normal" && mode !== "floorplan") {
      isProcessing = false;
      return NextResponse.json(
        { error: "Mode must be either 'normal' or 'floorplan'." },
        { status: 400 }
      );
    }

    // Handle base64 images - Replicate expects data URLs or URLs
    let imageInput = image;
    if (image.startsWith("data:")) {
      imageInput = image;
    } else if (image.startsWith("http://") || image.startsWith("https://")) {
      imageInput = image;
    } else {
      imageInput = `data:image/jpeg;base64,${image}`;
    }

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    // Get style preset
    const stylePreset = STYLE_PRESETS[style as keyof typeof STYLE_PRESETS] || STYLE_PRESETS.modern;
    
    // Build the final prompt
    const finalPrompt = `${stylePreset.prompt}, ultra realistic, 4k render, modern architecture`;
    const negativePrompt = stylePreset.negative_prompt;

    // Determine which model to use
    const modelToUse = mode === "floorplan" ? MODELS.floorplan : MODELS.normal;
    
    console.log(`[${requestId}] 🎯 Using model: ${modelToUse} (mode: ${mode})`);
    console.log(`[${requestId}] Style: ${style}`);

    // Set parameters based on mode
    let inputParams: any;
    
    if (mode === "floorplan") {
      // Floorplan model with ControlNet - using parameters from Replicate documentation
      inputParams = {
        prompt: finalPrompt,
        lora_scale: 0.8,
        controlnet_1: "soft_edge_hed",
        controlnet_1_image: imageInput, // Original floorplan image
        controlnet_1_conditioning_scale: 0.8,
        controlnet_2_conditioning_scale: 0.8,
        negative_prompt: negativePrompt,
      };
    } else {
      // Normal render
      inputParams = {
        prompt: finalPrompt,
        image: imageInput, // For img2img
        negative_prompt: negativePrompt,
        width: 1024,
        height: 1024,
        num_outputs: 1,
        num_inference_steps: 30,
        guidance_scale: 7.5,
        prompt_strength: 0.8,
        seed: Math.floor(Math.random() * 1000000),
      };
    }

    console.log(`[${requestId}] 🧪 Calling Replicate API with model: ${modelToUse}`);

    // ONE REQUEST = ONE MODEL - NO FALLBACKS
    let output;
    try {
      output = await replicate.run(modelToUse, {
        input: inputParams,
      });
      console.log(`[${requestId}] ✅ Success with model: ${modelToUse}`);
    } catch (modelError: any) {
      isProcessing = false;
      
      const status = modelError?.response?.status;
      const retryAfter = modelError?.response?.data?.retry_after;
      
      console.error(`[${requestId}] ❌ Model ${modelToUse} failed:`, status || modelError?.message);
      
      // Handle 429 with retry_after
      if (status === 429 && retryAfter) {
        console.warn(`[${requestId}] ⚠️ [RATE LIMIT] Replicate returned 429 with retry_after: ${retryAfter}s`);
        return NextResponse.json(
          { 
            error: `Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`,
            retry_after: retryAfter
          },
          { status: 429 }
        );
      }
      
      // Re-throw other errors
      throw modelError;
    }

    // Check if we got a valid output
    if (!output) {
      isProcessing = false;
      console.error(`[${requestId}] ❌ No output from model`);
      return NextResponse.json(
        { error: "No image generated from AI. Please try again." },
        { status: 500 }
      );
    }

    // Replicate returns an array of URLs or a single URL
    // Handle both direct URLs and objects with .url() method
    let imageUrl: string;
    if (Array.isArray(output)) {
      const firstOutput = output[0];
      imageUrl = typeof firstOutput === 'string' 
        ? firstOutput 
        : (firstOutput?.url ? firstOutput.url() : firstOutput);
    } else {
      imageUrl = typeof output === 'string' 
        ? output 
        : (output?.url ? output.url() : output);
    }

    if (!imageUrl) {
      isProcessing = false;
      return NextResponse.json(
        { error: "No image generated from AI." },
        { status: 500 }
      );
    }

    console.log(`[${requestId}] ✅ Request completed successfully`);
    isProcessing = false;

    return NextResponse.json({
      imageUrl,
      style,
      mode,
      prompt: finalPrompt,
      model: modelToUse,
    });
  } catch (error: any) {
    isProcessing = false;
    
    // Log error server-side only
    console.error(`[${requestId}] ❌ REPLICATE ROUTE ERROR:`, error?.message || "Unknown error");
    console.error(`[${requestId}] Error type:`, error?.constructor?.name);
    
    let errorMessage = "AI rendering failed. Please try again.";
    let statusCode = 500;
    let retryAfter: number | undefined;
    
    if (error?.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;
      retryAfter = error.response?.data?.retry_after;
      
      console.error(`[${requestId}] Replicate API error:`, status, statusText);
      
      if (status === 404) {
        errorMessage = "AI model not found. Please contact support.";
        statusCode = 404;
      } else if (status === 429) {
        const retryAfterSeconds = retryAfter || 10;
        errorMessage = `Rate limit exceeded. Please wait ${retryAfterSeconds} seconds and try again. You may need to add more credits to your Replicate account.`;
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
    }

    // Return error to client
    return NextResponse.json(
      { 
        error: errorMessage,
        retry_after: retryAfter
      },
      { status: statusCode }
    );
  }
}
