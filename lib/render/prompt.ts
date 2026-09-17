import type { DesignRequirements, RoomAnalysisObservation } from "@/lib/analysis/schema";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import type { ProductSelectionView } from "@/lib/discovery/types";
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
  ungroundedSelections?: ProductSelectionView[];
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

function letterForIndex(imageIndex: number): string {
  const code = 64 + imageIndex;
  if (code < 65 || code > 90) return String(imageIndex);
  return String.fromCharCode(code);
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
      ? `User style direction: ${preferences.selectedStyles.join(", ")}. Use style only for arrangement, styling, and non-product decorative composition. Do not replace referenced products to match the style.`
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
  const ungrounded = (input.ungroundedSelections ?? [])
    .map((item) => item.requirementKey)
    .sort((a, b) => a.localeCompare(b));

  const referenceLines = input.references.map((item) => {
    const kind = item.selection.requirementType === "material" ? "material/surface" : "furniture";
    const letter = letterForIndex(item.imageIndex);
    return [
      `IMAGE ${letter} (Image ${item.imageIndex}) is the exact selected ${kind} reference: ${item.selection.productTitle} (${requirementLabel(item)}).`,
      "Preserve as closely as possible its shape, silhouette, color, material appearance, proportions, and distinctive design features.",
      "You may change only viewpoint relative to the camera, perspective, apparent scale appropriate for the room, orientation, lighting/shadows, and partial occlusion.",
      "Do not replace this referenced item with a stylistically similar but materially different invented product.",
    ].join(" ");
  });

  const prompt = [
    "This is exact-product reference-grounded rendering of the customer's original room, not generic furniture invention.",
    "IMAGE A (Image 1) is the customer's real empty or unfinished room and is the spatial source.",
    "Preserve this room's architecture, perspective and camera position: walls, windows, doors, floor, ceiling, room proportions, and major structural geometry.",
    "Do not invent architectural changes unless an explicit renovation requirement below says otherwise.",
    "Furnish IMAGE A using the specific referenced products below.",
    ...referenceLines,
    preserve ? `Preserve: ${preserve}.` : "Preserve existing architecture and any elements marked to keep.",
    replace
      ? `Replace or remove only: ${replace}.`
      : "Do not remove architecture. Replace only elements covered by supplied product references.",
    constraints ? `Constraints: ${constraints}.` : "",
    unmatched.length > 0
      ? `These requirements were NOT_FOUND. Do not claim a real exact product was rendered for: ${unmatched.join(", ")}. Leave that area visually unresolved or use only concept-only minor decor.`
      : "Do not introduce unrelated major furniture that is not in the supplied product references.",
    ungrounded.length > 0
      ? `These selected products have no usable reference image. Keep them off the exact-product claim. Do not invent a photographic stand-in presented as that product: ${ungrounded.join(", ")}.`
      : "",
    styleLine,
    budgetLine,
    colorLine ? `Color direction: ${colorLine}.` : "",
    floorLine,
    preferences.underfloorHeating
      ? "Underfloor heating is requested; do not show bulky radiators as a replacement heating system unless already present as fixed architecture."
      : "",
    bedLine,
    notesLine,
    "Minor concept-only decor such as a plant, small books, a cushion, or minor wall decoration is allowed only for visual coherence.",
    "Do not present invented or generated decor as a purchasable selected merchant product. Major furniture must use the referenced real products.",
    "Do not generate shopping text, prices, URLs, logos as labels, or captions inside the image.",
    "Do not claim pixel-identical photographic identity or exact physical measurements.",
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
