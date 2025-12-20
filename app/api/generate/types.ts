/**
 * ============================================
 * SHARED TYPES
 * ============================================
 * 
 * Centralized TypeScript definitions for the generate pipeline.
 */

/**
 * Input from frontend questionnaire
 */
export interface QuestionnaireInput {
  location: {
    address: string;
    radius: number;
    useGeolocation: boolean;
  } | null;
  projectType: {
    type: "new-construction" | "renovation" | "extension" | null;
    renovationCondition?: "poor" | "medium" | "good" | null;
  } | null;
  interiorStyle: string | null;
  materialGrade: "budget" | "mid-range" | "premium" | null;
  furnitureStyle: string | null;
  shoppingPreferences: {
    flooring?: "local" | "online" | "mixed" | "inspiration_only";
    paint?: "local" | "online" | "mixed" | "inspiration_only";
    lighting?: "local" | "online" | "mixed" | "inspiration_only";
    kitchen?: "local" | "online" | "mixed" | "inspiration_only";
    bathroom?: "local" | "online" | "mixed" | "inspiration_only";
    furniture?: "local" | "online" | "mixed" | "inspiration_only";
    decor?: "local" | "online" | "mixed" | "inspiration_only";
  } | null;
  uploads?: {
    floorPlan?: string; // base64 or URL
    photos?: string[];
  } | null;
  specialRequirements?: {
    colors?: string;
    furniture?: string;
    flooring?: string;
  } | null;
}

/**
 * Output from intent.ts (ChatGPT #1)
 */
export interface SearchIntent {
  categories: {
    [category: string]: string[]; // category -> array of search queries
  };
  language: "sl";
  country: "si";
}

/**
 * Raw result from SerpAPI
 */
export interface SerpAPIResult {
  title: string;
  link: string;
  snippet?: string;
  source?: string;
}

/**
 * Verified product from SerpAPI (after filtering)
 */
export interface VerifiedProduct {
  title: string;
  link: string;
  snippet?: string;
  source: string;
  category: string;
  query: string; // original search query that found this
}

/**
 * Output from curate.ts (ChatGPT #2)
 */
export interface CuratedProduct {
  category: string;
  name: string;
  store: string;
  price: string;
  link: string; // MUST be from SerpAPI, never modified
  justification: string; // why this product was chosen
}

export interface CurationResult {
  products: CuratedProduct[];
  summary: string; // Slovenian explanation
  renderPrompt: string;
  negativePrompt: string;
}

/**
 * Store location for map
 */
export interface StoreLocation {
  store: string;
  address: string;
  lat: number;
  lng: number;
}

/**
 * Final API response
 */
export interface GenerateResponse {
  products: CuratedProduct[];
  summary: string;
  renderImage: string; // URL from Replicate
  storesMap: StoreLocation[];
}
