import {
  furnitureNeedSchema,
  materialNeedSchema,
  type DesignRequirements,
} from "@/lib/analysis/schema";
import { MAX_PRODUCT_DISCOVERY_ITEMS } from "./constants";
import { explicitFlooringNeed, isFloorMaterialNeed } from "./floorMaterial";
import {
  conceptFamily,
  extractKeepSuppressions,
  extractShoppingIntentsFromNotes,
  type NoteShoppingIntent,
} from "./noteIntents";
import { parsePaintPreference, paintHueLabel } from "./paintParser";
import type { ShoppingPreferenceInput } from "./preferences";
import type { ProductConcept } from "./locales/types";
import { canonicalEnglishQueryPlan } from "./locales/queryPlan";
import {
  clampItemSpec,
  furnitureItemSpec,
  furnitureRequirementKey,
  isWallPaintMaterial,
  materialItemSpec,
  materialRequirementKey,
  slugRequirementPart,
  type DiscoveryRequirementType,
  type FurnitureNeed,
  type MaterialNeed,
  type RequirementProvenance,
  type RequirementSource,
  type SearchableRequirement,
} from "./itemSpecs";

export type ResolvedShoppingDraft = {
  requirementType: DiscoveryRequirementType;
  requirementKey: string;
  itemSpec: string;
  snapshot: FurnitureNeed | MaterialNeed;
  displayLabel: string;
  provenance: RequirementProvenance;
};

function furnitureDraft(
  need: FurnitureNeed,
  key: string,
  provenance: RequirementProvenance
): ResolvedShoppingDraft {
  return {
    requirementType: "furniture",
    requirementKey: key,
    itemSpec: furnitureItemSpec(need),
    snapshot: need,
    displayLabel: need.category,
    provenance,
  };
}

function materialDraft(
  need: MaterialNeed,
  key: string,
  provenance: RequirementProvenance,
  displayLabel: string
): ResolvedShoppingDraft {
  return {
    requirementType: "material",
    requirementKey: key,
    itemSpec: materialItemSpec(need),
    snapshot: need,
    displayLabel,
    provenance,
  };
}

function paintDraft(
  parsed: ReturnType<typeof parsePaintPreference>,
  role: "main" | "accent",
  provenance: RequirementProvenance
): ResolvedShoppingDraft | null {
  if (!parsed) return null;
  const finishLabel =
    parsed.finish === "matte" ? "matte" : parsed.finish === "metallic" ? "metallic" : parsed.finish === "gloss" ? "gloss" : "";
  const colorPhrase = [finishLabel, paintHueLabel(parsed.hue)].filter(Boolean).join(" ");
  const need: MaterialNeed = {
    surface: "wall",
    category: "interior wall paint",
    finishDirection: colorPhrase,
    constraints: [parsed.raw, parsed.hue, ...(parsed.finish ? [parsed.finish] : []), `${role} wall`],
  };
  return materialDraft(
    need,
    `material:wall:interior-wall-paint:${role}`,
    {
      ...provenance,
      paintHue: parsed.hue,
      paintFinish: parsed.finish,
      paintRaw: parsed.raw,
    },
    parsed.displaySpec
  );
}

function structuredWallPaints(preferences: ShoppingPreferenceInput): ResolvedShoppingDraft[] {
  if (preferences.keepExistingWalls) return [];
  const out: ResolvedShoppingDraft[] = [];
  const main = parsePaintPreference(preferences.wallMainColor ?? "");
  const accent = parsePaintPreference(preferences.wallAccentColor ?? "");
  const mainDraft = paintDraft(main, "main", {
    source: "user_structured",
    concept: "wall_paint",
    sourceField: "wallMainColor",
    originalUserValue: preferences.wallMainColor ?? "",
  });
  if (mainDraft) out.push(mainDraft);
  const accentDraft =
    accent && accent.raw.toLowerCase() !== (main?.raw.toLowerCase() ?? "")
      ? paintDraft(accent, "accent", {
          source: "user_structured",
          concept: "wall_paint",
          sourceField: "wallAccentColor",
          originalUserValue: preferences.wallAccentColor ?? "",
        })
      : null;
  if (accentDraft) out.push(accentDraft);
  return out;
}

