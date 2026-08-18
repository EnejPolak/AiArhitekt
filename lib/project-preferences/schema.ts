import { z } from "zod";
import {
  renderBedTypeSchema,
  renderBudgetLevelSchema,
  renderFlooringPreferenceSchema,
} from "@/lib/render/preferences";

export const ROOM_PREFERENCE_ROOM_TYPES = [
  "kitchen",
  "bathroom",
  "bedroom",
  "living-room",
  "other",
] as const;

export const roomPreferenceRoomTypeSchema = z.enum(ROOM_PREFERENCE_ROOM_TYPES);

export const selectedStylesSchema = z.array(z.string().trim().min(1).max(80)).max(8);

export const projectRoomPreferencesRowSchema = z.object({
  projectId: z.string().uuid(),
  roomType: roomPreferenceRoomTypeSchema.nullable(),
  selectedStyles: selectedStylesSchema,
  budgetLevel: renderBudgetLevelSchema.nullable(),
  wallMainColor: z.string().trim().max(80),
  wallAccentColor: z.string().trim().max(80),
  flooring: renderFlooringPreferenceSchema,
  underfloorHeating: z.boolean(),
  bedType: renderBedTypeSchema,
  notes: z.string().trim().max(400),
  keepExistingWalls: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const projectRoomPreferencesPatchSchema = z
  .object({
    roomType: roomPreferenceRoomTypeSchema.nullable(),
    selectedStyles: selectedStylesSchema,
    budgetLevel: renderBudgetLevelSchema.nullable(),
    wallMainColor: z.string().max(80),
    wallAccentColor: z.string().max(80),
    flooring: renderFlooringPreferenceSchema,
    underfloorHeating: z.boolean(),
    bedType: renderBedTypeSchema,
    notes: z.string().max(400),
    keepExistingWalls: z.boolean(),
  })
  .partial();

export const saveProjectRoomPreferencesInputSchema = z.object({
  projectId: z.string().uuid(),
  patch: projectRoomPreferencesPatchSchema,
});
