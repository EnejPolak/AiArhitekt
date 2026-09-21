import { normalizeMatchText } from "@/lib/text/diacritics";
import type { ProductConcept } from "./locales/types";

export type NoteShoppingIntent = {
  concept: ProductConcept;
  category: string;
  constraints: string[];
  matchedPhrase: string;
};

export type NoteKeepSuppression = {
  concept: ProductConcept;
  matchedPhrase: string;
};

type IntentPattern = {
  concept: ProductConcept;
  category: string;
  patterns: RegExp[];
};

const POSITIVE_INTENT_PATTERNS: IntentPattern[] = [
  {
    concept: "gaming_chair",
    category: "gaming chair",
    patterns: [
      /\bgaming\s+chair\b/i,
      /\bgaming\s+stol\b/i,
      /\bigri[cč]arski\s+stol\b/i,
      /\bigralni\s+stol\b/i,
    ],
  },
  {
    concept: "office_chair",
    category: "office chair",
    patterns: [/\boffice\s+chair\b/i, /\bpisarni[sš]ki\s+stol\b/i],
  },
  {
    concept: "reading_chair",
    category: "reading chair",
    patterns: [/\breading\s+chair\b/i, /\baccent\s+chair\b/i, /\bnaslanja[cč]\b/i],
  },
  {
    concept: "rug",
    category: "rug",
    patterns: [/\brug\b/i, /\bcarpet\b/i, /\bpreproga\b/i],
  },
  {
    concept: "dining_table",
    category: "dining table",
    patterns: [/\bdining\s+table\b/i, /\bjedilna\s+miza\b/i],
  },
  {
    concept: "dining_chair",
    category: "dining chair",
    patterns: [/\bdining\s+chairs?\b/i, /\bjediln\w*\s+stol/i],
  },
  {
    concept: "desk",
    category: "computer desk",
    patterns: [
      /\bcomputer\s+desk\b/i,
      /\boffice\s+desk\b/i,
      /\bpisalna\s+miza\b/i,
      /\bra[cč]unalni[sš]ka\s+miza\b/i,
      /\bdesk\b/i,
      /\bmiza\b/i,
    ],
  },
  {
    concept: "sofa",
    category: "sofa",
    patterns: [/\bsofa\b/i, /\bcouch\b/i, /\bkav[cč]\b/i, /\bsede[zž]na\s+garnitura\b/i],
  },
  {
    concept: "coffee_table",
    category: "coffee table",
    patterns: [/\bcoffee\s+table\b/i, /\bklubska\s+miza\b/i],
  },
  {
    concept: "bed",
    category: "bed",
    patterns: [/\bbed\b/i, /\bpostelj[a]?\b/i],
  },
  {
    concept: "wardrobe",
    category: "wardrobe",
    patterns: [/\bwardrobe\b/i, /\bgarderob\w*\b/i, /\bomar[a]?\b/i],
  },
  {
    concept: "lighting",
    category: "lighting",
    patterns: [
      /\blamp\b/i,
      /\blighting\b/i,
      /\blight\s+(?:fixture|fitting)\b/i,
      /\bsvetil\w*\b/i,
    ],
  },
  {
    concept: "chair",
    category: "chair",
    patterns: [/\bchair\b/i, /\bstol\b/i],
  },
];

