import type { DesignRequirements, RoomAnalysisObservation } from "@/lib/analysis/schema";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import type { OrderedRenderReference } from "./order";
import type { RoomRenderPreferences } from "./preferences";
import { canonicalRenderPreferences } from "./preferences";

export type RenderPromptSnapshot = {
  schemaVersion: 1;
  prompt: string;
  imageMapping: Array<{
    imageIndex: number;
    role: "original_room" | "product_reference";
    selectionId: string | null;
    requirementKey: string | null;
    requirementType: "furniture" | "material" | null;
    productTitle: string | null;
  }>;
};

export type BuildRenderPromptInput = {
  observation: RoomAnalysisObservation;
  designRequirements: DesignRequirements;
  unmatchedRequirements: UnmatchedRequirement[];
  preferences: RoomRenderPreferences;
  references: OrderedRenderReference[];
};

function joinNotes(notes: string[]): string {
  return notes.filter(Boolean).join("; ");
}

function requirementLabel(item: OrderedRenderReference): string {
  const snap = item.selection.requirementSnapshot as { category?: unknown; surface?: unknown } | null;
  if (snap && typeof snap.category === "string") {
    if (item.selection.requirementType === "material" && typeof snap.surface === "string") {
      return `${snap.surface} (${snap.category})`;
    }
    return snap.category;
  }
  return item.selection.itemSpec;
}

export function buildRoomRenderPrompt(input: BuildRenderPromptInput): RenderPromptSnapshot {
  const preferences = canonicalRenderPreferences(input.preferences);
  const mapping: RenderPromptSnapshot["imageMapping"] = [
    {
      imageIndex: 1,
      role: "original_room",
      selectionId: null,
      requirementKey: null,
      requirementType: null,
      productTitle: null,
    },
    ...input.references.map((item) => ({
      imageIndex: item.imageIndex,
      role: "product_reference" as const,
      selectionId: item.selection.id,
      requirementKey: item.selection.requirementKey,
      requirementType: item.selection.requirementType,
      productTitle: item.selection.productTitle,
    })),
  ];

  const styleLine =
    preferences.selectedStyles.length > 0
      ? `User style direction: ${preferences.selectedStyles.join(", ")}.`
      : "No additional named style beyond the supplied product references.";
  const budgetLine = preferences.budgetLevel
    ? `Budget signal for visual density and finish quality: ${preferences.budgetLevel}.`
    : "No budget signal specified.";
  const colorLine = [
    preferences.wallMainColor ? `main wall color direction: ${preferences.wallMainColor}` : null,
    preferences.wallAccentColor ? `accent wall color direction: ${preferences.wallAccentColor}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const floorLine =
    preferences.flooring === "keep"
      ? "Keep the existing flooring appearance unless a supplied material reference is for flooring."
      : `User flooring preference: ${preferences.flooring}. Prefer a matching supplied flooring reference if one exists.`;
  const bedLine =
    preferences.bedType === "none"
      ? "No bed is requested unless a supplied product reference is a bed."
      : `Bed preference: ${preferences.bedType}, only if a supplied bed reference exists. Do not invent a bed SKU.`;
  const notesLine = preferences.notes ? `User notes: ${preferences.notes}.` : "";

  const preserve = joinNotes([
    ...input.observation.preserve,
    ...input.designRequirements.preserve,
  ]);
  const replace = joinNotes([
    ...input.observation.replaceOrRemove,
    ...input.designRequirements.replaceOrRemove,
  ]);
  const constraints = joinNotes([
    ...input.observation.constraints,
    ...input.designRequirements.constraints,
  ]);
  const unmatched = input.unmatchedRequirements
    .map((item) => item.requirementKey)
    .sort((a, b) => a.localeCompare(b));

  const referenceLines = input.references.map((item) => {
    const kind = item.selection.requirementType === "material" ? "material/surface" : "furniture";
    return [
      `Image ${item.imageIndex} is the exact selected ${kind} reference for ${requirementLabel(item)}.`,
      `Place or apply it matching its recognizable shape, color, material/upholstery and major design features in the appropriate ${requirementLabel(item)} position.`,
      `Do not substitute a different product identity for this reference.`,
    ].join(" ");
  });

  const prompt = [
    "Edit the supplied room photograph into a renovated version of THE SAME room.",
    "Image 1 is the original room and is the spatial source.",
    "Preserve the original camera viewpoint, room geometry, wall positions, windows, doors, ceiling and major fixed architecture unless an explicit renovation requirement below says otherwise.",
    "This is a renovation of the uploaded room, not generation of a random new room.",
    ...referenceLines,
    preserve ? `Preserve: ${preserve}.` : "Preserve existing architecture and any elements marked to keep.",
    replace
      ? `Replace or remove only: ${replace}.`
      : "Do not remove architecture. Replace only elements covered by supplied product references.",
    constraints ? `Constraints: ${constraints}.` : "",
    unmatched.length > 0
      ? `Unmatched requirements have no commerce product. Do not invent an unrelated new major purchasable item for: ${unmatched.join(", ")}. Preserve the existing room element where practical, or leave that requirement visually unchanged.`
      : "Do not introduce unrelated major furniture that is not in the supplied product references.",
    styleLine,
    budgetLine,
    colorLine ? `Color direction: ${colorLine}.` : "",
    floorLine,
    preferences.underfloorHeating
      ? "Underfloor heating is requested; do not show bulky radiators as a replacement heating system unless already present as fixed architecture."
      : "",
    bedLine,
    notesLine,
    "Do not alter the identities of supplied products unnecessarily.",
    "Do not generate shopping text, prices, URLs, logos as labels, or captions inside the image.",
    "Do not claim exact physical measurements.",
    "Do not invent extra major furniture beyond the supplied references.",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");

  return {
    schemaVersion: 1,
    prompt,
    imageMapping: mapping,
  };
}
