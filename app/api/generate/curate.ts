/**
 * ============================================
 * CURATION MODULE (ChatGPT #2)
 * ============================================
 * 
 * Responsibility: Explain products and generate render prompt.
 * 
 * RULES:
 * - Keep ALL products from SerpAPI
 * - Explain WHY each product was chosen
 * - Write Slovenian summary
 * - Generate render prompt
 * - MUST NOT modify or invent links
 */

import OpenAI from "openai";
import { VerifiedProduct, QuestionnaireInput, CurationResult } from "./types";

const SYSTEM_PROMPT = `Si profesionalen notranji oblikovalec. Tvoja naloga je, da izbereš TOČNO EN produkt na kategorijo in pripraviš render prompt.

KRITIČNA PRAVILA:
1. Za vsako kategorijo izberi TOČNO EN produkt (ne več, ne manj)
2. NE dodajaj produktov (uporabi samo tiste iz vnosa)
3. NE spreminjaj URL-jev (uporabi točno tiste iz vnosa)
4. NE spreminjaj cen (uporabi tiste iz vnosa ali "Na povpraševanje")
5. NE navajaj alternativ ali razlagaj več možnosti
6. Razloži ZAKAJ je ta produkt izbran
7. Napiši lepo oblikovan povzetek v slovenščini
8. Generiraj render prompt - OBAVEZNO uporabi format iz navodil

KRITERIJI ZA IZBOR (v tem vrstnem redu):
1. Ujemanje sloga z uporabnikovimi preferencami
2. Kakovost / material grade
3. Razmerje cena-vrednost
4. Razpoložljivost v Sloveniji
5. Preprostost (izogibaj se preveč oblikovanim produktom)

Če je več podobnih produktov:
- Izberi najbolj nevtralno in časovno neodvisno možnost

RENDER PROMPT FORMAT (OBVEZNO):
Za render prompt moraš vedno uporabiti ta format:
"Photorealistic interior visualization. Full-color, realistic interior design photograph.

CRITICAL LAYOUT PRESERVATION:
- PRESERVE the exact room layout and spatial arrangement from the input image
- KEEP the same furniture positions, room proportions, and spatial structure
- MAINTAIN the same camera angle and perspective
- KEEP the same room shape, windows, doors, and architectural elements
- ONLY CHANGE: furniture styles (bed, chair, table), wall colors, and decorative elements
- The layout must be IDENTICAL to the input image

CRITICAL: Transform monochrome/grayscale input into full-color photorealistic render. IGNORE any floorplan, blueprint, sketch, edge, or line-art interpretation. DO NOT preserve outlines, white edges, black backgrounds, monochrome appearance, or technical drawing style.

RENDER MODE: Photorealistic interior visualization (NOT floorplan, NOT sketch, NOT technical drawing).

STYLE: [uporabnikov slog] interior design, [material grade] materials, [furniture style] furniture. Full color image, realistic materials, realistic lighting, modern interior design, soft shadows, global illumination, realistic color grading.

MATERIALS: CHANGE wall colors to different colors (not the same as input), realistic wood or laminate flooring, furniture with real textures (fabric, wood, metal), visible light temperature (warm or neutral white). CHANGE bed and chair to different styles and colors.

CAMERA: Eye-level interior view, realistic wide-angle lens, natural perspective (no distortion). PRESERVE exact camera angle from input.

QUALITY: Ultra-detailed, high resolution, interior design visualization, looks like a real interior photo.

FINAL RULE: The output MUST preserve the exact layout from input image but with different furniture and wall colors. The output MUST look like a real, colored interior photograph."

NEGATIVE PROMPT (OBVEZNO):
Negative prompt mora VEDNO vsebovati:
"black and white, monochrome, grayscale, desaturated, colorless, achromatic, single color, monotone, sketch, outline, edge detection, canny, hed, wireframe, line art, technical drawing, blueprint, floor plan drawing, diagram, cartoon, illustration, neon lines, chalk drawing, floorplan, floor plan, white edges, black background, monochrome appearance, technical drawing style"

IZHOD: JSON objekt z TOČNO ENIM produktom na kategorijo, povzetkom in render promptom.`;

