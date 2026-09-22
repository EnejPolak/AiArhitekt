import type { ProductConcept } from "../locales/types";
import type { SearchLocale } from "../locales/types";
import { combinedStyleQueryKey } from "./profiles";
import type { CanonicalStyleId } from "./types";

/** Feminine adjective forms for feminine nouns (miza, garnitura, svetilka). */
const STYLE_MODIFIER_FEMININE: Partial<Record<CanonicalStyleId, string>> = {
  modern: "moderna",
  scandinavian: "skandinavska",
  luxury: "elegantna",
  minimal: "minimalistična",
  rustic: "rustikalna",
};

/** Masculine adjective forms for masculine nouns (stol). */
const STYLE_MODIFIER_MASCULINE: Partial<Record<CanonicalStyleId, string>> = {
  modern: "moderen",
  scandinavian: "skandinavski",
  luxury: "eleganten",
  minimal: "minimalističen",
  rustic: "rustikalen",
};

const FURNITURE_STYLE_CONCEPTS = new Set<ProductConcept>([
  "desk",
  "gaming_chair",
  "office_chair",
  "reading_chair",
  "dining_chair",
  "chair",
  "sofa",
  "coffee_table",
  "dining_table",
  "bed",
  "bedside",
  "wardrobe",
  "storage",
  "tv_console",
  "rug",
  "lighting",
  "ceiling_light",
  "pendant_light",
  "floor_lamp",
  "table_lamp",
  "wall_light",
]);

const MASCULINE_STYLE_CONCEPTS = new Set<ProductConcept>([
  "gaming_chair",
  "office_chair",
  "reading_chair",
  "dining_chair",
  "chair",
]);

/** Pick ONE style modifier for strict Level 1 retrieval. */
function pickPrimaryStyleModifier(
  styles: CanonicalStyleId[],
  locale: SearchLocale,
  concept: ProductConcept
): string {
  if (styles.length === 0) return "";

  const priority: CanonicalStyleId[] = ["minimal", "modern", "luxury", "scandinavian", "rustic"];
  const chosen =
    priority.find((id) => styles.includes(id)) ?? styles[0] ?? "minimal";

  if (locale === "en") {
    const enMap: Partial<Record<CanonicalStyleId, string>> = {
      minimal: "minimalist",
      modern: "modern",
      luxury: "elegant",
      scandinavian: "scandinavian",
      rustic: "rustic",
    };
    return enMap[chosen] ?? chosen;
  }

  const isMasculine = MASCULINE_STYLE_CONCEPTS.has(concept);
  const map = isMasculine ? STYLE_MODIFIER_MASCULINE : STYLE_MODIFIER_FEMININE;
  return map[chosen] ?? "";
}

export function styleQueryModifiers(
  styles: CanonicalStyleId[],
  locale: SearchLocale,
  concept: ProductConcept
): [string, string] {
  if (styles.length === 0 || !FURNITURE_STYLE_CONCEPTS.has(concept)) {
    return ["", ""];
  }

  const combinedKey = combinedStyleQueryKey(styles);
  if (combinedKey && styles.length >= 2) {
    const modifier = pickPrimaryStyleModifier(styles, locale, concept);
    return [modifier, ""];
  }

  const modifier = pickPrimaryStyleModifier(styles, locale, concept);
  return [modifier, ""];
}

export function applyStyleQueryModifier(baseQuery: string, modifier: string): string {
  const base = baseQuery.trim();
  const mod = modifier.trim();
  if (!mod) return base;
  if (!base) return mod;
  if (normalizeContains(base, mod)) return base;
  return `${mod} ${base}`.replace(/\s+/g, " ").trim();
}

function normalizeContains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Style-aware localized furniture queries (max 3 levels preserved by caller).
 * Level 1 = one natural style-aware query, Level 2 = plain localized subtype, Level 3 = English fallback.
 */
export function buildStyleAwareFurnitureQueries(
  baseQueries: string[],
  styles: CanonicalStyleId[],
  locale: SearchLocale,
  concept: ProductConcept
): string[] {
  if (styles.length === 0 || baseQueries.length === 0) return baseQueries;

  const [level0Mod] = styleQueryModifiers(styles, locale, concept);
  const primaryBase = baseQueries[0] ?? "";

  const level0 = applyStyleQueryModifier(primaryBase, level0Mod);
  const level1 = primaryBase;

  if (styles.length === 0) {
    return baseQueries.filter(Boolean);
  }

  return [level0, level1].filter(Boolean);
}
