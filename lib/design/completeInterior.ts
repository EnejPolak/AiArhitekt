import type { ObservedRoomType, RoomAnalysisObservation } from "@/lib/analysis/schema";
import { inferFurnitureConceptFromText } from "@/lib/discovery/locales/concepts";
import type { ProductConcept } from "@/lib/discovery/locales/types";
import type { BriefPlannerIntent } from "@/lib/design-brief/apply";
import { completenessSpecsForRoom, evaluateRoomSpecs, overlayBriefDecision } from "./completenessRooms";
import {
  hasCeilingWiringEvidence,
  isUnfinishedConstruction,
  observationText,
} from "./unfinishedRoom";

export type CompletenessDecision =
  | "required"
  | "required_present"
  | "suggested"
  | "not_appropriate"
  | "satisfied_existing"
  | "needs_preference"
  | "design_proposal";

export type CompletenessCategory = {
  concept: ProductConcept;
  category: string;
  decision: CompletenessDecision;
  rationale: string;
};

const LIVING_ROOM_EVALUATION: Array<{
  concept: ProductConcept;
  category: string;
  evaluate: (ctx: EvaluationContext) => CompletenessDecision;
  rationale: (decision: CompletenessDecision, ctx: EvaluationContext) => string;
}> = [
  {
    concept: "sofa",
    category: "sofa",
    evaluate: (ctx) => (ctx.hasConcept("sofa") ? "required_present" : "required"),
    rationale: (decision) =>
      decision === "required_present"
        ? "Primary seating is already in the furnishing plan."
        : "A living room needs primary seating unless one is already kept.",
  },
  {
    concept: "coffee_table",
    category: "coffee table",
    evaluate: (ctx) => {
      if (ctx.hasConcept("coffee_table")) return "required_present";
      return ctx.needsLivingCore ? "required" : "suggested";
    },
    rationale: (decision) =>
      decision === "required_present"
        ? "A central table is already planned."
        : decision === "required"
          ? "A coffee table is a functional surface in front of living-room seating."
          : "A coffee table is useful in front of seating but is optional in an already furnished living room.",
  },
  {
    concept: "rug",
    category: "rug",
    evaluate: (ctx) => {
      if (ctx.hasConcept("rug")) return "required_present";
      return ctx.needsLivingCore ? "required" : "suggested";
    },
    rationale: (decision) =>
      decision === "required_present"
        ? "A rug is already planned."
        : decision === "required"
          ? "A rug grounds the seating group on an open living-room floor."
          : "A rug can ground seating but is optional when the room is already furnished.",
  },
  {
    concept: "ceiling_light",
    category: "ceiling light fixture",
    evaluate: (ctx) => {
      if (ctx.hasConcept("ceiling_light")) return "required_present";
      if (ctx.kept.has("ceiling_light")) return "satisfied_existing";
      if (ctx.needsCeilingLight) return "required";
      return "not_appropriate";
    },
    rationale: (decision, ctx) => {
      if (decision === "required_present") return "Main ceiling lighting is already planned.";
      if (decision === "satisfied_existing") return "An existing ceiling fixture is marked to keep.";
      if (ctx.needsCeilingLight) {
        return "Ceiling electrical points or unfinished wiring require a ceiling fixture; a floor lamp does not finish hanging wires.";
      }
      return "No ceiling-fixture evidence; do not force a ceiling light.";
    },
  },
  {
    concept: "tv_console",
    category: "TV console",
    evaluate: (ctx) => {
      if (ctx.hasConcept("tv_console")) return "required_present";
      if (ctx.declinesMedia) return "not_appropriate";
      if (ctx.mentionsMedia) return "required";
      return "needs_preference";
    },
    rationale: (decision) => {
      if (decision === "required_present") return "A media unit is already planned.";
      if (decision === "not_appropriate") {
        return "You indicated no television, so a TV unit is not used.";
      }
      if (decision === "needs_preference") {
        return "An empty construction photo does not establish that you do not want a television. A coherent living room often includes a media wall on a solid wall facing the sofa, not on the window wall.";
      }
      return "Media intent is present, so a TV console is necessary for a complete living room.";
    },
  },
  {
    concept: "storage",
    category: "storage",
    evaluate: (ctx) => {
      if (ctx.hasConcept("storage") || ctx.hasConcept("wardrobe")) return "required_present";
      if (ctx.kept.has("storage") || ctx.kept.has("wardrobe")) return "satisfied_existing";
      return "suggested";
    },
    rationale: (decision) =>
      decision === "required_present" || decision === "satisfied_existing"
        ? "Storage is already covered."
        : "An empty photograph does not mean the room will stay object-free. Low closed storage or a shelf beside the seating group is a design recommendation, not a mandatory purchase.",
  },
  {
    concept: "window_treatment",
    category: "window treatment",
    evaluate: (ctx) => {
      if (ctx.hasConcept("window_treatment")) return "required_present";
      if (!ctx.hasWindows) return "not_appropriate";
      if (ctx.needsWindowTreatment) return "required";
      return "suggested";
    },
    rationale: (decision, ctx) => {
      if (decision === "required_present") return "Window treatment is already planned.";
      if (decision === "not_appropriate") return "No windows are observed, so curtains are not appropriate.";
      if (ctx.needsWindowTreatment) {
        return "This empty or unfinished living room has windows; curtains are required to finish glare control and the window wall.";
      }
      return "Windows exist; curtains remain optional because the room is already furnished and no glare issue is evident.";
    },
  },
  {
    concept: "floor_lamp",
    category: "floor lamp",
    evaluate: (ctx) => {
      if (ctx.hasConcept("floor_lamp")) return "required_present";
      if (ctx.hasAnyLighting || ctx.needsCeilingLight) return "suggested";
      return "required";
    },
    rationale: (decision) =>
      decision === "required_present"
        ? "Ambient floor lighting is already planned."
        : decision === "required"
          ? "The room has no usable lighting, so a floor lamp is required."
          : "Layered ambient lighting beside seating is a design recommendation for evening use, not implied or ruled out by the empty photograph.",
  },
  {
    concept: "other",
    category: "restrained decoration",
    evaluate: () => "design_proposal",
    rationale: () =>
      "One quiet artwork or textile on a solid wall, not the window wall, would finish the interior. This is a styling recommendation, not a shoppable listing unless you add it.",
  },
];