export async function curateProducts(
  products: VerifiedProduct[],
  input: QuestionnaireInput,
  openai: OpenAI
): Promise<CurationResult> {
  if (products.length === 0) {
    return {
      products: [],
      summary: "Za vaše preference nismo našli produktov z verifikovanimi povezavami. Poskusite prilagoditi iskalne parametre.",
      renderPrompt: buildDefaultRenderPrompt(input),
      negativePrompt: buildNegativePrompt(input.interiorStyle),
    };
  }

  const userPrompt = `Izberi TOČNO EN produkt na kategorijo in pripravi render prompt:

PRODUKTI (iz SerpAPI - NE spreminjaj linkov):
${JSON.stringify(products, null, 2)}

UPORABNIKOVE PREFERENCE:
- Notranji slog: ${input.interiorStyle || "N/A"}
- Material: ${input.materialGrade || "N/A"}
- Pohištvo: ${input.furnitureStyle || "N/A"}
- Lokacija: ${input.location?.address || "N/A"}

NALOGA:
1. Za vsako kategorijo izberi TOČNO EN najboljši produkt (uporabi kriterije iz navodil)
2. Napiši razlago, zakaj je ta produkt izbran (justification)
3. Napiši lepo oblikovan povzetek v slovenščini (summary)
4. Generiraj render prompt za Replicate (renderPrompt) - OBAVEZNO uporabi ta format:
   "Generate a full-color, photorealistic interior render based on the provided floor plan.
   IMPORTANT RULES: This must be a COLOR image, not black and white. Do NOT generate outlines, sketches, or edge-only visuals.
   The floor plan lines must be interpreted into a realistic 3D interior.
   STYLE: [uporabnikov slog] interior design, [material grade] materials, [furniture style] furniture.
   Photorealistic interior design, real-world materials and lighting, soft natural daylight, global illumination.
   COLORS & MATERIALS: Walls: soft warm white, Floor: natural wood, Ceiling: matte white, Furniture: realistic colors, Lighting: warm white light (3000–4000K).
   FLOOR PLAN HANDLING: Use the floor plan ONLY as spatial guidance. Convert 2D lines into a realistic 3D room. Do NOT display floor plan lines in final image.
   QUALITY: High detail, sharp focus, realistic shadows, 4k quality"
5. Generiraj negative prompt (negativePrompt) - OBAVEZNO vključi: "black and white, monochrome, sketch, outline, edge detection, canny, hed, wireframe, line art, technical drawing, blueprint, floor plan drawing, diagram, cartoon, illustration, neon lines, chalk drawing"

POMEMBNO:
- Če je v kategoriji več produktov, izberi samo ENEGA (najbolj nevtralnega in časovno neodvisnega)
- NE navajaj alternativ
- NE razlagaj več možnosti
- Za vsako kategorijo mora biti TOČNO EN produkt

IZHOD (JSON):
{
  "products": [
    {
      "category": "...",
      "name": "...",
      "store": "...",
      "price": "Na povpraševanje" ali "€XX",
      "link": "...", // TOČNO iz vnosa
      "justification": "..."
    }
    // TOČNO EN produkt na kategorijo
  ],
  "summary": "...",
  "renderPrompt": "...",
  "negativePrompt": "..."
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.5,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  });

  const response = completion.choices[0]?.message?.content;
  if (!response) {
    throw new Error("No response from curation");
  }

  const parsed = JSON.parse(response);

  // Validate that all links are from original products
  const originalLinks = new Set(products.map((p) => p.link));
  const curatedProducts = parsed.products || [];
  
  // Filter out any products with modified links
  const validProducts = curatedProducts.filter((p: any) => 
    originalLinks.has(p.link)
  );

  // ENFORCE: Only ONE product per category
  const productsByCategory: Record<string, any[]> = {};
  for (const product of validProducts) {
    if (!productsByCategory[product.category]) {
      productsByCategory[product.category] = [];
    }
    productsByCategory[product.category].push(product);
  }

  // For each category, keep only the first product (ChatGPT should have selected the best one)
  const finalProducts: any[] = [];
  for (const [category, categoryProducts] of Object.entries(productsByCategory)) {
    if (categoryProducts.length > 0) {
      // Take the first one (ChatGPT should have selected the best)
      finalProducts.push(categoryProducts[0]);
    }
  }

  // If some categories are missing, add one product per missing category
  const usedCategories = new Set(finalProducts.map((p: any) => p.category));
  const allCategories = new Set(products.map((p) => p.category));
  
  for (const category of allCategories) {
    if (!usedCategories.has(category)) {
      // Find first product in this category
      const categoryProduct = products.find((p) => p.category === category);
      if (categoryProduct) {
        finalProducts.push({
          category: categoryProduct.category,
          name: categoryProduct.title,
          store: categoryProduct.source,
          price: "Na povpraševanje",
          link: categoryProduct.link,
          justification: "Produkt izbran na podlagi uporabnikovih preferenc",
        });
      }
    }
  }

  // Validate and enhance render prompt
  let renderPrompt = parsed.renderPrompt || buildDefaultRenderPrompt(input);
  let negativePrompt = parsed.negativePrompt || buildNegativePrompt(input.interiorStyle);
  
  // Ensure render prompt contains critical color requirements
  if (!renderPrompt.toLowerCase().includes("color") && !renderPrompt.toLowerCase().includes("colour")) {
    renderPrompt = buildDefaultRenderPrompt(input);
  }
  
  // Ensure negative prompt contains black and white prevention
  if (!negativePrompt.toLowerCase().includes("black and white") && !negativePrompt.toLowerCase().includes("monochrome")) {
    negativePrompt = buildNegativePrompt(input.interiorStyle);
  }

  return {
    products: finalProducts,
    summary: parsed.summary || "Produkti so bili izbrani na podlagi vaših preferenc.",
    renderPrompt: renderPrompt,
    negativePrompt: negativePrompt,
  };
}

/**
 * Builds default render prompt if ChatGPT fails
 * 
 * CRITICAL: This prompt ensures photorealistic COLOR images, not black and white.
 * This is the EXACT prompt format that must be used for all renders.
 */
function buildDefaultRenderPrompt(input: QuestionnaireInput): string {
  const style = input.interiorStyle || "modern";
  const grade = input.materialGrade || "mid-range";
  const furniture = input.furnitureStyle || "minimalist";

  return `Photorealistic interior visualization. Full-color, realistic interior design photograph.

CRITICAL LAYOUT PRESERVATION:
- PRESERVE the exact room layout and spatial arrangement from the input image
- KEEP the same furniture positions, room proportions, and spatial structure
- MAINTAIN the same camera angle and perspective
- KEEP the same room shape, windows, doors, and architectural elements
- ONLY CHANGE: furniture styles (bed, chair, table), wall colors, and decorative elements
- The layout must be IDENTICAL to the input image

CRITICAL OVERRIDE:
Transform monochrome/grayscale input into full-color photorealistic render.
IGNORE any floorplan, blueprint, sketch, edge, or line-art interpretation.
DO NOT preserve outlines, white edges, black backgrounds, monochrome appearance, or technical drawing style.

RENDER MODE:
Photorealistic interior visualization (NOT floorplan).

STYLE:
- full color image
- realistic materials
- realistic lighting
- ${style} interior design
- ${grade} materials
- ${furniture} furniture
- soft shadows
- global illumination
- realistic color grading

MATERIALS:
- CHANGE wall colors to different colors (not the same as input)
- realistic wood or laminate flooring
- CHANGE bed to a different style and color
- CHANGE chair to a different style and color
- furniture with real textures (fabric, wood, metal)
- visible light temperature (warm or neutral white)

CAMERA:
- eye-level interior view
- realistic wide-angle lens
- natural perspective (no distortion)
- PRESERVE exact camera angle from input

QUALITY:
- ultra-detailed
- high resolution
- interior design visualization
- looks like a real interior photo

FINAL RULE:
The output MUST preserve the exact layout from input image but with different furniture and wall colors.
The output MUST look like a real, colored interior photograph.`;
}

/**
 * Builds negative prompt based on interior style
 * 
 * CRITICAL: Must include black and white prevention terms.
 */
function buildNegativePrompt(style: string | null): string {
  // Base negative prompt - CRITICAL for preventing black and white and floorplan interpretation
  // These MUST be first and most prominent
  const baseNegative = "black and white, monochrome, grayscale, desaturated, colorless, achromatic, single color, monotone, sketch, outline, edge detection, canny, hed, wireframe, line art, technical drawing, blueprint, floor plan drawing, floorplan, floor plan, diagram, cartoon, illustration, neon lines, chalk drawing, bw, b&w, black white, white edges, black background, monochrome appearance, technical drawing style";
  
  // Style-specific negatives
  const styleNegatives: Record<string, string> = {
    modern: "cluttered, outdated, dark, cramped, old-fashioned, ornate",
    scandinavian: "dark colors, heavy furniture, ornate decorations, cluttered, industrial",
    minimalist: "ornate, cluttered, busy patterns, excessive decoration, dark colors, vintage",
    industrial: "delicate, ornate, pastel colors, soft textures, traditional, rustic",
    luxury: "cheap, basic, simple, low-quality, budget, minimalist",
    rustic: "modern sleek, minimalist, cold colors, industrial, urban, contemporary",
    japandi: "ornate, cluttered, bright colors, excessive decoration, busy patterns, industrial",
    mediterranean: "cold colors, modern sleek, minimalist, industrial, dark moody, contemporary",
  };

  const styleNegative = styleNegatives[style || "modern"] || styleNegatives.modern;
  
  // Put black and white and floorplan prevention FIRST and repeat it for emphasis
  return `black and white, monochrome, grayscale, floorplan, floor plan, ${baseNegative}, ${styleNegative}`;
}
