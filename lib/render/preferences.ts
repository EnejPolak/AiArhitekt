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
  notes: trimmedNote.default(""),
});

export type RoomRenderPreferences = z.infer<typeof roomRenderPreferencesSchema>;

export function parseRoomRenderPreferences(raw: unknown): RoomRenderPreferences {
  return roomRenderPreferencesSchema.parse(raw ?? {});
}

export function canonicalRenderPreferences(raw: unknown): RoomRenderPreferences {
  const parsed = parseRoomRenderPreferences(raw);
  return {
    ...parsed,
    selectedStyles: [...parsed.selectedStyles].sort((a, b) => a.localeCompare(b)),
  };
}
