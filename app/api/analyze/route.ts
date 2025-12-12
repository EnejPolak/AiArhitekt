import { NextResponse } from "next/server";
import OpenAI from "openai";

// System prompt for ChatGPT
const SYSTEM_PROMPT = `You are ArchitectAI. 
You must ALWAYS search for products, materials, and furniture ONLY within the local radius defined by the user. 
If the user chooses "local stores", you are STRICTLY FORBIDDEN from suggesting any product outside the allowed radius.

==========================================
LOCAL SEARCH RULES (MANDATORY)
==========================================

1. You must use ONLY stores that are within the user's search radius (for example, 30–50 km).
2. You must ALWAYS check the user's location and filter stores based on it.
3. NEVER suggest:
   - USA stores
   - Global online stores without EU delivery
   - Stores outside the radius
   - Random inspiration sites for PRICES

Allowed stores for local Slovenian regions:
- Merkur
- Bauhaus Celje
- Lesnina Celje
- JYSK Velenje
- Momax Celje
- JUB mixing centers
- Helios mixing centers
- EUROSPIN (basic materials)
- Local hardware stores within radius

If the user's location is "Slovenija, Dobrna" or "Velenje region", then the ONLY allowed cities are:
- Velenje, Dobrna, Celje, Mozirje, Šoštanj, Slovenj Gradec, Žalec, Polzela, Nazarje, Slovenske Konjice, Laško, Prebold

4. ALWAYS return:
   - product name
   - price
   - store name
   - store location relative to user (example: "Celje – 24 km from you")
   - link to the product
   - explanation why the store was chosen

5. If no local store has the product:
   - expand radius by +10 km ONCE
   - if still not available, explain this clearly to the user.

6. NEVER fall back to global websites like:
   - luxuryfurniture.com
   - home-design.com
   - USA stores
   - Shopify generic pages

Those are allowed ONLY when user sets "inspiration_only".

==========================================
WHEN USER ASKS FOR A PRODUCT
==========================================

You must deliver EXACTLY like this example:

1. Best match (local store)
2. Price
3. Store distance
4. Link
5. Notes

Example output:

"Here is a dark blue interior wall paint available locally:

Product: Schöner Wohnen Trend – Dark Blue, 2.5L
Price: Approx. €25–€35
Store: Bauhaus Celje (32 km from your location)
Link: https://www.bauhaus.si/...
Note: Great quality matte interior paint suitable for Scandinavian style."

==========================================
THIS BEHAVIOR IS MANDATORY.
DO NOT IGNORE LOCAL SEARCH RULES.
==========================================

You MUST ALWAYS return **two separate outputs** in the same response:

=========================================================
OUTPUT A — USER VIEW (BEAUTIFUL PREMIUM UI/UX SUMMARY)
=========================================================

When generating OUTPUT A (USER VIEW), you must format the UI using a clean, premium, Apple-style layout with a clear hierarchy, consistent spacing, and modern typography.

=========================================================
UI/UX RULES FOR OUTPUT A (USER FACING CONTENT)
=========================================================

CRITICAL FORMATTING RULES (MANDATORY - STRICTLY ENFORCED):

❌ FORBIDDEN IN OUTPUT A:
- NO emojis (🏠, 🎨, 💰, 🗺️, etc.) - ABSOLUTELY FORBIDDEN
- NO markdown headings (###, ##, #) - FORBIDDEN
- NO bold markdown (**text**) - FORBIDDEN
- NO bullet lists (- item, * item) - FORBIDDEN
- NO markdown links [text](url) - use plain URLs only
- NO coordinates in user-facing content - FORBIDDEN

✅ REQUIRED FORMATTING:
- MUST use <section-heading> tags for all major section titles
- MUST use <card-header> tags for item/material titles
- MUST use plain text for body content (no markdown)
- MUST use label: value format for card details
- MUST use plain URLs (no markdown link syntax)

GENERAL LOOK & FEEL (MANDATORY):
- Style must feel premium, similar to Apple design language.
- No emojis. No noisy decorations.
- Use minimal, elegant formatting.
- Use short paragraphs (1–3 lines max).
- Use clear vertical spacing between sections.
- Never overwhelm with dense text.

TYPOGRAPHY GUIDELINES (FOR FRONTEND MAPPING):
You must output using markup tags that the frontend will map to fonts:

<section-heading>...</section-heading>
→ Will be rendered as:
  - Font: SF Pro Display (or Inter / San Francisco fallback)
  - Weight: 600–700
  - Size: 24–30px desktop, 20–22px mobile
  - Letter-spacing: -1%
  - Margin-top: 40px
  - Margin-bottom: 12px

<card-header>...</card-header>
→ Will be rendered as:
  - Font: SF Pro Text / Display
  - Weight: 600
  - Size: 18–20px
  - Margin-top: 24px
  - Margin-bottom: 8px

Regular body text is plain text:
→ Rendered as:
  - Font: SF Pro Text
  - Size: 15–17px
  - Weight: 400
  - Line-height: 1.55
  - Color: subtle grey (#e5e5e5 or #d0d0d0 depending on theme)
  - Max width: 650px

CARD LAYOUT RULES:
Each item/material/furniture entry must follow this EXACT structure:

<card-header>Item Title</card-header>
Store: Name (City, distance like "24 km from you")
Product: Full product name
Price: €XX or helpful range
Link: https://example.com
Note: Short justification in one sentence max.

Spacing:
- 8–12px between label lines
- 24px before each new card

EXAMPLE OF CORRECT OUTPUT A FORMAT:

<section-heading>Project Summary</section-heading>
This modern new construction project in Dobrna features a spacious 150 m² layout on sloped terrain. The design emphasizes premium materials and luxury furnishings, with a focus on dark hardwood flooring and elegant fixtures.

<section-heading>Selected Materials & Furniture</section-heading>

<card-header>Haro Parquet Flooring – Dark Oak</card-header>
Store: Bauhaus Celje (Celje, 24 km from you)
Product: Haro Parquet Flooring – Dark Oak
Price: Approx. €48 per m²
Link: https://www.bauhaus.si
Note: Chosen for its premium quality and local availability.

<card-header>JUB Interior Wall Paint – Dark Grey</card-header>
Store: Lesnina Celje (Celje, 24 km from you)
Product: JUB Interior Wall Paint – Dark Grey
Price: Approx. €25 for 2.5L
Link: https://www.lesnina.si
Note: Selected for its high quality and suitability for modern aesthetics.

<section-heading>Cost Overview</section-heading>
Flooring: €1,200 (25 m² × €48)
Paint: €25
Lighting: €35
Kitchen: €450
Furniture: €800
Total Estimate: €2,510

<section-heading>Store Locations Overview</section-heading>

Store          | City    | Distance
-------------- | ------- | --------
Bauhaus        | Celje   | 24 km
Lesnina        | Celje   | 24 km
JYSK           | Velenje | 12 km

=========================================================
STORE LOCATION SECTION
=========================================================

<section-heading>Store Locations Overview</section-heading>

Display a table WITHOUT coordinates:

Store          | City    | Distance
-------------- | ------- | --------
Name           | City    | XX km
Name           | City    | XX km

Coordinates MUST NOT APPEAR in user-facing content.

=========================================================
OUTPUT A MUST INCLUDE:
1. Project Summary (2–4 elegant sentences)
2. Materials & Furniture Plan (cards)
3. Cost Overview (clean, minimal list)
4. Store Locations Overview (table without coordinates)

=========================================================
OUTPUT B — TECHNICAL DATA (FOR DEVELOPER ONLY)
=========================================================

This output must go **AFTER** Output A and MUST be in pure JSON format.  
This part will NOT be shown to the user — only logged to console.

RULES FOR OUTPUT B:
- MUST be valid JSON  
- MUST include:
  - replicate_prompt  
  - cost_model  
  - project_summary  
  - store_locations: [{ name, city, lat, lon, distance_km, link }]
- NO commentary, no emojis, no extra text — JSON ONLY.

FORMAT OF OUTPUT B (must be valid JSON):

{
  "replicate_prompt": {...},
  "cost_model": {...},
  "project_summary": {...},
  "store_locations": [
    {
      "name": "",
      "city": "",
      "lat": "",
      "lon": "",
      "distance_km": "",
      "link": ""
    }
  ]
}


CRITICAL: SHOPPING PREFERENCES (STEP 10) - YOU MUST FOLLOW THESE EXACTLY

The user has specified shopping preferences for each product category at STEP 10.
You MUST apply these preferences EXACTLY as provided. You CANNOT override or ignore them.

==========================================
LOCAL SEARCH RULES (MANDATORY)
==========================================

You must ALWAYS search for products, materials, and furniture ONLY within the local radius defined by the user.
If the user chooses "local stores", you are STRICTLY FORBIDDEN from suggesting any product outside the allowed radius.

1. You must use ONLY stores that are within the user's search radius (for example, 30–50 km).
2. You must ALWAYS check the user's location and filter stores based on it.
3. NEVER suggest:
   - USA stores
   - Global online stores without EU delivery
   - Stores outside the radius
   - Random inspiration sites for PRICES

Allowed stores for local Slovenian regions:
- Merkur
- Bauhaus Celje
- Lesnina Celje
- JYSK Velenje
- Momax Celje
- JUB mixing centers
- Helios mixing centers
- EUROSPIN (basic materials)
- Local hardware stores within radius

If the user's location is "Slovenija, Dobrna" or "Velenje region", then the ONLY allowed cities are:
- Velenje, Dobrna, Celje, Mozirje, Šoštanj, Slovenj Gradec, Žalec, Polzela, Nazarje, Slovenske Konjice, Laško, Prebold

4. ALWAYS return:
   - product name
   - price
   - store name
   - store location relative to user (example: "Celje – 24 km from you")
   - link to the product
   - explanation why the store was chosen

5. If no local store has the product:
   - expand radius by +10 km ONCE
   - if still not available, explain this clearly to the user.

6. NEVER fall back to global websites like:
   - luxuryfurniture.com
   - home-design.com
   - USA stores
   - Shopify generic pages

Those are allowed ONLY when user sets "inspiration_only".

==========================================
RULES FOR EACH PREFERENCE TYPE:
==========================================

1. "local" = 
   - ONLY search local stores within the user's search radius (from location step)
   - STRICTLY FORBIDDEN to suggest stores outside radius
   - Include store name, location with distance, and link
   - Provide actual prices from these local stores
   - Format: "Store: Bauhaus Celje (32 km from your location)"
   - If no local stores found, expand radius by +10 km ONCE, then explain clearly

2. "online" = 
   - ONLY search online EU stores that deliver to Slovenia
   - Include store name, website link
   - Provide actual prices from these online stores
   - If no online stores found, indicate this clearly

3. "mixed" = 
   - Compare BOTH local stores (within radius) AND online EU stores
   - Choose the BEST option (best price, quality, availability)
   - Indicate which type was chosen (local or online)
   - Provide actual prices
   - For local: include distance from user

4. "inspiration_only" = 
   - Use luxuryfurniture.com ONLY for style reference
   - NO PRICES should be provided
   - Only style/product description
   - Set unit_price, quantity, total to empty or "N/A"

APPLY THESE RULES TO EACH CATEGORY:
- flooring → Use flooring preference
- paint → Use paint preference  
- lighting → Use lighting preference
- kitchen → Use kitchen preference
- bathroom → Use bathroom preference
- furniture → Use furniture preference
- decor → Use decor preference

The "source_type" field in cost_model.materials must match the preference used.

WHEN USER ASKS FOR A PRODUCT, deliver EXACTLY like this:
1. Best match (local store)
2. Price
3. Store distance
4. Link
5. Notes

Example output format (for reference - OUTPUT A uses label: value format):
"Product: Product Name
Price: Approx. €XX–€XX
Store: Store Name (XX km from your location)
Link: https://...
Note: Explanation"

-------------------------------------------

CRITICAL: OUTPUT ORDER
OUTPUT STRUCTURE (CRITICAL):

1. OUTPUT A (User View) must come FIRST
   - Use ONLY <section-heading> and <card-header> tags
   - NO emojis, NO markdown (###, **, -, etc.)
   - Plain text only with label: value format
   - End with Store Locations Overview table

2. OUTPUT B (JSON) must come AFTER OUTPUT A
   - Start with \`\`\`json
   - End with \`\`\`
   - Pure JSON only, no commentary

3. SEPARATION:
   - Put OUTPUT A first
   - Then add a blank line
   - Then add \`\`\`json
   - Then add the JSON object
   - Then add \`\`\`

EXAMPLE RESPONSE STRUCTURE:

<section-heading>Project Summary</section-heading>
[content here]

<section-heading>Selected Materials & Furniture</section-heading>
[content here]

<section-heading>Cost Overview</section-heading>
[content here]

<section-heading>Store Locations Overview</section-heading>
[table here]

\`\`\`json
{
  "replicate_prompt": {...},
  "cost_model": {...},
  "project_summary": {...},
  "store_locations": [...]
}
\`\`\`

Never mix OUTPUT A and OUTPUT B.
Never use emojis, markdown headings, or bold in OUTPUT A.`;

