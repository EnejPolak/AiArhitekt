/**
 * Shared taxonomy for category-based domain routing (SERP).
 * Stops "each item × every domain"; only route items to domains that match the item category.
 */

/** Taxonomy categories for product SERP (stores). */
export const TAXONOMY_CATEGORIES = [
  "furniture",
  "lighting",
  "bathroom_plumbing",
  "flooring",
  "paint_walls",
  "diy_hardware",
  "decor_textiles",
] as const;

export type TaxonomyCategory = (typeof TAXONOMY_CATEGORIES)[number];

/** Map Google Place types (store) → taxonomy categories. */
export const GOOGLE_TYPE_TO_TAXONOMY: Record<string, TaxonomyCategory[]> = {
  furniture_store: ["furniture"],
  hardware_store: ["diy_hardware"],
  home_goods_store: ["furniture", "decor_textiles"],
  lighting_store: ["lighting"],
  store: [], // too generic; no category
  shopping_mall: [],
  electronics_store: ["lighting"], // LED, electrical
};

/** High-priority rules (checked first) to fix misclassification. */
const HIGH_PRIORITY_LIST: Array<{ test: (n: string) => boolean; category: TaxonomyCategory }> = [
  { test: (n) => /strop|svetilk|osvetlit|žarnic|razsvetl/.test(n), category: "lighting" },
  { test: (n) => /tepih|preprog|zaves|zagrinjal|ogrinjal/.test(n), category: "decor_textiles" },
  { test: (n) => /ogledal/.test(n) && /kopal|umival/.test(n), category: "bathroom_plumbing" },
  { test: (n) => /ogledal/.test(n), category: "decor_textiles" },
  { test: (n) => /ploščic|ploscic|keramic|keramik/.test(n), category: "flooring" },
];

/** Item-spec keyword hints → primary category (Slovenian + English). Bathroom no longer includes ogledal/keramik/ploščic for priority. */
const ITEM_KEYWORDS_TO_CATEGORY: Array<{ keywords: string[]; category: TaxonomyCategory }> = [
  { keywords: ["postelj", "vzmetnic", "omar", "nočn", "polic", "miz", "stol", "sedež", "pohištv", "furniture", "bed", "wardrobe", "shelf", "table", "chair", "sofa"], category: "furniture" },
  { keywords: ["svetil", "luč", "led", "razsvetljav", "lighting", "lamp", "panel"], category: "lighting" },
  { keywords: ["sanitar", "kopalnic", "kopal", "pipe", "bathroom", "faucet", "toilet", "umival"], category: "bathroom_plumbing" },
  { keywords: ["laminat", "vinil", "parket", "taln", "oblog", "flooring", "floor"], category: "flooring" },
  { keywords: ["barv", "sten", "premaz", "lazur", "paint", "wall", "coating"], category: "paint_walls" },
  { keywords: ["gradben", "železnin", "orodj", "hardware", "diy", "tool"], category: "diy_hardware" },
  { keywords: ["tekstil", "dekor", "zaves", "decor", "textile", "curtain"], category: "decor_textiles" },
];

/**
 * Classify an item spec into one taxonomy category (primary). High-priority rules first, then keyword list; fallback "diy_hardware".
 */
export function itemSpecToCategory(itemSpec: string): TaxonomyCategory {
  const normalized = (itemSpec || "").toLowerCase().trim();
  if (!normalized) return "diy_hardware";
  for (const { test, category } of HIGH_PRIORITY_LIST) {
    if (test(normalized)) return category;
  }
  for (const { keywords, category } of ITEM_KEYWORDS_TO_CATEGORY) {
    if (keywords.some((kw) => normalized.includes(kw))) return category;
  }
  return "diy_hardware";
}

/**
 * Map a list of Google Place types (from a store) to taxonomy categories.
 */
export function placeTypesToTaxonomyCategories(types: string[]): TaxonomyCategory[] {
  const out = new Set<TaxonomyCategory>();
  for (const t of types) {
    const cats = GOOGLE_TYPE_TO_TAXONOMY[t.toLowerCase()];
    if (cats) cats.forEach((c) => out.add(c));
  }
  return Array.from(out);
}
