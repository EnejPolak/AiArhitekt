import type { OrderedRenderReference } from "./order";
import type { RoomRenderPreferences } from "./preferences";
import {
  finishesAllowSurfaceChange,
  resolveArchitecturalFinishes,
  type ArchitecturalFinishes,
} from "./finishes";

export const RENDER_INTENTS = ["furnish_only", "complete_interior"] as const;
export type RenderIntent = (typeof RENDER_INTENTS)[number];

export function resolveRenderIntentFromFinishes(finishes: ArchitecturalFinishes): RenderIntent {
  return finishesAllowSurfaceChange(finishes) ? "complete_interior" : "furnish_only";
}

export function resolveRenderIntentFromSource(input: {
  preferences: RoomRenderPreferences;
  references: OrderedRenderReference[];
}): RenderIntent {
  return resolveRenderIntentFromFinishes(
    resolveArchitecturalFinishes({
      preferences: input.preferences,
      references: input.references,
    })
  );
}
