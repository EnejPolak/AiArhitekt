import { z } from "zod";
import type { DesignRequirements, FurniturePlanRole, RoomAnalysisObservation } from "@/lib/analysis/schema";
import {
  isAtomicLightingConcept,
  isLightingConcept,
  lightingCategory,
  lightingDisplayLabel,
  resolveAtomicFurnishingNeed,
  type AtomicLightingConcept,
} from "./atomicFurnishing";
import {
  inferFurnitureConceptFromText,
  isArchitecturalFinishText,
  isDefaultDecorText,
} from "./locales/concepts";
import type { ProductConcept } from "./locales/types";
import {
  conceptFamily,
  extractKeepSuppressions,
  extractNegativeSuppressions,
  extractShoppingIntentsFromNotes,
  type NoteShoppingIntent,
} from "./noteIntents";
import type { ShoppingPreferenceInput } from "./preferences";
import { slugRequirementPart, type FurnitureNeed, type RequirementSource } from "./itemSpecs";

export const FURNISHING_PLAN_OVERRIDE_SCHEMA_VERSION = 1 as const;

export type PlannedFurnishingItem = {
  requirementKey: string;
  concept: ProductConcept;
  category: string;
  quantity: number | null;
  placementNotes: string | null;
  constraints: string[];
  rationale: string | null;
  role: FurniturePlanRole;
  source: RequirementSource;
  displayLabel: string;
};

export type FurnishingPlanAddedItem = {
  key: string;
  category: string;
  quantity: number | null;
  placementNotes: string | null;
  constraints: string[];
  rationale: string | null;
};

export type FurnishingPlanEdits = {
  category?: string;
  quantity?: number | null;
  placementNotes?: string | null;
  constraints?: string[];
  rationale?: string | null;
};

export type FurnishingPlanOverrides = {
  schemaVersion: typeof FURNISHING_PLAN_OVERRIDE_SCHEMA_VERSION;
  sourceAnalysisId: string | null;
  removedRequirementKeys: string[];
  acceptedSuggestionKeys: string[];
  addedRequirements: FurnishingPlanAddedItem[];
  editedRequirements: Record<string, FurnishingPlanEdits>;
};

export type NormalizedFurnishingPlan = {
  generated: PlannedFurnishingItem[];
  required: PlannedFurnishingItem[];
  suggested: PlannedFurnishingItem[];
  removed: PlannedFurnishingItem[];
};

const addedItemSchema = z.object({
  key: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(400),
  quantity: z.number().int().positive().max(20).nullable(),
  placementNotes: z.string().trim().max(400).nullable(),
  constraints: z.array(z.string().trim().min(1).max(400)).max(8),
  rationale: z.string().trim().max(400).nullable(),
});

const editsSchema = z.object({
  category: z.string().trim().min(1).max(400).optional(),
  quantity: z.number().int().positive().max(20).nullable().optional(),
  placementNotes: z.string().trim().max(400).nullable().optional(),
  constraints: z.array(z.string().trim().min(1).max(400)).max(8).optional(),
  rationale: z.string().trim().max(400).nullable().optional(),
});

const overridesSchema = z.object({
  schemaVersion: z.literal(FURNISHING_PLAN_OVERRIDE_SCHEMA_VERSION).optional(),
  sourceAnalysisId: z.string().uuid().nullable().optional(),
  removedRequirementKeys: z.array(z.string().trim().min(1).max(160)).max(40).optional(),
  acceptedSuggestionKeys: z.array(z.string().trim().min(1).max(160)).max(40).optional(),
  addedRequirements: z.array(addedItemSchema).max(20).optional(),
  editedRequirements: z.record(z.string().min(1).max(160), editsSchema).optional(),
});

export const EMPTY_FURNISHING_PLAN_OVERRIDES: FurnishingPlanOverrides = {
  schemaVersion: FURNISHING_PLAN_OVERRIDE_SCHEMA_VERSION,
  sourceAnalysisId: null,
  removedRequirementKeys: [],
  acceptedSuggestionKeys: [],
  addedRequirements: [],
  editedRequirements: {},
};

