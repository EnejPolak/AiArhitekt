import { parseDistinctiveRequirements } from "./distinctiveRequirements";
import type { RequirementLists } from "./matchPolicy";

export type RequirementImportance = "identity" | "hard" | "soft";

export type IdentityRequirement = {
  id: string;
  label: string;
  tokens: string[];
  importance: RequirementImportance;
};

export type ProductIdentity = {
  coreCategory: string;
  coreCategoryTokens: string[];
  exclusionTokens: string[];
  definingRequirements: IdentityRequirement[];
};

const STYLE_WORDS =
  /\b(modern|minimalist|scandinavian|industrial|rustic|classic|contemporary|vintage|designer)\b/gi;
const NOISE_WORDS =
  /\b(approx(?:imately)?|around|roughly|exactly|exact|precisely|total|wide|width|height|diameter|max(?:imum)?|under|budget)\b/gi;
const DIMENSION_PATTERN = /\b\d+(?:[.,]\d+)?\s*(?:cm|mm|m|m2)\b/gi;
const MAX_PRICE_PATTERN = /\bmax(?:imum)?\s*\d+(?:[.,]\d+)?\s*(?:eur|€)(?:\s*\/\s*m2)?\b/gi;

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; label: string; tokens: string[]; exclusions?: string[] }> = [
  { pattern: /\bpendant\s+lamp\b/i, label: "pendant lamp", tokens: ["pendant", "lamp", "viseca", "svetilka", "visilka"] },
  { pattern: /\bceiling\s+(?:light|lamp)\b/i, label: "ceiling light", tokens: ["ceiling", "stropna", "svetilka", "plafon"] },
  { pattern: /\bkitchen\s+sink\b/i, label: "kitchen sink", tokens: ["kitchen", "sink", "korito", "pomival"] },
  { pattern: /\bbathroom\s+sink\b/i, label: "bathroom sink", tokens: ["bathroom", "sink", "korito", "umivalnik"] },
  { pattern: /\bdining\s+table\b/i, label: "dining table", tokens: ["dining", "table", "miza", "jedilna"] },
  { pattern: /\bbathroom\s+cabinet\b/i, label: "bathroom cabinet", tokens: ["bathroom", "cabinet", "omara", "kopal"] },
  {
    pattern: /\bheated\s+(?:floor|flooring)\s+system\b/i,
    label: "heated floor system",
    tokens: ["heated", "floor", "system", "ogrevanje", "talno", "ogrevalni", "sistem"],
    exclusions: ["mat", "folija", "film", "kabel", "mreza", "mreža", "mesh", "cable", "foil"],
  },
  {
    pattern: /\b(?:floor\s+)?heat(?:ing|ed)\s+(?:mat|system|foil)\b/i,
    label: "floor heating",
    tokens: ["floor", "heating", "heated", "ogrevanje", "talno", "ogrev"],
    exclusions: ["shelf", "polica"],
  },
  { pattern: /\b(?:floor(?:ing)?|laminate|vinyl\s+floor(?:ing)?)\b/i, label: "flooring", tokens: ["floor", "laminate", "vinyl", "talne", "obloge", "laminat"] },
  { pattern: /\b(?:wall\s+)?paint\b/i, label: "paint", tokens: ["paint", "barva", "lak", "barva"] },
  { pattern: /\b(?:area\s+)?rug\b/i, label: "rug", tokens: ["rug", "preproga"] },
  { pattern: /\bsofa\b/i, label: "sofa", tokens: ["sofa", "kavc", "sedezna", "kavc"] },
  { pattern: /\bwardrobe\b/i, label: "wardrobe", tokens: ["wardrobe", "omara", "garderoba"] },
  {
    pattern: /\btowel\s+rail\b/i,
    label: "towel rail",
    tokens: ["towel", "rail", "radiator", "ogrev", "brv", "handduk"],
    exclusions: ["shelf", "polica", "rack shelf", "omarica"],
  },
  { pattern: /\b(?:interior\s+)?door\b/i, label: "door", tokens: ["door", "vrata", "sobna"] },
  { pattern: /\bfaucet\b/i, label: "faucet", tokens: ["faucet", "pipa", "armatura", "mesalna"] },
  { pattern: /\bshower\s+tray\b/i, label: "shower tray", tokens: ["shower", "tray", "tacka", "kadic", "tus"] },
  { pattern: /\bvase\b/i, label: "vase", tokens: ["vase", "vaza"] },
  { pattern: /\btiles?\b/i, label: "tiles", tokens: ["tile", "ploscice", "ploscica"] },
];