const KEEP_SUPPRESSION_PATTERNS: Array<{ concept: ProductConcept; patterns: RegExp[] }> = [
  {
    concept: "gaming_chair",
    patterns: [
      /\bkeep\s+(?:my\s+)?(?:current\s+)?(?:gaming\s+)?chair\b/i,
      /\bobdrži\s+.*\bstol\b/i,
      /\bstol\s+že\s+imam\b/i,
      /\balready\s+have\s+a\s+(?:gaming\s+)?chair\b/i,
    ],
  },
  {
    concept: "office_chair",
    patterns: [/\bkeep\s+(?:my\s+)?(?:current\s+)?(?:office\s+)?chair\b/i],
  },
  {
    concept: "chair",
    patterns: [/\bkeep\s+(?:my\s+)?(?:current\s+)?chair\b/i, /\bobdrži\s+.*\bstol\b/i],
  },
  {
    concept: "desk",
    patterns: [
      /\bkeep\s+(?:my\s+)?(?:current\s+)?desk\b/i,
      /\balready\s+have\s+a\s+desk\b/i,
      /\bne\s+menjaj\s+.*\bmiz\b/i,
      /\bobdrži\s+.*\bmiz\b/i,
    ],
  },
  {
    concept: "wardrobe",
    patterns: [/\bkeep\s+(?:my\s+)?(?:current\s+)?wardrobe\b/i, /\bobdrži\s+.*\bomar\b/i, /\bne\s+menjaj\s+.*\bomar\b/i],
  },
  {
    concept: "sofa",
    patterns: [
      /\bkeep\s+(?:my\s+)?(?:current\s+)?sofa\b/i,
      /\bkeep\s+(?:my\s+)?(?:current\s+)?couch\b/i,
      /\bobdrži\s+.*\bkav[cč]\b/i,
    ],
  },
  {
    concept: "rug",
    patterns: [/\bkeep\s+(?:my\s+)?(?:current\s+)?(?:rug|carpet)\b/i],
  },
  {
    concept: "reading_chair",
    patterns: [/\bkeep\s+(?:my\s+)?(?:current\s+)?reading\s+chair\b/i],
  },
  {
    concept: "bed",
    patterns: [/\bkeep\s+(?:my\s+)?(?:current\s+)?bed\b/i, /\bobdrži\s+.*\bpostelj\b/i],
  },
];

const CHAIR_FAMILY: ProductConcept[] = ["gaming_chair", "office_chair", "chair"];
const READING_CHAIR_FAMILY: ProductConcept[] = ["reading_chair", "chair"];
const NEGATIVE_SUPPRESSION_PATTERNS: Array<{ concept: ProductConcept; patterns: RegExp[] }> = [
  { concept: "rug", patterns: [/\bno\s+rug\b/i, /\bno\s+carpet\b/i, /\bdon'?t\s+want\s+a\s+rug\b/i, /\bbrez\s+preproge\b/i] },
  { concept: "sofa", patterns: [/\bno\s+sofa\b/i, /\bno\s+couch\b/i] },
  { concept: "reading_chair", patterns: [/\bno\s+reading\s+chair\b/i] },
];

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "want",
  "need",
  "only",
  "these",
  "three",
  "products",
  "please",
  "also",
  "room",
  "space",
  "feel",
  "feeling",
  "look",
  "make",
]);

export function conceptFamily(concept: ProductConcept): ProductConcept[] {
  if (CHAIR_FAMILY.includes(concept)) return CHAIR_FAMILY;
  if (READING_CHAIR_FAMILY.includes(concept)) return READING_CHAIR_FAMILY;
  if (concept === "desk") return ["desk"];
  if (["marble", "laminate", "hardwood", "tiles", "flooring"].includes(concept)) {
    return ["marble", "laminate", "hardwood", "tiles", "flooring"];
  }
  return [concept];
}

export function extractNegativeSuppressions(notes: string): NoteKeepSuppression[] {
  const trimmed = notes.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const out: NoteKeepSuppression[] = [];
  for (const rule of NEGATIVE_SUPPRESSION_PATTERNS) {
    for (const pattern of rule.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        out.push({ concept: rule.concept, matchedPhrase: match[0] });
        break;
      }
    }
  }
  return out;
}

export function extractKeepSuppressions(notes: string): NoteKeepSuppression[] {
  const folded = normalizeMatchText(notes);
  if (!folded) return [];
  const out: NoteKeepSuppression[] = [];
  for (const rule of KEEP_SUPPRESSION_PATTERNS) {
    for (const pattern of rule.patterns) {
      const match = notes.match(pattern);
      if (match) {
        out.push({ concept: rule.concept, matchedPhrase: match[0] });
        break;
      }
    }
  }
  return out;
}

