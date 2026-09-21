import { z } from "zod";

export const renderBudgetLevelSchema = z.enum([
  "budget-friendly",
  "balanced",
  "premium",
  "not-sure",
]);

export const renderFlooringPreferenceSchema = z.enum([
  "keep",
  "hardwood",
  "laminate",
  "tiles",
  "marble",
]);

export const renderBedTypeSchema = z.enum(["none", "king", "queen", "bunk", "single"]);

export const wallFinishModeSchema = z.enum(["keep_existing", "concept_color", "exact_product"]);

export type WallFinishMode = z.infer<typeof wallFinishModeSchema>;

export function keepExistingWallsFromWallFinishMode(mode: WallFinishMode): boolean {
  return mode !== "exact_product";
}

export function inferWallFinishMode(input: {
  wallFinishMode?: unknown;
  keepExistingWalls?: unknown;
}): WallFinishMode {
  const parsed = wallFinishModeSchema.safeParse(input.wallFinishMode);
  if (parsed.success) return parsed.data;
  return input.keepExistingWalls === false ? "concept_color" : "keep_existing";
}

const trimmedNote = z
  .string()
  .trim()
  .max(400);

export const roomRenderPreferencesSchema = z.object({
  selectedStyles: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  budgetLevel: renderBudgetLevelSchema.nullable().default(null),
  wallMainColor: trimmedNote.max(80).default(""),
  wallAccentColor: trimmedNote.max(80).default(""),
  flooring: renderFlooringPreferenceSchema.default("keep"),
  underfloorHeating: z.boolean().default(false),
  bedType: renderBedTypeSchema.default("none"),
  keepExistingWalls: z.boolean().default(true),
  wallFinishMode: wallFinishModeSchema.default("keep_existing"),
  notes: trimmedNote.default(""),
});

export type RoomRenderPreferences = z.infer<typeof roomRenderPreferencesSchema>;

export function parseRoomRenderPreferences(raw: unknown): RoomRenderPreferences {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const hasExplicitWallFinishMode = typeof record.wallFinishMode === "string";
  const wallFinishMode = inferWallFinishMode(record);
  const keepExistingWalls = !hasExplicitWallFinishMode
    ? record.keepExistingWalls
    : wallFinishMode === "exact_product"
      ? false
      : wallFinishMode === "keep_existing"
        ? true
        : record.keepExistingWalls;
  return roomRenderPreferencesSchema.parse({
    ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}),
    wallFinishMode,
    keepExistingWalls,
  });
}

export function canonicalRenderPreferences(raw: unknown): RoomRenderPreferences {
  const parsed = parseRoomRenderPreferences(raw);
  return {
    ...parsed,
    selectedStyles: [...parsed.selectedStyles].sort((a, b) => a.localeCompare(b)),
  };
}
