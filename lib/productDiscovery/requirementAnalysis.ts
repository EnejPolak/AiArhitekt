import {
  extractMaxPriceEur,
  type RequirementLists,
  usesApproximateLanguage,
  usesExactLanguage,
} from "./matchPolicy";
import { parseDistinctiveRequirements } from "./distinctiveRequirements";
import {
  categoryEvidenceHaystack,
  parseProductIdentity,
  verifyCoreCategoryInEvidence,
} from "./productIdentity";

export type ParsedRequirement = {
  id: string;
  label: string;
  weight: number;
  hard: boolean;
  tokens: string[];
};

const MATERIAL_TOKENS =
  /\b(metal|steel|stainless|inox|oak|wood|laminate|vinyl|marble|ceramic|plastic|fabric|leather|chrome|brass|copper|glass|gold|silver|jute|wool|concrete|granite|bamboo|rattan)\b/gi;
const COLOR_TOKENS =
  /\b(black|white|grey|gray|beige|brown|oak|chrome|anthracite|matte|gloss|gold|golden|silver|crna|bela|siva|rdeca|zelena|modra)\b/gi;
const STYLE_TOKENS = /\b(scandinavian|modern|minimalist|industrial|rustic|classic|contemporary|vintage)\b/gi;
const DIMENSION_PATTERN = /\b(\d+(?:[.,]\d+)?)\s*(cm|mm|m)\b/gi;
const CATEGORY_PATTERNS: Array<{ pattern: RegExp; label: string; tokens: string[] }> = [
  { pattern: /\bpendant\s+lamp\b/i, label: "pendant lamp", tokens: ["pendant", "lamp", "viseca", "svetilka"] },
  { pattern: /\bceiling\s+(?:light|lamp)\b/i, label: "ceiling light", tokens: ["ceiling", "stropna", "svetilka"] },
  { pattern: /\bkitchen\s+sink\b/i, label: "kitchen sink", tokens: ["kitchen", "sink", "korito", "pomival"] },
  { pattern: /\bbathroom\s+sink\b/i, label: "bathroom sink", tokens: ["bathroom", "sink", "korito", "umivalnik"] },
  { pattern: /\bdining\s+table\b/i, label: "dining table", tokens: ["dining", "table", "miza"] },
  { pattern: /\bbathroom\s+cabinet\b/i, label: "bathroom cabinet", tokens: ["bathroom", "cabinet", "omara", "kopal"] },
  { pattern: /\b(?:floor(?:ing)?|laminate|vinyl\s+floor(?:ing)?)\b/i, label: "flooring", tokens: ["floor", "laminate", "vinyl", "talne", "obloge"] },
  { pattern: /\b(?:wall\s+)?paint\b/i, label: "paint", tokens: ["paint", "barva", "lak"] },
  { pattern: /\b(?:area\s+)?rug\b/i, label: "rug", tokens: ["rug", "preproga"] },
  { pattern: /\bsofa\b/i, label: "sofa", tokens: ["sofa", "kavc", "sedezna"] },
  { pattern: /\bwardrobe\b/i, label: "wardrobe", tokens: ["wardrobe", "omara", "garderoba"] },
  { pattern: /\btowel\s+rail\b/i, label: "towel rail", tokens: ["towel", "rail", "radiator", "ogrev"] },
  { pattern: /\b(?:interior\s+)?door\b/i, label: "door", tokens: ["door", "vrata"] },
  { pattern: /\bfaucet\b/i, label: "faucet", tokens: ["faucet", "pipa", "pip"] },
  { pattern: /\bshower\s+tray\b/i, label: "shower tray", tokens: ["shower", "tray", "tacka", "kadic"] },
  { pattern: /\bvase\b/i, label: "vase", tokens: ["vase", "vaza"] },
  { pattern: /\btiles?\b/i, label: "tiles", tokens: ["tile", "ploscice"] },
];

const IMPOSSIBLE_MARKERS = [
  /\bsolid\s+gold\b/i,
  /\bgold\s+floor\b/i,
  /\bdiamond\s+(?:floor|tile)\b/i,
  /\bunicorn\b/i,
];

function uniqueTokens(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const token = value.toLowerCase().trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function collectRegexTokens(text: string, pattern: RegExp): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[0]) tokens.push(match[0].toLowerCase());
  }
  return tokens;
}

export function isImpossibleRequest(requestedItem: string): boolean {
  return IMPOSSIBLE_MARKERS.some((pattern) => pattern.test(requestedItem));
}