type EvaluationContext = {
  roomType: ObservedRoomType;
  planned: Set<ProductConcept>;
  kept: Set<ProductConcept>;
  hasWindows: boolean;
  mentionsMedia: boolean;
  declinesMedia: boolean;
  needsCeilingLight: boolean;
  needsWindowTreatment: boolean;
  needsLivingCore: boolean;
  hasAnyLighting: boolean;
  hasConcept: (concept: ProductConcept) => boolean;
};

function keptConcepts(observation?: RoomAnalysisObservation | null): Set<ProductConcept> {
  const kept = new Set<ProductConcept>();
  if (!observation) return kept;
  for (const element of observation.existingElements ?? []) {
    if (element.disposition !== "likely_keep") continue;
    const concept = inferFurnitureConceptFromText(element.description);
    if (concept !== "other") kept.add(concept);
  }
  for (const fixed of observation.architecture?.fixedElements ?? []) {
    const concept = inferFurnitureConceptFromText(fixed);
    if (concept !== "other") kept.add(concept);
  }
  return kept;
}

function isEmptyOrUnfurnished(observation?: RoomAnalysisObservation | null): boolean {
  const blob = observationText(observation);
  return /\bempty\b|\bunfurnished\b|\bnearly empty\b/.test(blob);
}

export function mediaPreferenceFromText(text: string): { mentions: boolean; declines: boolean } {
  const blob = text.toLowerCase();
  return {
    declines: /\bno\s+(?:tv|television|media(?:\s+unit|\s+console)?)\b|\bwithout\s+(?:a\s+)?(?:tv|television)\b/.test(
      blob
    ),
    mentions: /\btv\b|\btelevision\b|\bmedia\s+(?:wall|unit|console|furniture)\b/.test(blob),
  };
}

