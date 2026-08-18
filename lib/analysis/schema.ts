import { z } from "zod";
import { ROOM_ANALYSIS_SCHEMA_VERSION } from "./constants";

const note = z
  .string()
  .trim()
  .min(1)
  .max(400);

const noteList = z.array(note).max(16);

export const observedRoomTypeSchema = z.enum([
  "kitchen",
  "bathroom",
  "bedroom",
  "living-room",
  "other",
  "unknown",
]);

export const architectureSchema = z.object({
  walls: noteList.max(12),
  floor: z.string().trim().max(400).nullable(),
  windows: noteList.max(12),
  doors: noteList.max(8),
  fixedElements: noteList.max(16),
});

export const existingElementSchema = z.object({
  description: note,
  disposition: z.enum(["unknown", "likely_keep", "likely_replace", "likely_remove"]),
});

export const visualConditionSchema = z.object({
  lighting: z.string().trim().max(400).nullable(),
  colors: noteList.max(12),
  overall: z.string().trim().max(400).nullable(),
});

/** Image-only analysis never stores invented exact dimensions. */
export const measurementStatusSchema = z
  .object({
    exactDimensionsKnown: z
      .boolean()
      .optional()
      .transform(() => false as const),
    qualitativeNotes: noteList.max(12).default([]),
  })
  .transform((value) => ({
    exactDimensionsKnown: false as const,
    qualitativeNotes: value.qualitativeNotes,
  }));

export const roomAnalysisObservationSchema = z.object({
  roomType: observedRoomTypeSchema,
  architecture: architectureSchema,
  existingElements: z.array(existingElementSchema).max(24),
  visualCondition: visualConditionSchema,
  constraints: noteList,
  preserve: noteList,
  replaceOrRemove: noteList,
  measurementStatus: measurementStatusSchema.default({
    exactDimensionsKnown: false,
    qualitativeNotes: [],
  }),
  uncertainties: noteList,
});

export const furnitureNeedSchema = z.object({
  category: note,
  quantity: z.number().int().positive().max(20).nullable(),
  placementNotes: z.string().trim().max(400).nullable(),
  constraints: noteList.max(8),
});

export const materialNeedSchema = z.object({
  surface: note,
  category: note,
  finishDirection: z.string().trim().max(200).nullable(),
  constraints: noteList.max(8),
});

export const designRequirementsSchema = z.object({
  furnitureNeeds: z.array(furnitureNeedSchema).max(20),
  materialNeeds: z.array(materialNeedSchema).max(20),
  constraints: noteList,
  preserve: noteList,
  replaceOrRemove: noteList,
});

export const roomAnalysisProviderResultSchema = z.object({
  analysis: roomAnalysisObservationSchema,
  designRequirements: designRequirementsSchema,
});

export type ObservedRoomType = z.infer<typeof observedRoomTypeSchema>;
export type RoomAnalysisObservation = z.infer<typeof roomAnalysisObservationSchema>;
export type DesignRequirements = z.infer<typeof designRequirementsSchema>;
export type RoomAnalysisProviderResult = z.infer<typeof roomAnalysisProviderResultSchema>;

const COMMERCE_KEYS = [
  "productUrl",
  "store",
  "price",
  "SKU",
  "sku",
  "affiliateUrl",
  "buyUrl",
] as const;

export function parseRoomAnalysisResult(raw: unknown): RoomAnalysisProviderResult {
  const parsed = roomAnalysisProviderResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data;
}

export function assertNoTrustedCommerceFields(value: unknown): void {
  const json = JSON.stringify(value);
  for (const key of COMMERCE_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Unexpected commerce field ${key}`);
    }
  }
}

export const ROOM_ANALYSIS_JSON_CONTRACT = {
  schemaVersion: ROOM_ANALYSIS_SCHEMA_VERSION,
} as const;
