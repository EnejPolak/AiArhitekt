import { z } from "zod";
import {
  renderBedTypeSchema,
  renderBudgetLevelSchema,
  renderFlooringPreferenceSchema,
  wallFinishModeSchema,
  floorFinishModeSchema,
} from "@/lib/render/preferences";
import { parseFurnishingPlanOverrides } from "@/lib/discovery/furnishingPlan";

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
  wallFinishMode: wallFinishModeSchema,
  wallFinishModeExplicit: z.boolean(),
  floorFinishMode: floorFinishModeSchema,
  floorFinishModeExplicit: z.boolean(),
  locationInput: z.string().trim().min(3).max(500).nullable(),
  formattedAddress: z.string().trim().max(500).nullable(),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  radiusKm: z.number().int().min(1).max(50).nullable(),
  countryCode: z.string().trim().length(2).nullable(),
  furnishingPlan: z.unknown().transform((value) => parseFurnishingPlanOverrides(value)),
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
    wallFinishMode: wallFinishModeSchema,
    floorFinishMode: floorFinishModeSchema,
    locationInput: z.string().trim().min(3).max(500).nullable(),
    formattedAddress: z.string().trim().max(500).nullable(),
    latitude: z.number().finite().min(-90).max(90).nullable(),
    longitude: z.number().finite().min(-180).max(180).nullable(),
    radiusKm: z.number().int().min(1).max(50).nullable(),
    countryCode: z.string().trim().length(2).nullable(),
    furnishingPlan: z.unknown().transform((value) => parseFurnishingPlanOverrides(value)),
  })
  .partial();

export const saveProjectRoomPreferencesInputSchema = z.object({
  projectId: z.string().uuid(),
  patch: projectRoomPreferencesPatchSchema,
});

export const saveProjectLocationInputSchema = z.object({
  projectId: z.string().uuid(),
  locationInput: z.string().trim().min(3).max(500),
  formattedAddress: z.string().trim().max(500).nullable().optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  radiusKm: z.number().int().min(1).max(50),
  countryCode: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
});