const DISPLAY_LABELS: Partial<Record<ProductConcept, string>> = {
  sofa: "Sofa",
  coffee_table: "Coffee table",
  rug: "Rug",
  reading_chair: "Reading chair",
  dining_table: "Dining table",
  dining_chair: "Dining chairs",
  lighting: "Lighting",
  ceiling_light: "Ceiling light fixture",
  pendant_light: "Pendant light",
  floor_lamp: "Floor lamp",
  table_lamp: "Table lamp",
  wall_light: "Wall light",
  wardrobe: "Wardrobe",
  bed: "Bed",
  bedside: "Bedside table",
  desk: "Desk",
  chair: "Chair",
  office_chair: "Office chair",
  gaming_chair: "Gaming chair",
  storage: "Storage",
  tv_console: "TV console",
  window_treatment: "Window treatment",
};

export function parseFurnishingPlanOverrides(raw: unknown): FurnishingPlanOverrides {
  const parsed = overridesSchema.safeParse(raw ?? {});
  if (!parsed.success) return { ...EMPTY_FURNISHING_PLAN_OVERRIDES };
  return {
    schemaVersion: FURNISHING_PLAN_OVERRIDE_SCHEMA_VERSION,
    sourceAnalysisId: parsed.data.sourceAnalysisId ?? null,
    removedRequirementKeys: uniqueStrings(parsed.data.removedRequirementKeys ?? []),
    acceptedSuggestionKeys: uniqueStrings(parsed.data.acceptedSuggestionKeys ?? []),
    addedRequirements: parsed.data.addedRequirements ?? [],
    editedRequirements: parsed.data.editedRequirements ?? {},
  };
}

export function isEmptyFurnishingPlanOverrides(overrides: FurnishingPlanOverrides): boolean {
  return (
    overrides.removedRequirementKeys.length === 0 &&
    overrides.acceptedSuggestionKeys.length === 0 &&
    overrides.addedRequirements.length === 0 &&
    Object.keys(overrides.editedRequirements).length === 0
  );
}

export function canonicalFurnishingPlanIdentity(raw: unknown): string {
  const overrides = parseFurnishingPlanOverrides(raw);
  if (isEmptyFurnishingPlanOverrides(overrides)) return "";
  return JSON.stringify({
    r: [...overrides.removedRequirementKeys].sort(),
    a: [...overrides.acceptedSuggestionKeys].sort(),
    n: overrides.addedRequirements.map((item) => item.key).sort(),
    e: Object.keys(overrides.editedRequirements).sort(),
  });
}

export function stableFurnitureRequirementKey(identitySlug: string, occurrence: number): string {
  return `furniture:${slugRequirementPart(identitySlug)}:${occurrence}`;
}

