import type { DesignRequirements, RoomAnalysisObservation } from "@/lib/analysis/schema";
import { inferFurnitureConceptFromText } from "@/lib/discovery/locales/concepts";
import type { ProductConcept } from "@/lib/discovery/locales/types";
import { evaluateInteriorCompleteness, type CompletenessCategory } from "./completeInterior";
import { buildDesignConcept, type InteriorDesignConcept } from "./designConcept";
import { planFurnitureLayout, type LayoutPlan } from "./layoutPlan";
import { planLightingDesign, type LightingDesign } from "./lightingDesign";
import {
  exactDimensionsKnown,
  hasCeilingWiringEvidence,
  isUnfinishedConstruction,
} from "./unfinishedRoom";

export type InteriorDesignBrief = {
  roomType: string;
  unfinishedConstruction: boolean;
  visualCompletion: boolean;
  exactDimensionsKnown: boolean;
  completeness: CompletenessCategory[];
  layout: LayoutPlan;
  concept: InteriorDesignConcept;
  lighting: LightingDesign;
  verifiedObservations: string[];
  inferredAssumptions: string[];
  unknownMeasurements: string[];
};

export function plannedConceptsFromRequirements(
  requirements?: DesignRequirements | null,
  extraLabels: string[] = []
): ProductConcept[] {
  const labels = [
    ...(requirements?.furnitureNeeds ?? []).map((item) => item.category),
    ...extraLabels,
  ];
  return [
    ...new Set(
      labels
        .map((label) => inferFurnitureConceptFromText(label))
        .filter((concept): concept is ProductConcept => concept !== "other")
    ),
  ];
}

export function buildInteriorDesignBrief(input: {
  observation?: RoomAnalysisObservation | null;
  requirements?: DesignRequirements | null;
  plannedConcepts?: ProductConcept[];
  selectedStyles?: string[];
  userNotes?: string | null;
  brief?: import("@/lib/design-brief/apply").BriefPlannerIntent | null;
}): InteriorDesignBrief {
  const observation = input.observation ?? null;
  const plannedConcepts =
    input.plannedConcepts && input.plannedConcepts.length > 0
      ? input.plannedConcepts
      : plannedConceptsFromRequirements(input.requirements);
  const unfinishedConstruction = isUnfinishedConstruction(observation);
  const layout = planFurnitureLayout({
    observation,
    plannedConcepts,
    userNotes: input.userNotes,
    brief: input.brief,
  });
  const concept = buildDesignConcept({
    observation,
    selectedStyles: input.selectedStyles,
    brief: input.brief,
  });
  const lighting = planLightingDesign({ observation, plannedConcepts, brief: input.brief });
  const completeness = evaluateInteriorCompleteness({
    observation,
    plannedConcepts,
    userNotes: input.userNotes,
    brief: input.brief,
  });

  const verifiedObservations = [
    observation?.roomType ? `Room type: ${observation.roomType}` : null,
    ...(observation?.architecture?.walls ?? []).map((item) => `Wall: ${item}`),
    observation?.architecture?.floor ? `Floor: ${observation.architecture.floor}` : null,
    ...(observation?.architecture?.windows ?? []).map((item) => `Window: ${item}`),
    ...(observation?.architecture?.doors ?? []).map((item) => `Door: ${item}`),
    ...(observation?.architecture?.fixedElements ?? []).map((item) => `Fixed: ${item}`),
    ...(observation?.existingElements ?? []).map(
      (item) => `Existing (${item.disposition}): ${item.description}`
    ),
    observation?.visualCondition?.overall
      ? `Condition: ${observation.visualCondition.overall}`
      : null,
    observation?.visualCondition?.lighting
      ? `Lighting: ${observation.visualCondition.lighting}`
      : null,
  ].filter((line): line is string => Boolean(line));

  const inferredAssumptions = [
    `Layout selected: ${layout.options.find((item) => item.selected)?.title ?? layout.selectedOptionId}.`,
    `Design character: ${concept.character}`,
    "The empty construction photograph is architectural evidence, not a statement that the user wants no television, storage, or decoration.",
    `Media wall: ${layout.mediaWall.status}. ${layout.mediaWall.sofaRelationship}`,
    input.brief?.tvWanted === false ? "The user does not want a television." : null,
    input.brief?.tvWanted === true
      ? `The user wants a television${input.brief.tvSize ? ` (about ${input.brief.tvSize})` : ""}. Place it on a solid wall facing the sofa, not on the window wall.`
      : null,
    input.brief?.curtainKind && input.brief.curtainKind !== "none"
      ? `Window treatment preference: ${input.brief.curtainKind}.`
      : null,
    input.brief?.plumbingUnverified
      ? "Do not silently relocate plumbing, drainage, ventilation, or electrical connections. Treat any installation change as an unverified design proposal requiring professional validation."
      : null,
    input.brief?.colorsDislike.length
      ? `Avoid these colors: ${input.brief.colorsDislike.join(", ")}.`
      : null,
    unfinishedConstruction
      ? "Unfinished surfaces will be visually completed as a design proposal, not as verified construction or a shoppable finish SKU."
      : null,
    hasCeilingWiringEvidence(observation)
      ? "Ceiling wiring evidence is treated as an existing electrical point to finish, not as a new circuit."
      : null,
  ].filter((line): line is string => Boolean(line));

  const unknownMeasurements = exactDimensionsKnown(observation)
    ? []
    : [
        "Exact room dimensions are unknown. Do not invent meters, centimetres, or clearances.",
        ...layout.missingMeasurements,
      ];

  return {
    roomType: input.brief?.roomType ?? observation?.roomType ?? "unknown",
    unfinishedConstruction,
    visualCompletion: unfinishedConstruction,
    exactDimensionsKnown: exactDimensionsKnown(observation),
    completeness,
    layout,
    concept,
    lighting,
    verifiedObservations,
    inferredAssumptions,
    unknownMeasurements,
  };
}