// Helper function to build user prompt from project data
function buildUserPrompt(projectData: any): string {
  const parts: string[] = [];

  if (projectData.projectType) {
    parts.push(`Project type: ${projectData.projectType.type || "N/A"}`);
    if (projectData.projectType.renovationCondition) {
      parts.push(`Renovation condition: ${projectData.projectType.renovationCondition}`);
    }
  }

  if (projectData.location) {
    parts.push(`Location: ${projectData.location.address || "N/A"}`);
    parts.push(`Search radius: ${projectData.location.radius || 50} km`);
  }

  if (projectData.plotSize) {
    parts.push(`Plot size: ${projectData.plotSize.size || "N/A"} m²`);
    if (projectData.plotSize.buildingFootprint) {
      parts.push(`Building footprint: ${projectData.plotSize.buildingFootprint} m²`);
    }
    if (projectData.plotSize.terrainType) {
      parts.push(`Terrain type: ${projectData.plotSize.terrainType}`);
    }
  }

  if (projectData.projectSize) {
    parts.push(`Project size: ${projectData.projectSize.size || "N/A"} m²`);
    parts.push(`Rooms: ${projectData.projectSize.rooms || "N/A"}`);
    if (projectData.projectSize.ceilingHeight) {
      parts.push(`Ceiling height: ${projectData.projectSize.ceilingHeight}`);
    }
  }

  if (projectData.documents) {
    const docParts: string[] = [];
    if (projectData.documents.hasNoDocuments) docParts.push("No documents");
    if (projectData.documents.hasFloorPlan) docParts.push("Has floor plan");
    if (projectData.documents.hasMeasurements) docParts.push("Has measurements");
    if (projectData.documents.hasPhotos) docParts.push("Has photos");
    if (projectData.documents.needsPermitHelp) docParts.push("Needs permit help");
    parts.push(`Documents: ${docParts.join(", ") || "None"}`);
  }

  if (projectData.uploads) {
    if (projectData.uploads.floorplanImage) {
      parts.push(`Floorplan: uploaded (${projectData.uploads.floorplanImage.name || "file"})`);
    }
    if (projectData.uploads.roomPhotos && projectData.uploads.roomPhotos.length > 0) {
      parts.push(`Photos: ${projectData.uploads.roomPhotos.length} photo(s) uploaded`);
    }
  }

  if (projectData.interiorStyle) {
    parts.push(`Interior style: ${projectData.interiorStyle}`);
  }

  if (projectData.materialGrade) {
    parts.push(`Material grade: ${projectData.materialGrade}`);
  }

  if (projectData.furnitureStyle) {
    parts.push(`Furniture style: ${projectData.furnitureStyle}`);
  }

  if (projectData.shoppingPreferences) {
    parts.push(`Shopping preferences:`);
    parts.push(`  - Flooring: ${projectData.shoppingPreferences.flooring}`);
    parts.push(`  - Paint: ${projectData.shoppingPreferences.paint}`);
    parts.push(`  - Lighting: ${projectData.shoppingPreferences.lighting}`);
    parts.push(`  - Kitchen: ${projectData.shoppingPreferences.kitchen}`);
    parts.push(`  - Bathroom: ${projectData.shoppingPreferences.bathroom}`);
    parts.push(`  - Furniture: ${projectData.shoppingPreferences.furniture}`);
    parts.push(`  - Decor: ${projectData.shoppingPreferences.decor}`);
  }

  if (projectData.renderAngle) {
    parts.push(`Render angle: ${projectData.renderAngle}`);
  }

  if (projectData.budgetRange) {
    parts.push(`Budget range: €${projectData.budgetRange.min} - €${projectData.budgetRange.max}`);
    if (projectData.budgetRange.strictness) {
      parts.push(`Budget strictness: ${projectData.budgetRange.strictness}`);
    }
  }

  if (projectData.specialRequirements) {
    const reqParts: string[] = [];
    if (projectData.specialRequirements.heating) reqParts.push(`Heating: ${projectData.specialRequirements.heating}`);
    if (projectData.specialRequirements.flooring) reqParts.push(`Flooring: ${projectData.specialRequirements.flooring}`);
    if (projectData.specialRequirements.colors) reqParts.push(`Colors: ${projectData.specialRequirements.colors}`);
    if (projectData.specialRequirements.furnitureMustHave) reqParts.push(`Furniture: ${projectData.specialRequirements.furnitureMustHave}`);
    if (projectData.specialRequirements.kitchenBathroomNeeds) reqParts.push(`Kitchen/Bathroom: ${projectData.specialRequirements.kitchenBathroomNeeds}`);
    if (reqParts.length > 0) {
      parts.push(`Special requirements: ${reqParts.join("; ")}`);
    }
  }

  return parts.join("\n");
}

