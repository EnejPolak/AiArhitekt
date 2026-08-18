/**
 * Deterministic retail-category taxonomy for Places D.
 * Maps resolved shopping requirements → nearby store search categories.
 * Category phrases only — never retailer brand names.
 */

export const MAX_STORE_DISCOVERY_CATEGORIES = 6;

export const RETAIL_CATEGORY_IDS = [
  "furniture",
  "paint",
  "flooring",
  "lighting",
  "bathroom",
  "hardware",
  "decor",
  "electrical",
] as const;

export type RetailCategoryId = (typeof RETAIL_CATEGORY_IDS)[number];

export type RetailCategoryDefinition = {
  id: RetailCategoryId;
  googleTypes: string[];
  sl: string;
  en: string;
  aliases: string[];
};

/**
 * Domain-independent home/renovation retail categories.
 * flooring includes tile/marble/ceramic floor needs (one Places group, not two).
 */
export const RETAIL_CATEGORY_DEFINITIONS: Record<RetailCategoryId, RetailCategoryDefinition> = {
  furniture: {
    id: "furniture",
    googleTypes: ["furniture_store"],
    sl: "pohištvo",
    en: "furniture store",
    aliases: [
      "furniture",
      "pohištvo",
      "pohistvo",
      "chair",
      "desk",
      "sofa",
      "table",
      "bed",
      "wardrobe",
      "shelf",
      "office chair",
      "computer desk",
      "coffee table",
      "stol",
      "miza",
      "omara",
      "postelja",
      "sedež",
      "workstation",
    ],
  },
  paint: {
    id: "paint",
    googleTypes: ["hardware_store"],
    sl: "notranje barve",
    en: "paint store",
    aliases: [
      "paint",
      "barve",
      "primer",
      "wall finish",
      "wall paint",
      "interior wall paint",
      "premaz",
      "lazura",
      "coating",
    ],
  },
  flooring: {
    id: "flooring",
    googleTypes: [],
    sl: "talne obloge keramika",
    en: "flooring tile store",
    aliases: [
      "flooring",
      "floor",
      "marble",
      "tile",
      "tiles",
      "laminat",
      "vinil",
      "parket",
      "ploščice",
      "ploscice",
      "keramika",
      "ceramic",
      "talne obloge",
      "floor tiles",
    ],
  },
  lighting: {
    id: "lighting",
    googleTypes: ["lighting_store"],
    sl: "svetila",
    en: "lighting store",
    aliases: ["lighting", "lamp", "svetila", "luč", "luci", "led panel", "razsvetljava"],
  },
  bathroom: {
    id: "bathroom",
    googleTypes: [],
    sl: "kopalnica sanitarna",
    en: "bathroom store",
    aliases: ["bathroom", "sanitarna", "kopalnica", "faucet", "toilet", "umivalnik"],
  },
  hardware: {
    id: "hardware",
    googleTypes: ["hardware_store"],
    sl: "železnina",
    en: "hardware store",
    aliases: ["hardware", "diy", "železnina", "zeleznina", "orodje", "tool", "gradbeni"],
  },
  decor: {
    id: "decor",
    googleTypes: ["home_goods_store"],
    sl: "dekoracija",
    en: "home decor store",
    aliases: ["decor", "dekoracija", "tekstil", "curtain", "zavese", "rug", "tepih"],
  },
  electrical: {
    id: "electrical",
    googleTypes: ["lighting_store"],
    sl: "elektrika",
    en: "electrical store",
    aliases: ["electrical", "elektrika", "outlet", "switch", "wiring"],
  },
};

const MATCH_PRIORITY: RetailCategoryId[] = [
  "lighting",
  "bathroom",
  "flooring",
  "paint",
  "furniture",
  "decor",
  "electrical",
  "hardware",
];

export function isRetailCategoryId(value: string): value is RetailCategoryId {
  return (RETAIL_CATEGORY_IDS as readonly string[]).includes(value);
}

export function normalizeRequirementText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function requirementToRetailCategory(itemSpec: string): RetailCategoryId {
  const normalized = normalizeRequirementText(itemSpec);
  if (!normalized) return "hardware";
  for (const id of MATCH_PRIORITY) {
    const def = RETAIL_CATEGORY_DEFINITIONS[id];
    if (def.aliases.some((alias) => normalized.includes(alias))) return id;
  }
  return "hardware";
}

export type StoreDiscoveryQuery =
  | {
      kind: "keyword";
      keyword: string;
      language: "sl";
      categories: RetailCategoryId[];
    }
  | {
      kind: "type";
      type: string;
      categories: RetailCategoryId[];
    };

export type StoreDiscoveryPlan = {
  categories: RetailCategoryId[];
  queries: StoreDiscoveryQuery[];
  requirementCategories: Array<{ itemSpec: string; category: RetailCategoryId }>;
};

export type StoreDiscoveryRequirementInput =
  | string
  | { itemSpec?: string | null; queryPlan?: string[] | null };

function requirementTexts(input: StoreDiscoveryRequirementInput): string[] {
  if (typeof input === "string") return [input];
  const texts = [input.itemSpec, ...(input.queryPlan ?? [])].filter(
    (value): value is string => Boolean(value && value.trim())
  );
  return texts.length > 0 ? texts : [""];
}

/**
 * Deduped, capped Places query plan from resolved shopping requirements.
 * Chair + desk → one furniture group. Two paints → one paint group.
 */
export function buildStoreDiscoveryPlan(
  requirements: StoreDiscoveryRequirementInput[]
): StoreDiscoveryPlan {
  const requirementCategories: Array<{ itemSpec: string; category: RetailCategoryId }> = [];
  const categoryOrder: RetailCategoryId[] = [];

  for (const raw of requirements) {
    const texts = requirementTexts(raw);
    const itemSpec = typeof raw === "string" ? raw : raw.itemSpec ?? texts[0] ?? "";
    const category = requirementToRetailCategory(texts.join(" "));
    requirementCategories.push({ itemSpec, category });
    if (!categoryOrder.includes(category)) categoryOrder.push(category);
  }

  const categories = categoryOrder.slice(0, MAX_STORE_DISCOVERY_CATEGORIES);
  const keywordByPhrase = new Map<string, StoreDiscoveryQuery & { kind: "keyword" }>();
  const typeById = new Map<string, StoreDiscoveryQuery & { kind: "type" }>();

  for (const id of categories) {
    const def = RETAIL_CATEGORY_DEFINITIONS[id];
    const existingKeyword = keywordByPhrase.get(def.sl);
    if (existingKeyword) {
      if (!existingKeyword.categories.includes(id)) existingKeyword.categories.push(id);
    } else {
      keywordByPhrase.set(def.sl, {
        kind: "keyword",
        keyword: def.sl,
        language: "sl",
        categories: [id],
      });
    }
    for (const type of def.googleTypes) {
      const existingType = typeById.get(type);
      if (existingType) {
        if (!existingType.categories.includes(id)) existingType.categories.push(id);
      } else {
        typeById.set(type, { kind: "type", type, categories: [id] });
      }
    }
  }

  return {
    categories,
    queries: [...keywordByPhrase.values(), ...typeById.values()],
    requirementCategories,
  };
}

export function defaultStoreDiscoveryPlan(): StoreDiscoveryPlan {
  return buildStoreDiscoveryPlan(
    RETAIL_CATEGORY_IDS.slice(0, MAX_STORE_DISCOVERY_CATEGORIES).map((id) => id)
  );
}
