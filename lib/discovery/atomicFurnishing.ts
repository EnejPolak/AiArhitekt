import type { FurniturePlanRole, RoomAnalysisObservation } from "@/lib/analysis/schema";
import { inferFurnitureConceptFromText, isArchitecturalFinishText } from "./locales/concepts";
import type { ProductConcept } from "./locales/types";
import { normalizeMatchText } from "@/lib/text/diacritics";
import type { FurnitureNeed } from "./itemSpecs";

export const ATOMIC_LIGHTING_CONCEPTS = [
  "ceiling_light",
  "pendant_light",
  "floor_lamp",
  "table_lamp",
  "wall_light",
] as const;

export type AtomicLightingConcept = (typeof ATOMIC_LIGHTING_CONCEPTS)[number];

const LIGHTING_CONCEPTS: ProductConcept[] = ["lighting", ...ATOMIC_LIGHTING_CONCEPTS];

const ATOMIC_LABELS: Record<AtomicLightingConcept, string> = {
  ceiling_light: "ceiling light fixture",
  pendant_light: "pendant light",
  floor_lamp: "floor lamp",
  table_lamp: "table lamp",
  wall_light: "wall light",
};

const ATOMIC_DISPLAY_LABELS: Record<AtomicLightingConcept, string> = {
  ceiling_light: "Ceiling light fixture",
  pendant_light: "Pendant light",
  floor_lamp: "Floor lamp",
  table_lamp: "Table lamp",
  wall_light: "Wall light",
};

const UMBRELLA_CATEGORIES = new Set([
  "lighting",
  "lamp",
  "light",
  "svetilo",
  "svetilka",
  "storage",
  "seating",
  "table",
  "decor",
  "shelving",
  "cabinet",
]);

export type AtomicFurnishingResolution = {
  concept: ProductConcept;
  category: string;
  displayLabel: string;
  role: FurniturePlanRole;
  rationale: string | null;
  placementNotes: string | null;
  quantity: number | null;
  suggestedAlternatives: AtomicLightingConcept[];
};

export function isLightingConcept(concept: ProductConcept): boolean {
  return LIGHTING_CONCEPTS.includes(concept);
}

export function isAtomicLightingConcept(concept: ProductConcept): concept is AtomicLightingConcept {
  return (ATOMIC_LIGHTING_CONCEPTS as readonly string[]).includes(concept);
}

export function lightingCategory(concept: AtomicLightingConcept): string {
  return ATOMIC_LABELS[concept];
}

