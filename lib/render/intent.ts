import type { OrderedRenderReference } from "./order";
import type { RoomRenderPreferences } from "./preferences";

export const RENDER_INTENTS = ["furnish_only", "complete_interior"] as const;
export type RenderIntent = (typeof RENDER_INTENTS)[number];

export function resolveRenderIntent(input: {
  keepExistingWalls: boolean;
  flooring: RoomRenderPreferences["flooring"];
  wallMainColor: string;
  wallAccentColor: string;
  hasGroundedMaterialReference: boolean;
}): RenderIntent {
  const keepFloor = input.flooring === "keep" && !input.hasGroundedMaterialReference;
  const noPaintDirection =
    input.wallMainColor.trim().length === 0 && input.wallAccentColor.trim().length === 0;
  if (input.keepExistingWalls && keepFloor && noPaintDirection) {
    return "furnish_only";
  }
  return "complete_interior";
}

export function resolveRenderIntentFromSource(input: {
  preferences: RoomRenderPreferences;
  references: OrderedRenderReference[];
}): RenderIntent {
  return resolveRenderIntent({
    keepExistingWalls: input.preferences.keepExistingWalls,
    flooring: input.preferences.flooring,
    wallMainColor: input.preferences.wallMainColor,
    wallAccentColor: input.preferences.wallAccentColor,
    hasGroundedMaterialReference: input.references.some(
      (item) => item.selection.requirementType === "material"
    ),
  });
}
