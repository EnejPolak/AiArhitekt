import type { z } from "zod";
import type {
  projectRoomPreferencesPatchSchema,
  projectRoomPreferencesRowSchema,
  roomPreferenceRoomTypeSchema,
} from "./schema";

export type RoomPreferenceRoomType = z.infer<typeof roomPreferenceRoomTypeSchema>;

export type ProjectRoomPreferences = z.infer<typeof projectRoomPreferencesRowSchema>;

export type ProjectRoomPreferencesPatch = z.infer<typeof projectRoomPreferencesPatchSchema>;

export const EMPTY_PROJECT_ROOM_PREFERENCES = {
  roomType: null,
  selectedStyles: [],
  budgetLevel: null,
  wallMainColor: "",
  wallAccentColor: "",
  flooring: "keep",
  underfloorHeating: false,
  bedType: "none",
  notes: "",
  keepExistingWalls: false,
} as const satisfies Omit<ProjectRoomPreferences, "projectId" | "createdAt" | "updatedAt">;