export function furnitureConceptIdentitySlug(concept: ProductConcept, category: string): string {
  if (concept !== "other") return concept.replace(/_/g, "-");
  return slugRequirementPart(category);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function titleCaseCategory(category: string): string {
  return category
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function displayLabelFor(concept: ProductConcept, category: string): string {
  if (isLightingConcept(concept)) return lightingDisplayLabel(concept, category);
  return DISPLAY_LABELS[concept] ?? titleCaseCategory(category);
}

function isRoomLevelProse(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (/\bdo not add extra\b|\bdon'?t add extra\b|\bno extra (?:loose )?decor\b/i.test(normalized)) {
    return true;
  }
  if (/\bcomplete (?:but restrained )?functional furnishing plan\b/i.test(normalized)) return true;
  return normalized.split(" ").length > 18;
}

function sanitizeConstraints(constraints: string[]): string[] {
  return constraints
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 0 && !isRoomLevelProse(item) && !isArchitecturalFinishText(item))
    .slice(0, 8);
}

function clampQuantity(concept: ProductConcept, quantity: number | null): number | null {
  if (quantity == null) return null;
  if (isLightingConcept(concept)) return null;
  const max = concept === "dining_chair" || concept === "chair" ? 8 : 2;
  return Math.min(Math.max(1, quantity), max);
}

function toFurnitureNeed(item: PlannedFurnishingItem): FurnitureNeed {
  return {
    category: item.category,
    quantity: item.quantity,
    placementNotes: item.placementNotes,
    constraints: item.constraints,
    rationale: item.rationale,
    role: item.role,
  };
}

export function plannedItemToFurnitureNeed(item: PlannedFurnishingItem): FurnitureNeed {
  return toFurnitureNeed(item);
}

function keptConceptsFromObservation(observation?: RoomAnalysisObservation | null): Set<ProductConcept> {
  const kept = new Set<ProductConcept>();
  if (!observation) return kept;
  for (const element of observation.existingElements ?? []) {
    if (element.disposition !== "likely_keep") continue;
    const concept = inferFurnitureConceptFromText(element.description);
    if (concept !== "other") kept.add(concept);
  }
  for (const fixed of observation.architecture?.fixedElements ?? []) {
    const concept = inferFurnitureConceptFromText(fixed);
    if (concept === "wardrobe" || concept === "storage" || isLightingConcept(concept)) {
      kept.add(concept);
    }
  }
  return kept;
}

function suppressedFromNotes(notes: string): Set<ProductConcept> {
  const suppressed = new Set<ProductConcept>();
  for (const item of [...extractKeepSuppressions(notes), ...extractNegativeSuppressions(notes)]) {
    for (const concept of conceptFamily(item.concept)) {
      suppressed.add(concept);
    }
  }
  return suppressed;
}

function conceptsOverlap(a: ProductConcept, b: ProductConcept): boolean {
  if (a === "other" || b === "other") return false;
  if (isLightingConcept(a) && isLightingConcept(b)) {
    if (a === "lighting" || b === "lighting") return true;
    return a === b;
  }
  return conceptFamily(a).includes(b) || conceptFamily(b).includes(a);
}

function nextOccurrence(used: Map<string, number>, slug: string): number {
  const current = used.get(slug) ?? 0;
  used.set(slug, current + 1);
  return current;
}

function lightingAlternativeItem(
  concept: AtomicLightingConcept,
  used: Map<string, number>
): PlannedFurnishingItem {
  const category = lightingCategory(concept);
  const identitySlug = furnitureConceptIdentitySlug(concept, category);
  const occurrence = nextOccurrence(used, identitySlug);
  return {
    requirementKey: stableFurnitureRequirementKey(identitySlug, occurrence),
    concept,
    category,
    quantity: null,
    placementNotes: null,
    constraints: [],
    rationale: "Optional lighting alternative. Accept only if you want this type searched.",
    role: "suggested_only",
    source: "analysis",
    displayLabel: displayLabelFor(concept, category),
  };
}

function buildAnalysisItems(
  requirements: DesignRequirements,
  observation?: RoomAnalysisObservation | null
): PlannedFurnishingItem[] {
  const used = new Map<string, number>();
  const out: PlannedFurnishingItem[] = [];
  for (const need of requirements.furnitureNeeds) {
    const blob = `${need.category} ${need.constraints.join(" ")} ${need.placementNotes ?? ""}`;
    if (isArchitecturalFinishText(blob) || isArchitecturalFinishText(need.category)) continue;
    const resolved = resolveAtomicFurnishingNeed(need, observation);
    if (!resolved) continue;
    if (isDefaultDecorText(blob) && resolved.role !== "suggested_only") continue;

    if (resolved.concept === "lighting") {
      for (const alternative of resolved.suggestedAlternatives) {
        if (out.some((item) => item.concept === alternative)) continue;
        out.push(lightingAlternativeItem(alternative, used));
      }
      continue;
    }

    const concept = resolved.concept;
    const category = resolved.category;
    const identitySlug = furnitureConceptIdentitySlug(concept, category);
    if (out.some((item) => item.concept !== "other" && conceptsOverlap(item.concept, concept))) {
      continue;
    }
    if (
      concept === "other" &&
      out.some((item) => furnitureConceptIdentitySlug(item.concept, item.category) === identitySlug)
    ) {
      continue;
    }
    const occurrence = nextOccurrence(used, identitySlug);
    out.push({
      requirementKey: stableFurnitureRequirementKey(identitySlug, occurrence),
      concept,
      category,
      quantity: clampQuantity(concept, resolved.quantity),
      placementNotes: resolved.placementNotes,
      constraints: sanitizeConstraints(need.constraints),
      rationale: resolved.rationale || defaultRationale(concept, category),
      role: resolved.role,
      source: "analysis",
      displayLabel: displayLabelFor(concept, category),
    });
    for (const alternative of resolved.suggestedAlternatives) {
      if (out.some((item) => item.concept === alternative)) continue;
      out.push(lightingAlternativeItem(alternative, used));
    }
  }
  return out;
}

function defaultRationale(concept: ProductConcept, category: string): string {
  const label = displayLabelFor(concept, category);
  return `Functional ${label.toLowerCase()} for this room.`;
}

function applyKeepSuppressions(
  items: PlannedFurnishingItem[],
  kept: Set<ProductConcept>,
  noteSuppressed: Set<ProductConcept>,
  userRequested: Set<ProductConcept>
): PlannedFurnishingItem[] {
  return items.filter((item) => {
    if (item.concept === "other") {
      return ![...noteSuppressed].some((concept) => inferFurnitureConceptFromText(item.category) === concept);
    }
    if (userRequested.has(item.concept)) return true;
    if ([...noteSuppressed].some((concept) => conceptsOverlap(concept, item.concept))) return false;
    if ([...kept].some((concept) => conceptsOverlap(concept, item.concept))) return false;
    return true;
  });
}

function noteIntentItem(intent: NoteShoppingIntent, index: number): PlannedFurnishingItem {
  const concept = intent.concept;
  const category = isAtomicLightingConcept(concept) ? lightingCategory(concept) : intent.category;
  const identitySlug = furnitureConceptIdentitySlug(concept, category);
  return {
    requirementKey: `furniture:${slugRequirementPart(intent.concept)}:note:${index}`,
    concept,
    category,
    quantity: isLightingConcept(concept) ? null : 1,
    placementNotes: null,
    constraints: sanitizeConstraints(intent.constraints),
    rationale: `Requested in your notes (“${intent.matchedPhrase}”).`,
    role: "required_for_render",
    source: "user_notes",
    displayLabel: displayLabelFor(concept, category),
  };
}

function mergeNoteIntents(
  items: PlannedFurnishingItem[],
  intents: NoteShoppingIntent[]
): PlannedFurnishingItem[] {
  const merged = [...items];
  intents.forEach((intent, index) => {
    let matchIndex = merged.findIndex(
      (item) =>
        item.concept === intent.concept ||
        (item.concept !== "other" && intent.concept !== "other" && conceptsOverlap(item.concept, intent.concept))
    );
    if (matchIndex < 0 && isLightingConcept(intent.concept)) {
      matchIndex = merged.findIndex(
        (item) => isLightingConcept(item.concept) && item.source === "analysis"
      );
    }
    if (matchIndex >= 0) {
      const match = merged[matchIndex]!;
      if (match.role === "suggested_only" || match.concept !== intent.concept) {
        merged[matchIndex] = {
          ...noteIntentItem(intent, index),
          placementNotes: match.placementNotes,
        };
      }
      return;
    }
    merged.push(noteIntentItem(intent, index));
  });
  return merged;
}

function applyEdits(item: PlannedFurnishingItem, edits?: FurnishingPlanEdits): PlannedFurnishingItem {
  if (!edits) return item;
  let category = edits.category?.trim() || item.category;
  const concept = inferFurnitureConceptFromText(`${category} ${(edits.constraints ?? item.constraints).join(" ")}`);
  if (isAtomicLightingConcept(concept)) {
    category = lightingCategory(concept);
  }
  return {
    ...item,
    category,
    quantity: clampQuantity(concept, edits.quantity !== undefined ? edits.quantity : item.quantity),
    placementNotes: edits.placementNotes !== undefined ? edits.placementNotes : item.placementNotes,
    constraints: edits.constraints ? sanitizeConstraints(edits.constraints) : item.constraints,
    rationale: edits.rationale !== undefined ? edits.rationale : item.rationale,
    concept: concept === "other" ? item.concept : concept,
    displayLabel: displayLabelFor(concept === "other" ? item.concept : concept, category),
  };
}

function addedItemToPlan(item: FurnishingPlanAddedItem, used: Map<string, number>): PlannedFurnishingItem {
  const concept = inferFurnitureConceptFromText(item.category);
  const identitySlug = furnitureConceptIdentitySlug(concept, item.category);
  const key =
    item.key.trim() ||
    stableFurnitureRequirementKey(identitySlug, nextOccurrence(used, `user:${identitySlug}`));
  return {
    requirementKey: key,
    concept,
    category: item.category,
    quantity: clampQuantity(concept, item.quantity),
    placementNotes: item.placementNotes,
    constraints: sanitizeConstraints(item.constraints),
    rationale: item.rationale?.trim() || "Added by you.",
    role: "required_for_render",
    source: "user_structured",
    displayLabel: displayLabelFor(concept, item.category),
  };
}

export function normalizeFurnishingPlan(input: {
  analysisRequirements: DesignRequirements;
  observation?: RoomAnalysisObservation | null;
  preferences?: ShoppingPreferenceInput | null;
  planOverrides?: FurnishingPlanOverrides | null;
  analysisId?: string | null;
}): NormalizedFurnishingPlan {
  const notes = input.preferences?.notes ?? "";
  const noteIntents = extractShoppingIntentsFromNotes(notes);
  const userRequested = new Set(noteIntents.map((intent) => intent.concept));
  const generated = mergeNoteIntents(
    applyKeepSuppressions(
      buildAnalysisItems(input.analysisRequirements, input.observation),
      keptConceptsFromObservation(input.observation),
      suppressedFromNotes(notes),
      userRequested
    ),
    noteIntents
  );

  const overrides = parseFurnishingPlanOverrides(input.planOverrides);
  const overridesApply =
    !overrides.sourceAnalysisId || !input.analysisId || overrides.sourceAnalysisId === input.analysisId;
  const removedKeys = new Set(overridesApply ? overrides.removedRequirementKeys : []);
  const acceptedKeys = new Set(overridesApply ? overrides.acceptedSuggestionKeys : []);
  const edits = overridesApply ? overrides.editedRequirements : {};
  const added = overridesApply ? overrides.addedRequirements : [];

  const used = new Map<string, number>();
  for (const item of generated) {
    const slug = furnitureConceptIdentitySlug(item.concept, item.category);
    const match = item.requirementKey.match(/:(\d+)$/);
    const occurrence = match ? Number(match[1]) + 1 : 1;
    used.set(slug, Math.max(used.get(slug) ?? 0, occurrence));
  }

  const afterEdits = generated.map((item) => applyEdits(item, edits[item.requirementKey]));
  const removed = afterEdits.filter((item) => removedKeys.has(item.requirementKey));
  const remaining = afterEdits.filter((item) => !removedKeys.has(item.requirementKey));
  const promoted = remaining.map((item) =>
    acceptedKeys.has(item.requirementKey) ? { ...item, role: "required_for_render" as const } : item
  );

  const withAdded = [...promoted];
  for (const extra of added) {
    if (removedKeys.has(extra.key)) continue;
    if (withAdded.some((item) => item.requirementKey === extra.key)) continue;
    const planned = addedItemToPlan(extra, used);
    if (
      planned.concept !== "other" &&
      withAdded.some(
        (item) => item.role === "required_for_render" && conceptsOverlap(item.concept, planned.concept)
      )
    ) {
      continue;
    }
    withAdded.push(planned);
  }

  const searchable = withAdded.map((item) => {
    if (item.role === "required_for_render" && (item.concept === "lighting" || /\bor\b/i.test(item.category))) {
      return {
        ...item,
        role: "suggested_only" as const,
        rationale: item.rationale || "Needs a more specific product type before searching stores.",
      };
    }
    return item;
  });

  return {
    generated,
    required: searchable.filter((item) => item.role === "required_for_render"),
    suggested: searchable.filter((item) => item.role === "suggested_only"),
    removed,
  };
}