export function parseRequestedRequirements(requestedItem: string): ParsedRequirement[] {
  const requirements: ParsedRequirement[] = [];
  const lower = requestedItem.toLowerCase();

  for (const category of CATEGORY_PATTERNS) {
    if (category.pattern.test(requestedItem)) {
      requirements.push({
        id: `category:${category.label}`,
        label: category.label,
        weight: 2,
        hard: true,
        tokens: category.tokens,
      });
      break;
    }
  }

  for (const material of collectRegexTokens(requestedItem, MATERIAL_TOKENS)) {
    // Bare gold/silver adjectives are normally appearance/color, not identity materials.
    if (
      (material === "gold" || material === "silver") &&
      !/\b(solid|made\s+of|real|genuine|pure|24k|18k|14k)\b/i.test(requestedItem) &&
      !new RegExp(`\\b${material}\\s+material\\b`, "i").test(requestedItem)
    ) {
      continue;
    }
    requirements.push({
      id: `material:${material}`,
      label: material,
      weight: 2,
      hard: true,
      tokens: [material, "material", "inox", "nerjave"],
    });
  }

  for (const color of collectRegexTokens(requestedItem, COLOR_TOKENS)) {
    requirements.push({
      id: `color:${color}`,
      label: color,
      weight: 1,
      hard: false,
      tokens: [color, "color", "barva"],
    });
  }

  for (const style of collectRegexTokens(requestedItem, STYLE_TOKENS)) {
    requirements.push({
      id: `style:${style}`,
      label: style,
      weight: 1,
      hard: false,
      tokens: [style, "style", "stil"],
    });
  }

  for (const match of requestedItem.matchAll(DIMENSION_PATTERN)) {
    const value = match[1]?.replace(",", ".");
    const unit = match[2]?.toLowerCase();
    if (!value || !unit) continue;
    const exact = usesExactLanguage(requestedItem);
    requirements.push({
      id: `dimension:${value}${unit}`,
      label: `${value} ${unit}`,
      weight: exact ? 2 : 1,
      hard: exact,
      tokens: [value, unit, "cm", "dimension", "width", "diameter", "size", "sirina", "premer"],
    });
  }

  const maxPrice = extractMaxPriceEur(requestedItem);
  if (maxPrice != null) {
    requirements.push({
      id: `budget:max${maxPrice}`,
      label: `max ${maxPrice} EUR`,
      weight: 2,
      hard: true,
      tokens: ["max", "budget", "price", "eur", String(maxPrice), "under"],
    });
  }

  for (const entry of parseDistinctiveRequirements(requestedItem)) {
    requirements.push({
      id: entry.id,
      label: entry.label,
      weight: entry.weight,
      hard: entry.hard,
      tokens: entry.tokens,
    });
  }

  if (requirements.length === 0) {
    const nouns = lower
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 4)
      .slice(0, 4);
    requirements.push({
      id: "category:generic",
      label: "product category",
      weight: 2,
      hard: true,
      tokens: nouns,
    });
  }

  const seen = new Set<string>();
  return requirements.filter((req) => {
    if (seen.has(req.id)) return false;
    seen.add(req.id);
    return true;
  });
}

function listEntryMatchesTokens(entry: string, tokens: string[]): boolean {
  const haystack = entry.toLowerCase();
  return tokens.some((token) => token.length >= 3 && haystack.includes(token));
}

export function requirementStatus(
  requirement: ParsedRequirement,
  lists: RequirementLists
): "confirmed" | "unknown" | "unmet" {
  for (const entry of lists.unmetRequirements) {
    if (listEntryMatchesTokens(entry, requirement.tokens) || listEntryMatchesTokens(entry, [requirement.label])) {
      return "unmet";
    }
  }
  for (const entry of lists.matchedRequirements) {
    if (listEntryMatchesTokens(entry, requirement.tokens) || listEntryMatchesTokens(entry, [requirement.label])) {
      return "confirmed";
    }
  }
  for (const entry of lists.unknownRequirements) {
    if (listEntryMatchesTokens(entry, requirement.tokens) || listEntryMatchesTokens(entry, [requirement.label])) {
      return "unknown";
    }
  }
  return "unknown";
}

export function computeRequirementCoverage(
  requestedItem: string,
  lists: RequirementLists
): number {
  const requirements = parseRequestedRequirements(requestedItem);
  if (requirements.length === 0) return 0;

  let totalWeight = 0;
  let confirmedWeight = 0;
  for (const requirement of requirements) {
    totalWeight += requirement.weight;
    if (requirementStatus(requirement, lists) === "confirmed") {
      confirmedWeight += requirement.weight;
    }
  }
  if (totalWeight === 0) return 0;
  return confirmedWeight / totalWeight;
}

export function isCategoryVerified(
  requestedItem: string,
  productName: string,
  evidenceText?: string,
  specifications?: Record<string, string | number | boolean | null>
): boolean {
  const identity = parseProductIdentity(requestedItem);
  const haystack = categoryEvidenceHaystack({
    productName,
    evidenceText,
    specifications,
    includeModelSpecifications: false,
  });
  return verifyCoreCategoryInEvidence(identity, haystack);
}

export function countCriticalUnknowns(requestedItem: string, lists: RequirementLists): number {
  const requirements = parseRequestedRequirements(requestedItem).filter((req) => req.hard || req.weight >= 2);
  let count = 0;
  for (const requirement of requirements) {
    if (requirementStatus(requirement, lists) === "unknown") count += 1;
  }
  return count;
}

export function hasApproximateDimensionRequest(requestedItem: string): boolean {
  return usesApproximateLanguage(requestedItem) && DIMENSION_PATTERN.test(requestedItem);
}