function normalizeClause(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function isKeepLike(text: string): boolean {
  return (
    /\bkeep\s+(?:my\s+)?(?:current\s+)?/i.test(text) ||
    /\balready\s+have\b/i.test(text) ||
    /\bdon'?t\s+(?:change|replace|buy|need)\b/i.test(text) ||
    /\bne\s+menjaj\b/i.test(text) ||
    /\bobdrži\b/i.test(text)
  );
}

function hasCommerceConstraint(text: string): boolean {
  return (
    /\bmax(?:imum)?\s+\d+(?:[.,]\d+)?\s*(?:€|eur|euros?)?\b/i.test(text) ||
    /\b\d+(?:[.,]\d+)?\s*(?:€|eur|euros?)\b/i.test(text) ||
    /€/.test(text)
  );
}

function hasDimensionConstraint(text: string): boolean {
  return (
    /\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*cm)?/i.test(text) ||
    /\d+(?:[.,]\d+)?\s*(?:cm|mm)\b/i.test(text)
  );
}

function isMoodOnly(text: string): boolean {
  if (hasCommerceConstraint(text) || hasDimensionConstraint(text)) return false;
  const roomFeel = /\b(room|space|interior)\b/i.test(text) && /\b(feel|look|atmosphere|mood|vibe)\b/i.test(text);
  const mood =
    /\b(feel|feeling|atmosphere|mood|vibe|aesthetic|elegant|calm|cozy)\b/i.test(text) &&
    !/\b(need|buy|lamp|chair|desk|table|sofa|bed)\b/i.test(text);
  return roomFeel || mood;
}

function hasLikelyProductNoun(text: string): boolean {
  const words = normalizeMatchText(text)
    .split(" ")
    .map((word) => word.replace(/[^a-z0-9-]/g, ""))
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return words.length > 0;
}

function matchesKnownPattern(text: string): IntentPattern | null {
  for (const rule of POSITIVE_INTENT_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule;
  }
  return null;
}

function isExplicitProductRequest(text: string, fromList: boolean): boolean {
  const clause = normalizeClause(text);
  if (!clause || isKeepLike(clause) || isMoodOnly(clause)) return false;
  if (/\bno\s+(?:rug|carpet|sofa|couch|plants?|artwork|reading\s+chair)\b/i.test(clause)) return false;
  if (hasCommerceConstraint(clause) || hasDimensionConstraint(clause)) return true;
  if (fromList && hasLikelyProductNoun(clause)) return true;
  if (matchesKnownPattern(clause)) return true;
  if (
    /\b(need|want|buy|looking for|find me|get me)\b/i.test(clause) &&
    hasLikelyProductNoun(clause) &&
    !isMoodOnly(clause)
  ) {
    return true;
  }
  return false;
}

function takeMatch(source: string, pattern: RegExp): { rest: string; value: string | null } {
  const match = source.match(pattern);
  if (!match || match.index == null) return { rest: source, value: null };
  const value = normalizeClause(match[0]);
  const rest = `${source.slice(0, match.index)} ${source.slice(match.index + match[0].length)}`;
  return { rest, value };
}

function parseExplicitProductClause(clause: string): { category: string; constraints: string[] } {
  let rest = normalizeClause(clause);
  const constraints: string[] = [];

  const budget = takeMatch(
    rest,
    /\bmax(?:imum)?\s+\d+(?:[.,]\d+)?\s*(?:€|eur|euros?)?\b|\b\d+(?:[.,]\d+)?\s*(?:€|eur|euros?)\b/i
  );
  rest = budget.rest;
  if (budget.value) constraints.push(budget.value);

  const area = takeMatch(
    rest,
    /\b(?:around|approximately|approx\.?|~)?\s*\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*cm)?\b/i
  );
  rest = area.rest;
  if (area.value) constraints.push(area.value);

  const length = takeMatch(
    rest,
    /\b(?:around|approximately|approx\.?|~)?\s*\d+(?:[.,]\d+)?\s*cm\b/i
  );
  rest = length.rest;
  if (length.value) constraints.push(length.value);

  const material = takeMatch(
    rest,
    /\b(ceramic|metal|steel|wood|oak|walnut|leather|glass|wool|cotton|linen|plastic|fabric|rattan|stone)\b/i
  );
  rest = material.rest;
  if (material.value) constraints.push(material.value);

  const color = takeMatch(
    rest,
    /\b(light-colored|light coloured|light-colour(?:ed)?|dark|black|white|grey|gray|beige|brown|neutral)\b/i
  );
  rest = color.rest;
  if (color.value) constraints.push(color.value);

  const category = normalizeClause(rest.replace(/[,:;]+/g, " ").replace(/\b(need|want|buy|looking for|only|these|products?)\b/gi, " "));
  return {
    category: category || normalizeClause(clause),
    constraints,
  };
}

