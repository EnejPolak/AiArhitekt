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
    patterns: [/\blamp\b/i, /\blight(?:ing)?\b/i, /\bsvetil\w*\b/i],
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
    patterns: [/\bkeep\s+(?:my\s+)?(?:current\s+)?sofa\b/i, /\bobdrži\s+.*\bkav[cč]\b/i],
  },
  {
    concept: "bed",
    patterns: [/\bkeep\s+(?:my\s+)?(?:current\s+)?bed\b/i, /\bobdrži\s+.*\bpostelj\b/i],
  },
];

const CHAIR_FAMILY: ProductConcept[] = ["gaming_chair", "office_chair", "chair"];

export function conceptFamily(concept: ProductConcept): ProductConcept[] {
  if (CHAIR_FAMILY.includes(concept)) return CHAIR_FAMILY;
  if (concept === "desk") return ["desk"];
  if (["marble", "laminate", "hardwood", "tiles", "flooring"].includes(concept)) {
    return ["marble", "laminate", "hardwood", "tiles", "flooring"];
  }
  return [concept];
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

export function extractShoppingIntentsFromNotes(notes: string): NoteShoppingIntent[] {
  const trimmed = notes.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!trimmed) return [];

  const suppressions = new Set(extractKeepSuppressions(trimmed).map((item) => item.concept));
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

  // Gaming chair beats generic chair / office chair from the same notes.
  if (found.has("gaming_chair")) {
    found.delete("office_chair");
    found.delete("chair");
  } else if (found.has("office_chair")) {
    found.delete("chair");
  }

  return [...found.values()];
}

export function canonicalNoteShoppingIntents(notes: string): string[] {
  return extractShoppingIntentsFromNotes(notes)
    .map((intent) => intent.concept)
    .sort((a, b) => a.localeCompare(b));
}