export function lightingDisplayLabel(concept: ProductConcept, category: string): string {
  if (isAtomicLightingConcept(concept)) {
    return ATOMIC_DISPLAY_LABELS[concept];
  }
  return titleCase(category);
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function observationBlob(observation?: RoomAnalysisObservation | null): string {
  if (!observation) return "";
  const parts = [
    ...(observation.architecture?.walls ?? []),
    observation.architecture?.floor ?? "",
    ...(observation.architecture?.windows ?? []),
    ...(observation.architecture?.doors ?? []),
    ...(observation.architecture?.fixedElements ?? []),
    ...(observation.existingElements ?? []).map((item) => item.description),
    observation.visualCondition?.lighting ?? "",
    observation.visualCondition?.overall ?? "",
    ...(observation.constraints ?? []),
    ...(observation.measurementStatus?.qualitativeNotes ?? []),
  ];
  return normalizeMatchText(parts.filter(Boolean).join(" "));
}

function needBlob(need: Pick<FurnitureNeed, "category" | "constraints" | "placementNotes" | "rationale">): string {
  return normalizeMatchText(
    `${need.category} ${need.placementNotes ?? ""} ${(need.constraints ?? []).join(" ")} ${need.rationale ?? ""}`
  );
}

function hasProductClassOr(text: string): boolean {
  return /\b(ceiling|floor|pendant|table|wall|shelving|cabinet|chair|bench|sofa|lamp|light|console|bookcase|storage)\b.{0,48}\bor\b.{0,48}\b(ceiling|floor|pendant|table|wall|shelving|cabinet|chair|bench|sofa|lamp|light|console|bookcase|storage)\b/.test(
    text
  );
}

function lightingTypesInText(text: string): AtomicLightingConcept[] {
  const found: AtomicLightingConcept[] = [];
  if (/pendant/.test(text)) found.push("pendant_light");
  if (/floor\s+lamp|standing\s+lamp|stoje/.test(text) || (/\bfloor\b/.test(text) && /\blamp/.test(text))) {
    found.push("floor_lamp");
  }
  if (/table\s+lamp|namizn/.test(text)) found.push("table_lamp");
  if (/wall\s+(?:light|lamp|sconce)|stenska\s+svetil/.test(text)) found.push("wall_light");
  if (/ceiling|stropn|plafon/.test(text) && /lamp|light|fixture|fitting|svetil/.test(text)) {
    found.push("ceiling_light");
  }
  return [...new Set(found)];
}

export function hasCeilingElectricalEvidence(observation?: RoomAnalysisObservation | null): boolean {
  const blob = observationBlob(observation);
  if (!blob) return false;
  return (
    /\b(dangling|exposed|loose)\b.{0,24}\b(wires?|cables?|flexes?)\b/.test(blob) ||
    /\b(wires?|cables?|flexes?)\b.{0,24}\b(ceiling|dangling|exposed)\b/.test(blob) ||
    /\bceiling\s+(electrical|wiring|wires?|outlet|rose|point|box|fixture)\b/.test(blob) ||
    /\belectrical\s+(point|outlet|wire|box|fitting)s?\b/.test(blob) ||
    /\blight\s+points?\b/.test(blob) ||
    /\bjunction\s+box\b/.test(blob) ||
    /\bmissing\s+(?:a\s+)?(?:ceiling\s+)?(?:light\s+)?fixtures?\b/.test(blob)
  );
}

function hasExistingLighting(observation?: RoomAnalysisObservation | null): boolean {
  if (!observation) return false;
  for (const element of observation.existingElements ?? []) {
    if (element.disposition === "likely_remove") continue;
    if (isLightingConcept(inferFurnitureConceptFromText(element.description))) return true;
  }
  for (const fixed of observation.architecture?.fixedElements ?? []) {
    if (isLightingConcept(inferFurnitureConceptFromText(fixed))) return true;
  }
  return false;
}

function unfinishedRoomMissingFixtures(observation?: RoomAnalysisObservation | null): boolean {
  if (!observation || hasExistingLighting(observation)) return false;
  return /\bunfinished\b/.test(observationBlob(observation));
}

function floorLampPlacementEvidence(text: string): boolean {
  return (
    /\bnext\s+to\s+(?:the\s+)?sofa\b/.test(text) ||
    /\bbeside\s+(?:the\s+)?(?:sofa|seating|armchair)\b/.test(text) ||
    /\bstanding\s+lamp\b/.test(text) ||
    (/\bfloor\s+lamp\b/.test(text) && !hasProductClassOr(text))
  );
}

function ceilingOnlyEvidence(text: string): boolean {
  return /ceiling|stropn|plafon/.test(text) && /lamp|light|fixture|fitting|svetil/.test(text) && !hasProductClassOr(text);
}

function resolveLightingConcept(
  need: FurnitureNeed,
  observation?: RoomAnalysisObservation | null
): { concept: AtomicLightingConcept | null; alternatives: AtomicLightingConcept[]; ambiguous: boolean } {
  const blob = needBlob(need);
  const inferred = inferFurnitureConceptFromText(
    `${need.category} ${need.placementNotes ?? ""} ${(need.constraints ?? []).join(" ")}`
  );
  if (isAtomicLightingConcept(inferred) && !hasProductClassOr(blob)) {
    return { concept: inferred, alternatives: [], ambiguous: false };
  }

  const alternatives = lightingTypesInText(blob);
  const ceilingEvidence =
    hasCeilingElectricalEvidence(observation) || unfinishedRoomMissingFixtures(observation);
  const floorEvidence = floorLampPlacementEvidence(blob);
  const ceilingOnly = ceilingOnlyEvidence(blob);

  if (inferred === "pendant_light" || alternatives.length === 1 && alternatives[0] === "pendant_light") {
    return { concept: "pendant_light", alternatives: [], ambiguous: false };
  }
  if (floorEvidence && !ceilingEvidence && !ceilingOnly) {
    return { concept: "floor_lamp", alternatives: [], ambiguous: false };
  }
  if (ceilingEvidence || ceilingOnly) {
    const extra = alternatives.filter((item) => item !== "ceiling_light");
    return { concept: "ceiling_light", alternatives: extra, ambiguous: false };
  }
  if (alternatives.length > 1 || hasProductClassOr(blob) || inferred === "lighting") {
    return {
      concept: null,
      alternatives: alternatives.length > 0 ? alternatives : ["ceiling_light", "floor_lamp"],
      ambiguous: true,
    };
  }
  if (isAtomicLightingConcept(inferred)) {
    return { concept: inferred, alternatives: [], ambiguous: false };
  }
  return { concept: null, alternatives: [], ambiguous: true };
}

function isUmbrellaCategory(category: string): boolean {
  return UMBRELLA_CATEGORIES.has(normalizeMatchText(category).replace(/\s+/g, " ").trim());
}

export function resolveAtomicFurnishingNeed(
  need: FurnitureNeed,
  observation?: RoomAnalysisObservation | null
): AtomicFurnishingResolution | null {
  const blob = needBlob(need);
  if (isArchitecturalFinishText(blob) || isArchitecturalFinishText(need.category)) return null;

  const inferred = inferFurnitureConceptFromText(need.category);

  if (isLightingConcept(inferred) || isUmbrellaCategory(need.category) || hasProductClassOr(need.category)) {
    const lighting = resolveLightingConcept(need, observation);
    if (lighting.concept) {
      const category = ATOMIC_LABELS[lighting.concept];
      const placement =
        lighting.concept === "ceiling_light"
          ? "ceiling"
          : lighting.concept === "floor_lamp"
            ? need.placementNotes && !hasProductClassOr(need.placementNotes)
              ? need.placementNotes
              : "beside seating"
            : lighting.concept === "pendant_light"
              ? need.placementNotes
              : need.placementNotes && !hasProductClassOr(need.placementNotes)
                ? need.placementNotes
                : null;
      const rationale =
        lighting.concept === "ceiling_light"
          ? "Functional main lighting; ceiling electrical points are present but fixtures are missing."
          : need.rationale?.trim() || null;
      return {
        concept: lighting.concept,
        category,
        displayLabel: titleCase(category),
        role: need.role === "suggested_only" ? "suggested_only" : "required_for_render",
        rationale,
        placementNotes: placement,
        quantity: null,
        suggestedAlternatives: lighting.alternatives,
      };
    }
    return {
      concept: "lighting",
      category: need.category,
      displayLabel: titleCase(need.category),
      role: "suggested_only",
      rationale: "Needs a more specific lighting type before searching stores.",
      placementNotes: need.placementNotes,
      quantity: null,
      suggestedAlternatives: lighting.alternatives,
    };
  }

  if (hasProductClassOr(blob) || isUmbrellaCategory(need.category)) {
    if (need.role === "suggested_only") {
      return {
        concept: inferred,
        category: need.category,
        displayLabel: titleCase(need.category),
        role: "suggested_only",
        rationale: need.rationale?.trim() || "Needs a more specific product type before searching stores.",
        placementNotes: need.placementNotes,
        quantity: need.quantity,
        suggestedAlternatives: [],
      };
    }
    return {
      concept: inferred,
      category: need.category,
      displayLabel: titleCase(need.category),
      role: "suggested_only",
      rationale: "Needs a more specific product type before searching stores.",
      placementNotes: need.placementNotes,
      quantity: need.quantity,
      suggestedAlternatives: [],
    };
  }

  return {
    concept: inferred,
    category: need.category,
    displayLabel: inferred === "other" ? titleCase(need.category) : "",
    role: need.role === "suggested_only" ? "suggested_only" : "required_for_render",
    rationale: need.rationale?.trim() || null,
    placementNotes: need.placementNotes,
    quantity: need.quantity,
    suggestedAlternatives: [],
  };
}