function conceptFromClause(clause: string): ProductConcept {
  return matchesKnownPattern(clause)?.concept ?? "other";
}

function genericLightingCategory(category: string): boolean {
  const cat = category.trim().toLowerCase();
  return cat === "lighting" || cat === "lamp" || cat === "light" || cat === "svetilo" || cat === "svetilka";
}

function intentFromClause(clause: string, suppressions: Set<ProductConcept>): NoteShoppingIntent | null {
  const matchedPhrase = normalizeClause(clause);
  if (!matchedPhrase) return null;
  const concept = conceptFromClause(matchedPhrase);
  if (suppressions.has(concept)) return null;
  const parsed = parseExplicitProductClause(matchedPhrase);
  const known = matchesKnownPattern(matchedPhrase);
  const category =
    parsed.category && !genericLightingCategory(parsed.category)
      ? parsed.category
      : known && genericLightingCategory(parsed.category)
        ? parsed.category || known.category
        : parsed.category || known?.category || matchedPhrase;
  return {
    concept,
    category,
    constraints: parsed.constraints,
    matchedPhrase,
  };
}

function isGlobalRoomInstruction(text: string): boolean {
  const clause = normalizeClause(text);
  if (!clause) return false;
  if (/\bdo not add extra\b|\bdon'?t add extra\b|\bno extra (?:loose )?decor\b|\bloose decor\b/i.test(clause)) {
    return true;
  }
  return /\bliving room\b/i.test(clause) && !/\b(rug|sofa|table|lamp|chair|desk|bed|wardrobe|carpet|preproga)\b/i.test(clause);
}

function sanitizeListedProductClause(part: string): string {
  const sentences = normalizeClause(part)
    .split(/(?<=[.!?])\s+/)
    .map(normalizeClause)
    .filter(Boolean);
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (isGlobalRoomInstruction(sentence)) break;
    kept.push(sentence);
  }
  let text = normalizeClause(kept.join(" "));
  text = text.replace(/\s+(?:modern\s+warm\s+minimalist\s+)?living\s+room\b.*$/i, "");
  text = text.replace(/\s+do not add extra(?:\s+loose)?(?:\s+decor)?\b.*$/i, "");
  return normalizeClause(text);
}

function splitNumberedOrListedItems(notes: string): string[] | null {
  const text = normalizeClause(notes);
  if (!/(?:^|\s)\d+[.)]\s+\S/.test(` ${text}`)) return null;
  return text
    .split(/\s*\d+[.)]\s+/)
    .map((part) => normalizeClause(part))
    .filter(Boolean);
}

function specificityScore(intent: NoteShoppingIntent): number {
  return `${intent.category} ${intent.constraints.join(" ")} ${intent.matchedPhrase}`.length;
}

function sameProductIdentity(a: NoteShoppingIntent, b: NoteShoppingIntent): boolean {
  if (a.concept !== "other" && b.concept !== "other") {
    const family = conceptFamily(a.concept);
    if (family.includes(b.concept)) return true;
  }
  const aHead = normalizeMatchText(a.category);
  const bHead = normalizeMatchText(b.category);
  if (!aHead || !bHead) return false;
  return aHead.includes(bHead) || bHead.includes(aHead);
}

