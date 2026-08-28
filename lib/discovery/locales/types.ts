export const SEARCH_LOCALES = ["sl", "en"] as const;

export type SearchLocale = (typeof SEARCH_LOCALES)[number];

export const PRODUCT_CONCEPTS = [
  "gaming_chair",
  "office_chair",
  "chair",
  "desk",
  "sofa",
  "coffee_table",
  "bed",
  "wardrobe",
  "lighting",
  "wall_paint",
  "marble",
  "tiles",
  "laminate",
  "hardwood",
  "flooring",
  "other",
] as const;

export type ProductConcept = (typeof PRODUCT_CONCEPTS)[number];

export type FurnitureQueryContext = {
  concept: ProductConcept;
  category: string;
  constraints: string[];
  monitors: boolean;
  ergonomic: boolean;
  large: boolean;
};

export type MaterialQueryContext = {
  concept: ProductConcept;
  category: string;
  surface: string;
  finishDirection: string | null;
  constraints: string[];
  color: string;
  paintHue?: string | null;
  paintFinish?: string | null;
};