const SOLID_PATTERN = /\bsolid\s+([a-z-]+)/gi;
const IDENTITY_MATERIAL_BEFORE_NOUN =
  /\b(marble|granite|diamond|titanium|brass|copper)\b(?=.*\b(system|sink|sofa|table|floor|tile|lamp|rail|cabinet|door)\b)/gi;

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

function tokenizePhrase(phrase: string): string[] {
  return uniqueTokens(
    phrase
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 3 || ["rug", "tap", "led"].includes(token))
  );
}

function stripRequestNoise(requestedItem: string): string {
  return requestedItem
    .replace(MAX_PRICE_PATTERN, " ")
    .replace(DIMENSION_PATTERN, " ")
    .replace(STYLE_WORDS, " ")
    .replace(NOISE_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCategoryPattern(requestedItem: string) {
  return CATEGORY_PATTERNS.find((entry) => entry.pattern.test(requestedItem)) ?? null;
}

export function parseProductIdentity(requestedItem: string): ProductIdentity {
  const matched = findCategoryPattern(requestedItem);
  const definingRequirements: IdentityRequirement[] = [];

  for (const match of requestedItem.matchAll(SOLID_PATTERN)) {
    const material = match[1]?.trim();
    if (!material) continue;
    definingRequirements.push({
      id: `identity:solid-${material}`,
      label: `solid ${material}`,
      tokens: uniqueTokens([material, `solid ${material}`, material.replace(/-/g, " ")]),
      importance: "identity",
    });
  }

  for (const match of requestedItem.matchAll(IDENTITY_MATERIAL_BEFORE_NOUN)) {
    const material = match[1]?.toLowerCase();
    if (!material) continue;
    definingRequirements.push({
      id: `identity:material-${material}`,
      label: material,
      tokens: uniqueTokens([material, material === "marble" ? "marmor" : material]),
      importance: "identity",
    });
  }

  for (const entry of parseDistinctiveRequirements(requestedItem).filter((item) => item.hard)) {
    definingRequirements.push({
      id: entry.id,
      label: entry.label,
      tokens: entry.tokens,
      importance: "identity",
    });
  }

  if (matched) {
    return {
      coreCategory: matched.label,
      coreCategoryTokens: matched.tokens,
      exclusionTokens: matched.exclusions ?? [],
      definingRequirements,
    };
  }

  const phrase = stripRequestNoise(requestedItem);
  const phraseTokens = tokenizePhrase(phrase);
  const identityMaterials = new Set(
    definingRequirements.flatMap((req) => req.tokens.filter((token) => token.length >= 4))
  );
  const coreTokens = phraseTokens.filter((token) => !identityMaterials.has(token));

  return {
    coreCategory: phrase || requestedItem.trim(),
    coreCategoryTokens: coreTokens.length > 0 ? coreTokens : phraseTokens,
    exclusionTokens: [],
    definingRequirements,
  };
}

export function categoryEvidenceHaystack(input: {
  productName: string;
  evidenceText?: string;
  specifications?: Record<string, string | number | boolean | null>;
}): string {
  const parts = [
    input.productName,
    input.evidenceText ?? "",
    Object.entries(input.specifications ?? {})
      .map(([key, value]) => `${key} ${value ?? ""}`)
      .join(" "),
  ];
  return parts.join(" ").toLowerCase();
}

function tokenHits(haystack: string, tokens: string[]): number {
  return tokens.filter((token) => token.length >= 3 && haystack.includes(token)).length;
}

function hasFalseFriendMaterial(token: string, haystack: string): boolean {
  if (token !== "oak") return false;
  return /\b(oak-look|oak look|hrastov? izgled|imitacija hrasta|dekor hrast)\b/i.test(haystack);
}

const COMPONENT_PRODUCT_PATTERN =
  /\b(?:mat|mesh|mrež|mrez|folij|film|kabel|cable|grelna\s+mrež|heating\s+mat|ogrevna\s+mrež)\b/i;
const COMPATIBILITY_CONTEXT_PATTERN =
  /\b(?:under|below|over|compatible|compatibility|installation|includes|including|for use with|primerno za|pod)\b/i;

function normalizeHaystack(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function verifyCoreCategoryInEvidence(
  identity: ProductIdentity,
  evidenceHaystack: string
): boolean {
  const haystack = normalizeHaystack(evidenceHaystack);

  if (identity.exclusionTokens.some((token) => haystack.includes(normalizeHaystack(token)))) {
    return false;
  }

  if (/\bsystem\b/i.test(identity.coreCategory)) {
    if (COMPONENT_PRODUCT_PATTERN.test(haystack)) {
      return false;
    }
    if (!haystack.includes("system") && !haystack.includes("sistem")) {
      return false;
    }
  }

  const significantTokens = identity.coreCategoryTokens.filter((token) => token.length >= 3);
  if (significantTokens.length === 0) return false;

  const labelTokens = tokenizePhrase(identity.coreCategory);
  const categoryTokens = uniqueTokens([...labelTokens, ...significantTokens]);
  const hits = tokenHits(haystack, categoryTokens);
  if (hits === 0) return false;

  const requiredHits =
    labelTokens.length >= 3 ? 2 : 1;
  return hits >= requiredHits;
}

export function identityRequirementStatus(
  requirement: IdentityRequirement,
  lists: RequirementLists,
  evidenceHaystack: string
): "confirmed" | "unknown" | "unmet" {
  const haystack = normalizeHaystack(evidenceHaystack);

  for (const entry of lists.unmetRequirements) {
    if (requirement.tokens.some((token) => entry.toLowerCase().includes(token))) return "unmet";
  }

  for (const entry of lists.matchedRequirements) {
    if (requirement.tokens.some((token) => token.length >= 3 && entry.toLowerCase().includes(token))) {
      if (requirement.label.startsWith("solid ")) {
        const material = requirement.label.replace(/^solid\s+/, "");
        if (hasFalseFriendMaterial(material, haystack)) return "unknown";
      }
      if (
        requirement.importance === "identity" &&
        COMPATIBILITY_CONTEXT_PATTERN.test(entry) &&
        !requirement.tokens.some((token) => token.length >= 3 && haystack.includes(token))
      ) {
        return "unknown";
      }
      if (requirement.tokens.some((token) => token.length >= 3 && haystack.includes(token))) {
        return "confirmed";
      }
    }
  }

  if (
    requirement.tokens.some((token) => token.length >= 3 && haystack.includes(token)) &&
    !hasFalseFriendMaterial(requirement.label.replace(/^solid\s+/, ""), haystack)
  ) {
    return "confirmed";
  }

  for (const entry of lists.unknownRequirements) {
    if (!requirement.tokens.some((token) => entry.toLowerCase().includes(token))) continue;
    if (
      requirement.importance === "identity" &&
      COMPATIBILITY_CONTEXT_PATTERN.test(entry) &&
      !requirement.tokens.some((token) => token.length >= 3 && haystack.includes(token))
    ) {
      return "unknown";
    }
    return "unknown";
  }

  return "unknown";
}

export function verifyIdentityRequirements(input: {
  requestedItem: string;
  lists: RequirementLists;
  evidenceHaystack: string;
}): { verified: boolean; unresolved: string[] } {
  const identity = parseProductIdentity(input.requestedItem);
  const unresolved: string[] = [];

  if (!verifyCoreCategoryInEvidence(identity, input.evidenceHaystack)) {
    unresolved.push(identity.coreCategory);
  }

  for (const requirement of identity.definingRequirements) {
    if (requirement.importance !== "identity") continue;
    const status = identityRequirementStatus(requirement, input.lists, input.evidenceHaystack);
    if (status !== "confirmed") unresolved.push(requirement.label);
  }

  return { verified: unresolved.length === 0, unresolved };
}