function contextFrom(
  observation: RoomAnalysisObservation | null | undefined,
  plannedConcepts: ProductConcept[],
  userNotes?: string | null,
  brief?: BriefPlannerIntent | null
): EvaluationContext {
  const planned = new Set<ProductConcept>(plannedConcepts.filter((item) => item !== "other"));
  const blob = [observationText(observation), userNotes ?? "", brief?.excludeText ?? "", brief?.keepText ?? ""]
    .filter(Boolean)
    .join(" ");
  const kept = keptConcepts(observation);
  const hasConcept = (concept: ProductConcept) => planned.has(concept) || kept.has(concept);
  const unfinished = isUnfinishedConstruction(observation);
  const wiring = hasCeilingWiringEvidence(observation);
  const media = mediaPreferenceFromText(blob);
  const declinesMedia = media.declines || brief?.tvWanted === false || brief?.concepts.tv_console === "exclude";
  const mentionsMedia = (media.mentions && !media.declines) || brief?.tvWanted === true;
  const hasAnyLighting =
    hasConcept("ceiling_light") ||
    hasConcept("floor_lamp") ||
    hasConcept("pendant_light") ||
    hasConcept("table_lamp") ||
    hasConcept("wall_light") ||
    hasConcept("lighting");
  const roomType = (brief?.roomType ?? observation?.roomType ?? "unknown") as ObservedRoomType;
  return {
    roomType,
    planned,
    kept,
    hasWindows: (observation?.architecture?.windows?.length ?? 0) > 0,
    mentionsMedia,
    declinesMedia,
    needsCeilingLight: wiring || (unfinished && !hasAnyLighting && !kept.has("ceiling_light")),
    needsWindowTreatment:
      (observation?.architecture?.windows?.length ?? 0) > 0 &&
      (unfinished || isEmptyOrUnfurnished(observation) || /\bglare\b/.test(blob) || brief?.curtainKind != null),
    needsLivingCore: unfinished || isEmptyOrUnfurnished(observation),
    hasAnyLighting,
    hasConcept,
  };
}

export function evaluateInteriorCompleteness(input: {
  observation?: RoomAnalysisObservation | null;
  plannedConcepts: ProductConcept[];
  userNotes?: string | null;
  brief?: BriefPlannerIntent | null;
}): CompletenessCategory[] {
  const ctx = contextFrom(input.observation, input.plannedConcepts, input.userNotes, input.brief);
  const brief = input.brief ?? null;
  if (ctx.roomType === "living-room") {
    return LIVING_ROOM_EVALUATION.map((item) => {
      const decision = item.evaluate(ctx);
      return overlayBriefDecision(
        {
          concept: item.concept,
          category: item.category,
          decision,
          rationale: item.rationale(decision, ctx),
        },
        brief
      );
    });
  }
  const specs = completenessSpecsForRoom(ctx.roomType, brief);
  if (specs.length === 0) {
    return LIVING_ROOM_EVALUATION.filter((item) => ctx.hasConcept(item.concept)).map((item) => ({
      concept: item.concept,
      category: item.category,
      decision: "required_present" as const,
      rationale: "Already present in the plan for this room type.",
    }));
  }
  const evaluated = evaluateRoomSpecs(specs, ctx.hasConcept, brief);
  if (ctx.hasWindows) return evaluated;
  return evaluated.map((item) =>
    item.concept === "window_treatment" && item.decision !== "required_present"
      ? {
          ...item,
          decision: "not_appropriate" as const,
          rationale: "No windows are observed, so curtains are not appropriate.",
        }
      : item
  );
}

export function extraCompletenessItems(input: {
  observation?: RoomAnalysisObservation | null;
  plannedConcepts: ProductConcept[];
  userNotes?: string | null;
  brief?: BriefPlannerIntent | null;
}): CompletenessCategory[] {
  return evaluateInteriorCompleteness(input).filter(
    (item) => item.decision === "required" || item.decision === "suggested"
  );
}

export function suggestedCompletenessItems(input: {
  observation?: RoomAnalysisObservation | null;
  plannedConcepts: ProductConcept[];
  userNotes?: string | null;
  brief?: BriefPlannerIntent | null;
}): CompletenessCategory[] {
  return evaluateInteriorCompleteness(input).filter((item) => item.decision === "suggested");
}
