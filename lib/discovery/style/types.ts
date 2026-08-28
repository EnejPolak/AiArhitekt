import type { ProductConcept } from "../locales/types";
import type { SearchLocale } from "../locales/types";

export const CANONICAL_STYLE_IDS = [
  "modern",
  "scandinavian",
  "luxury",
  "minimal",
  "rustic",
] as const;

export type CanonicalStyleId = (typeof CANONICAL_STYLE_IDS)[number];

export type LocalizedStyleTerms = {
  sl: string[];
  en: string[];
};

export type StyleSignalGroup = {
  terms: LocalizedStyleTerms;
  /** When set, signals apply only to these product concepts. */
  concepts?: ProductConcept[];
};

export type StyleProfile = {
  id: CanonicalStyleId;
  positive: StyleSignalGroup;
  negative: StyleSignalGroup;
  materials: StyleSignalGroup;
  colors: StyleSignalGroup;
  forms: StyleSignalGroup;
};

export type StyleFitResult = {
  selectedStyles: CanonicalStyleId[];
  score: number;
  matchedSignals: string[];
  conflictingSignals: string[];
  neutral: boolean;
};

export type StyleRankingInput = {
  locale: SearchLocale;
  selectedStyles: CanonicalStyleId[];
  concept: ProductConcept;
  requirementType: "furniture" | "material";
  evidence: {
    title: string;
    snippet?: string | null;
    url?: string | null;
  };
};

export type RankedProductCandidate = {
  product: {
    productTitle: string;
    productSnippet: string | null;
    productUrl: string;
    productImageUrl: string | null;
    price: number | null;
    currency: "EUR" | null;
    retailerDomain: string;
    retailerName: string | null;
    hasReferenceImage: boolean;
  };
  hardValid: boolean;
  hardGateReasons: string[];
  fidelity: import("../fidelity/requirementFidelity").RequirementFidelity | null;
  serpScore: number;
  serpConfidence: number;
  styleFit: StyleFitResult | null;
  finalScore: number;
};
