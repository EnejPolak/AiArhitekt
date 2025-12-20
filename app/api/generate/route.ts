/**
 * ============================================
 * GENERATE API ROUTE
 * ============================================
 * 
 * Main orchestrator for the complete pipeline.
 * 
 * FLOW:
 * 1. intent.ts → Determine what to search
 * 2. search.ts → Find real product links
 * 3. curate.ts → Explain products + render prompt
 * 4. render.ts → Generate interior image
 * 5. map.ts → Resolve store locations
 * 
 * NO LOGIC HERE - only orchestration.
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { determineSearchIntent } from "./intent";
import { searchProducts } from "./search";
import { curateProducts } from "./curate";
import { generateRender } from "./render";
import { resolveStoreLocations } from "./map";
import { QuestionnaireInput, GenerateResponse } from "./types";

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] 📥 Incoming request to /api/generate`);

  try {
    // ============================================
    // VALIDATE API KEYS
    // ============================================
    if (!process.env.OPENAI_API_KEY) {
      console.error(`[${requestId}] ❌ OPENAI_API_KEY is missing`);
      return NextResponse.json(
        { error: "AI service is not configured. Please contact support." },
        { status: 500 }
      );
    }

    if (!process.env.SERPAPI_KEY) {
      console.error(`[${requestId}] ❌ SERPAPI_KEY is missing`);
      return NextResponse.json(
        { error: "Search service is not configured. Please contact support." },
        { status: 500 }
      );
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      console.error(`[${requestId}] ❌ REPLICATE_API_TOKEN is missing`);
      return NextResponse.json(
        { error: "Render service is not configured. Please contact support." },
        { status: 500 }
      );
    }

    // ============================================
    // PARSE REQUEST
    // ============================================
    const body = await req.json();
    const projectData: QuestionnaireInput = body.projectData;

    if (!projectData) {
      return NextResponse.json(
        { error: "Project data is required." },
        { status: 400 }
      );
    }

    // ============================================
    // INITIALIZE SERVICES
    // ============================================
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // ============================================
    // STEP 1: INTENT (ChatGPT #1)
    // ============================================
    console.log(`[${requestId}] 🧠 Step 1: Determining search intent...`);
    const intent = await determineSearchIntent(projectData, openai);
    console.log(`[${requestId}] ✅ Found ${Object.keys(intent.categories).length} categories to search`);

    // ============================================
    // STEP 2: SEARCH (SerpAPI)
    // ============================================
    console.log(`[${requestId}] 🔍 Step 2: Searching for products...`);
    const verifiedProducts = await searchProducts(intent, process.env.SERPAPI_KEY);
    console.log(`[${requestId}] ✅ Found ${verifiedProducts.length} verified product pages`);

    if (verifiedProducts.length === 0) {
      return NextResponse.json({
        products: [],
        summary: "Za vaše preference nismo našli produktov z verifikovanimi povezavami. Poskusite prilagoditi iskalne parametre.",
        renderImage: "",
        storesMap: [],
      });
    }

    // ============================================
    // STEP 3: CURATION (ChatGPT #2)
    // ============================================
    console.log(`[${requestId}] 📝 Step 3: Curating products and generating prompts...`);
    const curation = await curateProducts(verifiedProducts, projectData, openai);
    console.log(`[${requestId}] ✅ Curated ${curation.products.length} products`);

    // ============================================
    // STEP 4: RENDER (Replicate)
    // ============================================
    let renderImageUrl = "";
    
    if (projectData.uploads?.floorPlan) {
      try {
        console.log(`[${requestId}] 🎨 Step 4: Generating render...`);
        renderImageUrl = await generateRender(
          {
            image: projectData.uploads.floorPlan,
            prompt: curation.renderPrompt,
            negativePrompt: curation.negativePrompt,
          },
          process.env.REPLICATE_API_TOKEN
        );
        console.log(`[${requestId}] ✅ Render generated`);
      } catch (error: any) {
        console.error(`[${requestId}] ⚠️ Render failed:`, error.message);
        // Continue without render if it fails
      }
    }

    // ============================================
    // STEP 5: MAP (Store Locations)
    // ============================================
    console.log(`[${requestId}] 🗺️ Step 5: Resolving store locations...`);
    const storeNames = Array.from(new Set(curation.products.map((p) => p.store)));
    const storesMap = await resolveStoreLocations(storeNames);
    console.log(`[${requestId}] ✅ Resolved ${storesMap.length} store locations`);

    // ============================================
    // FINAL RESPONSE
    // ============================================
    const response: GenerateResponse = {
      products: curation.products,
      summary: curation.summary,
      renderImage: renderImageUrl,
      storesMap: storesMap,
    };

    console.log(`[${requestId}] ✅ Request completed successfully`);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[${requestId}] ❌ GENERATE ROUTE ERROR:`, error?.message || "Unknown error");
    console.error(`[${requestId}] Error stack:`, error?.stack);

    return NextResponse.json(
      { error: "Generation failed. Please try again." },
      { status: 500 }
    );
  }
}