function dedupeNoteIntents(intents: NoteShoppingIntent[]): NoteShoppingIntent[] {
  const sorted = [...intents].sort((a, b) => specificityScore(b) - specificityScore(a));
  const kept: NoteShoppingIntent[] = [];
  for (const intent of sorted) {
    if (kept.some((existing) => sameProductIdentity(existing, intent))) continue;
    kept.push(intent);
  }
  return kept;
}

function extractViaKnownPatterns(notes: string, suppressions: Set<ProductConcept>): NoteShoppingIntent[] {
  const trimmed = normalizeClause(notes);
  if (!trimmed) return [];
  const found = new Map<ProductConcept, NoteShoppingIntent>();

  for (const rule of POSITIVE_INTENT_PATTERNS) {
    if (suppressions.has(rule.concept)) continue;
    for (const pattern of rule.patterns) {
      const match = trimmed.match(pattern);
      if (!match) continue;
      if (!found.has(rule.concept)) {
        found.set(rule.concept, {
          concept: rule.concept,
          category: rule.category,
          constraints: [],
          matchedPhrase: match[0],
        });
      }
      break;
    }
  }

  if (found.has("gaming_chair")) {
    found.delete("office_chair");
    found.delete("chair");
  } else if (found.has("office_chair")) {
    found.delete("chair");
  }
  if (found.has("reading_chair")) {
    found.delete("chair");
  }

  return [...found.values()];
}

export function extractShoppingIntentsFromNotes(notes: string): NoteShoppingIntent[] {
  const trimmed = notes.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!trimmed) return [];

  const suppressions = new Set([
    ...extractKeepSuppressions(trimmed).map((item) => item.concept),
    ...extractNegativeSuppressions(trimmed).map((item) => item.concept),
  ]);
  const listed = splitNumberedOrListedItems(trimmed);
  const collected: NoteShoppingIntent[] = [];

  if (listed && listed.length > 0) {
    const remainder: string[] = [];
    for (const part of listed) {
      const sanitized = sanitizeListedProductClause(part);
      if (isExplicitProductRequest(sanitized, true)) {
        const intent = intentFromClause(sanitized, suppressions);
        if (intent) collected.push(intent);
      } else if (isExplicitProductRequest(part, true)) {
        remainder.push(part);
      } else {
        remainder.push(part);
      }
    }
    collected.push(...extractViaKnownPatterns(remainder.join(" "), suppressions));
  } else if (trimmed.includes(";")) {
    for (const part of trimmed.split(";").map(normalizeClause).filter(Boolean)) {
      if (!isExplicitProductRequest(part, false)) continue;
      const intent = intentFromClause(part, suppressions);
      if (intent) collected.push(intent);
    }
    collected.push(...extractViaKnownPatterns(trimmed, suppressions));
  } else {
    if (isExplicitProductRequest(trimmed, false)) {
      const intent = intentFromClause(trimmed, suppressions);
      if (intent) collected.push(intent);
    }
    collected.push(...extractViaKnownPatterns(trimmed, suppressions));
  }

  const deduped = dedupeNoteIntents(collected);
  if (deduped.some((item) => item.concept === "gaming_chair")) {
    return deduped.filter((item) => item.concept !== "office_chair" && item.concept !== "chair");
  }
  if (deduped.some((item) => item.concept === "office_chair")) {
    return deduped.filter((item) => item.concept !== "chair");
  }
  if (deduped.some((item) => item.concept === "reading_chair")) {
    return deduped.filter((item) => item.concept !== "chair");
  }
  return deduped;
}

function intentIdentity(intent: NoteShoppingIntent): string {
  const category = intent.category.trim().toLowerCase();
  if (intent.concept !== "other" && intent.concept !== "lighting") {
    return intent.concept;
  }
  if (intent.concept === "lighting" && genericLightingCategory(intent.category)) {
    return "lighting";
  }
  const slug = category.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${intent.concept}:${slug || "item"}`;
}

export function canonicalNoteShoppingIntents(notes: string): string[] {
  return extractShoppingIntentsFromNotes(notes)
    .map(intentIdentity)
    .sort((a, b) => a.localeCompare(b));
}