function structuredFlooring(preferences: ShoppingPreferenceInput): ResolvedShoppingDraft[] {
  const flooring = preferences.flooring ?? "keep";
  if (flooring === "keep") return [];
  if (flooring !== "marble" && flooring !== "laminate" && flooring !== "hardwood" && flooring !== "tiles") {
    return [];
  }
  const need = explicitFlooringNeed(flooring);
  return [
    materialDraft(
      need,
      `material:floor:user-flooring:${flooring}`,
      {
        source: "user_structured",
        concept: flooring === "marble" ? "marble" : flooring === "tiles" ? "tiles" : flooring === "laminate" ? "laminate" : "hardwood",
        sourceField: "flooring",
        originalUserValue: flooring,
      },
      `${flooring} flooring`
    ),
  ];
}

function noteIntentDraft(intent: NoteShoppingIntent, index: number): ResolvedShoppingDraft {
  const need: FurnitureNeed = {
    category: intent.category,
    quantity: 1,
    placementNotes: null,
    constraints: intent.constraints.slice(0, 8),
  };
  return {
    requirementType: "furniture",
    requirementKey: `furniture:${slugRequirementPart(intent.concept)}:note:${index}`,
    itemSpec: furnitureItemSpec(need),
    snapshot: need,
    displayLabel: intent.category,
    provenance: {
      source: "user_notes",
      concept: intent.concept,
      matchedPhrase: intent.matchedPhrase,
    },
  };
}

function analysisFurnitureDrafts(
  requirements: DesignRequirements,
  suppressedConcepts: Set<ProductConcept>,
  userConcepts: Set<ProductConcept>
): ResolvedShoppingDraft[] {
  return requirements.furnitureNeeds
    .map((raw, index) => {
      const snapshot = furnitureNeedSchema.parse(raw);
      const key = furnitureRequirementKey(snapshot, index);
      const concept = inferFurnitureConcept(snapshot);
      if (suppressedConcepts.has(concept)) return null;
      if ([...userConcepts].some((userConcept) => conceptFamily(userConcept).includes(concept))) {
        return null;
      }
      return furnitureDraft(snapshot, key, { source: "analysis", concept });
    })
    .filter((item): item is ResolvedShoppingDraft => item !== null);
}

function analysisMaterialDrafts(
  requirements: DesignRequirements,
  preferences: ShoppingPreferenceInput,
  suppressedConcepts: Set<ProductConcept>,
  userConcepts: Set<ProductConcept>,
  hasStructuredFlooring: boolean,
  hasStructuredPaint: boolean
): ResolvedShoppingDraft[] {
  return requirements.materialNeeds
    .map((raw, index) => {
      const snapshot = materialNeedSchema.parse(raw);
      if (hasStructuredPaint && isWallPaintMaterial(snapshot)) return null;
      if (hasStructuredFlooring && isFloorMaterialNeed(snapshot)) return null;
      const concept = inferMaterialConcept(snapshot);
      if (suppressedConcepts.has(concept)) return null;
      if ([...userConcepts].some((userConcept) => conceptFamily(userConcept).includes(concept))) {
        return null;
      }
      return materialDraft(snapshot, materialRequirementKey(snapshot, index), {
        source: "analysis",
        concept,
      }, materialItemSpec(snapshot));
    })
    .filter((item): item is ResolvedShoppingDraft => item !== null);
}

function inferFurnitureConcept(need: FurnitureNeed): ProductConcept {
  const blob = `${need.category} ${need.constraints.join(" ")}`.toLowerCase();
  if (/gaming\s+chair|gaming\s+stol|igri[cč]arski|igralni\s+stol/.test(blob)) return "gaming_chair";
  if (/office\s+chair|pisarnisk/.test(blob)) return "office_chair";
  if (/\bdesk\b|workstation|pisalna miza|racunalniska miza/.test(blob)) return "desk";
  if (/\bsofa\b|couch|kavc|sedezna/.test(blob)) return "sofa";
  if (/coffee table|klubsk/.test(blob)) return "coffee_table";
  if (/\bbed\b|postelj/.test(blob)) return "bed";
  if (/wardrobe|omara|garderob/.test(blob)) return "wardrobe";
  if (/\blamp\b|lighting|svetil|\blight fixture|\blight fitting/.test(blob)) return "lighting";
  if (/\bchair\b|\bstol\b/.test(blob)) return "chair";
  return "other";
}

