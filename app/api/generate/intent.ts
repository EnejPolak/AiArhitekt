/**
 * ============================================
 * INTENT MODULE (ChatGPT #1)
 * ============================================
 * 
 * Responsibility: Translate user preferences into search intent.
 * 
 * RULES:
 * - ChatGPT NEVER searches the web
 * - Output ONLY JSON
 * - NO stores, NO links
 * - Generate Slovenian search queries
 */

import OpenAI from "openai";
import { QuestionnaireInput, SearchIntent } from "./types";

const SYSTEM_PROMPT = `Si strokovnjak za arhitekturno načrtovanje. Tvoja naloga je, da prevedeš uporabnikove preference v iskalne poizvedbe.

PRAVILA:
1. NE išči po spletu (to počne drug servis)
2. NE izmišljuj produktov ali URL-jev
3. Generiraj samo iskalne poizvedbe v slovenščini
4. Upoštevaj uporabnikove preference
5. Razmisli o notranjem slogu, materialu in pohištvu

IZHOD: JSON objekt z kategorijami in iskalnimi poizvedbami.

Primer:
{
  "categories": {
    "paint": ["bela notranja zidna barva", "akrilna barva"],
    "flooring": ["vinil tla", "parket hrast"],
    "furniture": ["jedilna miza moderna", "kavč"],
    "lighting": ["stropna LED svetilka"],
    "bathroom": ["umivalnik", "armatura"],
    "decor": ["stenski dekor"]
  },
  "language": "sl",
  "country": "si"
}

Kategorije: paint, flooring, furniture, lighting, bathroom, kitchen, decor
Za vsako kategorijo generiraj 1-3 specifične iskalne poizvedbe v slovenščini.`;

export async function determineSearchIntent(
  input: QuestionnaireInput,
  openai: OpenAI
): Promise<SearchIntent> {
  const userPrompt = `Prevedi te preference v iskalne poizvedbe:

Lokacija: ${input.location?.address || "N/A"}
Notranji slog: ${input.interiorStyle || "N/A"}
Material: ${input.materialGrade || "N/A"}
Pohištvo: ${input.furnitureStyle || "N/A"}
Nakupovalne preference: ${JSON.stringify(input.shoppingPreferences || {})}
Posebne zahteve: ${JSON.stringify(input.specialRequirements || {})}

Generiraj iskalne poizvedbe v slovenščini za vse relevantne kategorije.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1000,
    response_format: { type: "json_object" },
  });

  const response = completion.choices[0]?.message?.content;
  if (!response) {
    throw new Error("No response from intent analysis");
  }

  const parsed = JSON.parse(response);
  
  // Validate structure
  if (!parsed.categories || typeof parsed.categories !== "object") {
    throw new Error("Invalid intent structure: missing categories");
  }

  return {
    categories: parsed.categories,
    language: "sl",
    country: "si",
  };
}