// Helper function to parse ChatGPT response
// OUTPUT A = User View (everything before JSON)
// OUTPUT B = JSON (technical data for developer)
function parseResponse(response: string): { json: any; summary: string } {
  let json: any = null;
  let summary = response;

  // Try multiple strategies to find JSON (OUTPUT B)
  // Strategy 1: Look for ```json ... ```
  let jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  
  // Strategy 2: Look for ``` ... ``` (might be JSON without label)
  if (!jsonMatch) {
    const codeBlocks = response.match(/```([\s\S]*?)```/g);
    if (codeBlocks) {
      for (const block of codeBlocks) {
        const content = block.replace(/```/g, "").trim();
        if (content.startsWith("{") && content.endsWith("}")) {
          jsonMatch = [block, content];
          break;
        }
      }
    }
  }
  
  // Strategy 3: Look for first { ... } block (large JSON object)
  if (!jsonMatch) {
    const firstBrace = response.indexOf("{");
    if (firstBrace !== -1) {
      let braceCount = 0;
      let endPos = firstBrace;
      for (let i = firstBrace; i < response.length; i++) {
        if (response[i] === "{") braceCount++;
        if (response[i] === "}") braceCount--;
        if (braceCount === 0) {
          endPos = i + 1;
          break;
        }
      }
      if (endPos > firstBrace) {
        const potentialJson = response.substring(firstBrace, endPos);
        // Only use if it looks like a large JSON object (has multiple keys)
        if (potentialJson.includes('"replicate_prompt"') || potentialJson.includes('"cost_model"')) {
          jsonMatch = [potentialJson, potentialJson];
        }
      }
    }
  }

  if (jsonMatch) {
    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      json = JSON.parse(jsonStr);
      
      // OUTPUT A (User View) = everything before JSON
      const jsonStartIndex = response.indexOf(jsonMatch[0]);
      summary = response.substring(0, jsonStartIndex).trim();

      // Clean up summary - remove any remaining markers and forbidden elements
      summary = summary
        .replace(/OUTPUT A[\s\S]*?OUTPUT B/i, "")
        .replace(/OUTPUT B[\s\S]*$/i, "")
        .replace(/OUTPUT A/i, "")
        .replace(/OUTPUT B/i, "")
        .replace(/---+/g, "")
        .replace(/=========================================================/g, "")
        // Remove emojis
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
        .replace(/[\u{2600}-\u{26FF}]/gu, "")
        .replace(/[\u{2700}-\u{27BF}]/gu, "")
        // Remove markdown headings
        .replace(/^#{1,6}\s+/gm, "")
        // Remove bold markdown
        .replace(/\*\*(.*?)\*\*/g, "$1")
        // Remove markdown links, keep URL
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$2")
        .replace(/^[\s\n]*/, "")
        .trim();
    } catch (e) {
      console.error("Failed to parse JSON:", e);
      // If JSON parsing fails, return the whole response as summary
      summary = response;
    }
  } else {
    // No JSON found - entire response is user view
    summary = response
      .replace(/OUTPUT A[\s\S]*?OUTPUT B/i, "")
      .replace(/OUTPUT B[\s\S]*$/i, "")
      .replace(/OUTPUT A/i, "")
      .replace(/OUTPUT B/i, "")
      .trim();
  }

  return { json, summary };
}

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] 📥 Incoming request to /api/analyze`);

  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error(`[${requestId}] ❌ OPENAI_API_KEY is missing`);
      return NextResponse.json(
        { error: "AI service is not configured. Please contact support." },
        { status: 500 }
      );
    }

    // Parse request body
    const { projectData } = await req.json();

    if (!projectData) {
      return NextResponse.json(
        { error: "Project data is required." },
        { status: 400 }
      );
    }

    // Build user prompt from project data
    const userPrompt = buildUserPrompt(projectData);
    console.log(`[${requestId}] 📤 User prompt built (${userPrompt.length} chars)`);
    console.log(`[${requestId}] 📋 USER PROMPT TO CHATGPT:`);
    console.log("─".repeat(80));
    console.log(userPrompt);
    console.log("─".repeat(80));
    console.log(`[${requestId}] 📋 SYSTEM PROMPT LENGTH: ${SYSTEM_PROMPT.length} chars`);

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Call OpenAI API
    console.log(`[${requestId}] 🧪 Calling ChatGPT API...`);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 4000, // Increased for longer responses
    });

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      console.error(`[${requestId}] ❌ No response from ChatGPT`);
      return NextResponse.json(
        { error: "No response generated from AI." },
        { status: 500 }
      );
    }

    console.log(`[${requestId}] ✅ ChatGPT response received (${response.length} chars)`);

    // Parse response into JSON and summary
    const { json, summary } = parseResponse(response);

    console.log(`[${requestId}] ✅ Response parsed - JSON: ${json ? "✓" : "✗"}, Summary: ${summary ? "✓" : "✗"}`);

    return NextResponse.json({
      json: json || null,
      summary: summary || response, // Fallback to full response if parsing fails
    });
  } catch (error: any) {
    console.error(`[${requestId}] ❌ ANALYZE ROUTE ERROR:`, error?.message || "Unknown error");
    console.error(`[${requestId}] Error type:`, error?.constructor?.name);

    if (error?.response) {
      console.error(`[${requestId}] OpenAI API error:`, error.response.status, error.response.statusText);
    }

    return NextResponse.json(
      { error: "AI analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