function inferMaterialConcept(need: MaterialNeed): ProductConcept {
  if (isWallPaintMaterial(need)) return "wall_paint";
  const blob = `${need.surface} ${need.category} ${need.finishDirection ?? ""}`.toLowerCase();
  if (/marble|marmor/.test(blob)) return "marble";
  if (/laminate|laminat/.test(blob)) return "laminate";
  if (/hardwood|parket|wood/.test(blob)) return "hardwood";
  if (/tile|ploscic|keramic/.test(blob)) return "tiles";
  if (/floor|taln|oblog/.test(blob)) return "flooring";
  return "other";
}

function toSearchableRequirement(draft: ResolvedShoppingDraft): SearchableRequirement {
  const requirement: SearchableRequirement = {
    requirementType: draft.requirementType,
    requirementKey: draft.requirementKey,
    itemSpec: clampItemSpec(draft.itemSpec),
    queryPlan: [],
    snapshot: draft.snapshot,
    displayLabel: draft.displayLabel,
    provenance: draft.provenance,
  };
  return {
    ...requirement,
    queryPlan: canonicalEnglishQueryPlan(requirement),
  };
}

/** @deprecated Use resolveShoppingRequirements */
export function buildSearchableRequirements(
  analysisRequirements: DesignRequirements,
  preferences?: ShoppingPreferenceInput | null
) {
  return resolveShoppingRequirements({ analysisRequirements, preferences });
}

export function resolveShoppingRequirements(input: {
  analysisRequirements: DesignRequirements;
  preferences?: ShoppingPreferenceInput | null;
}): {
  searched: SearchableRequirement[];
  notSearched: SearchableRequirement[];
} {
  const preferences = input.preferences ?? {};
  const structuredPaints = structuredWallPaints(preferences);
  const flooringPreference = preferences.flooring;
  const suppressAnalysisFlooring = flooringPreference !== undefined && flooringPreference !== null;
  const flooringDrafts =
    flooringPreference && flooringPreference !== "keep" ? structuredFlooring(preferences) : [];
  const noteIntents = extractShoppingIntentsFromNotes(preferences.notes ?? "");
  const keepSuppressions = extractKeepSuppressions(preferences.notes ?? "");
  const suppressedConcepts = new Set<ProductConcept>();
  for (const item of keepSuppressions) {
    for (const concept of conceptFamily(item.concept)) {
      suppressedConcepts.add(concept);
    }
  }

  const userConcepts = new Set<ProductConcept>([
    ...structuredPaints.map((item) => item.provenance.concept),
    ...flooringDrafts.map((item) => item.provenance.concept),
    ...noteIntents.map((item) => item.concept),
  ]);

  const ordered: ResolvedShoppingDraft[] = [
    ...flooringDrafts,
    ...structuredPaints,
    ...noteIntents.map(noteIntentDraft),
    ...analysisFurnitureDrafts(input.analysisRequirements, suppressedConcepts, userConcepts),
    ...analysisMaterialDrafts(
      input.analysisRequirements,
      preferences,
      suppressedConcepts,
      userConcepts,
      suppressAnalysisFlooring,
      structuredPaints.length > 0
    ),
  ];

  const mapped = ordered.map(toSearchableRequirement);
  return {
    searched: mapped.slice(0, MAX_PRODUCT_DISCOVERY_ITEMS),
    notSearched: mapped.slice(MAX_PRODUCT_DISCOVERY_ITEMS),
  };
}

/** Dev-only helper: inspect resolved requirements without provider calls. */
export function debugResolvedShoppingRequirements(input: {
  analysisRequirements: DesignRequirements;
  preferences?: ShoppingPreferenceInput | null;
}): Array<{
  displayLabel: string;
  concept: ProductConcept;
  source: RequirementSource;
  itemSpec: string;
}> {
  const { searched, notSearched } = resolveShoppingRequirements(input);
  return [...searched, ...notSearched].map((item) => ({
    displayLabel: item.displayLabel ?? item.itemSpec,
    concept: item.provenance?.concept ?? "other",
    source: item.provenance?.source ?? "analysis",
    itemSpec: item.itemSpec,
  }));
}