export function formatInteriorDesignBriefForPrompt(brief: InteriorDesignBrief): string {
  const completenessLines = brief.completeness.map(
    (item) => `- ${item.category}: ${item.decision}. ${item.rationale}`
  );
  const layoutLines = brief.layout.options.map(
    (item) =>
      `- ${item.selected ? "SELECTED" : "not selected"} ${item.title}: ${item.rationale}`
  );
  const lightingLines = brief.lighting.layers.map(
    (item) =>
      `- ${item.kind}${item.present ? "" : " (not in inventory)"}: ${item.placement}`
  );

  return [
    "INTERIOR DESIGN BRIEF",
    "This is an autonomous interior-design visualization of the customer's original room, not product-catalog placement.",
    `Room type: ${brief.roomType}.`,
    "VERIFIED OBSERVATIONS (from the photograph):",
    ...(brief.verifiedObservations.length > 0
      ? brief.verifiedObservations.map((line) => `- ${line}`)
      : ["- No additional verified notes."]),
    "INFERRED DESIGN DECISIONS (not measured facts):",
    ...brief.inferredAssumptions.map((line) => `- ${line}`),
    "UNKNOWN / UNVERIFIED:",
    ...(brief.unknownMeasurements.length > 0
      ? brief.unknownMeasurements.map((line) => `- ${line}`)
      : ["- No additional unknown measurements listed."]),
    "Physical fit is NOT VERIFIED unless exact dimensions are known. Do not invent room or product dimensions.",
    "FURNISHING COMPLETENESS (evaluate; do not invent unapproved shoppable products):",
    ...completenessLines,
    "LAYOUT PLAN:",
    brief.layout.selectedRationale,
    `Sofa orientation: ${brief.layout.options.find((item) => item.selected)?.sofaOrientation ?? ""}`,
    `Media wall (${brief.layout.mediaWall.status}): ${brief.layout.mediaWall.sofaRelationship}`,
    `- Glare: ${brief.layout.mediaWall.glare}`,
    `- Circulation: ${brief.layout.mediaWall.circulation}`,
    `- Electrical: ${brief.layout.mediaWall.electrical}`,
    ...layoutLines,
    "Do not center the sofa in the room because it looks attractive in a product photograph.",
    "DESIGN LANGUAGE:",
    `- Character: ${brief.concept.character}`,
    `- Primary colors: ${brief.concept.primaryColors.join(", ")}`,
    `- Secondary colors: ${brief.concept.secondaryColors.join(", ")}`,
    `- Wall finish: ${brief.concept.wallFinish}`,
    `- Flooring: ${brief.concept.flooringTreatment}`,
    `- Wood/metal: ${brief.concept.woodMetal}`,
    `- Textiles: ${brief.concept.textilePalette}`,
    `- Lighting temperature: ${brief.concept.lightingTemperature}`,
    `- Proportions: ${brief.concept.furnishingProportions}`,
    "LAYERED LIGHTING:",
    ...lightingLines,
    `- Daylight: ${brief.lighting.daylight}`,
    `- Evening: ${brief.lighting.evening}`,
    `- Wiring: ${brief.lighting.wiringInstruction}`,
    `- Avoid: ${brief.lighting.avoid.join("; ")}`,
    "FIXED ARCHITECTURE:",
    "The original room is the architectural source of truth.",
    "Do not silently move windows, doors, walls, electrical outlets, or other fixed architectural features.",
    ...(brief.layout.preserveArchitecture.length > 0
      ? brief.layout.preserveArchitecture.map((line) => `- Preserve: ${line}`)
      : ["- Preserve photographed openings and fixed elements."]),
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}
