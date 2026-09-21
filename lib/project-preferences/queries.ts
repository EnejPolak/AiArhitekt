import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { projectIdSchema } from "@/lib/projects/schema";
import {
  mapProjectPreferencesDbError,
  ProjectPreferencesError,
  projectPreferencesErrorMessage,
} from "./errors";
import { projectRoomPreferencesPatchSchema, projectRoomPreferencesRowSchema } from "./schema";
import { EMPTY_PROJECT_ROOM_PREFERENCES, type ProjectRoomPreferences, type ProjectRoomPreferencesPatch } from "./types";
import type { ProjectRoomPreferenceFields } from "./adapter";
import { inferWallFinishMode } from "@/lib/render/preferences";

type Client = SupabaseClient<Database>;

type PreferenceRow = Database["public"]["Tables"]["project_room_preferences"]["Row"];

function asPreferences(row: PreferenceRow): ProjectRoomPreferences {
  const parsed = projectRoomPreferencesRowSchema.safeParse({
    projectId: row.project_id,
    roomType: row.room_type,
    selectedStyles: Array.isArray(row.selected_styles) ? row.selected_styles : [],
    budgetLevel: row.budget_level,
    wallMainColor: row.wall_main_color,
    wallAccentColor: row.wall_accent_color,
    flooring: row.flooring,
    underfloorHeating: row.underfloor_heating,
    bedType: row.bed_type,
    notes: row.notes,
    keepExistingWalls: row.keep_existing_walls,
    wallFinishMode: inferWallFinishMode({
      wallFinishMode: row.wall_finish_mode,
      keepExistingWalls: row.keep_existing_walls,
    }),
    locationInput: row.location_input?.trim() ? row.location_input.trim() : null,
    formattedAddress: row.formatted_address?.trim() ? row.formatted_address.trim() : null,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusKm: row.radius_km,
    countryCode: (() => {
      const code = row.country_code?.trim().toUpperCase() ?? "";
      return /^[A-Z]{2}$/.test(code) ? code : null;
    })(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  if (!parsed.success) {
    console.error("[project-preferences] invalid_row");
    throw new ProjectPreferencesError(
      "failed",
      projectPreferencesErrorMessage("failed", "load")
    );
  }
  return parsed.data;
}

export async function getProjectRoomPreferences(
  client: Client,
  projectId: string
): Promise<ProjectRoomPreferences | null> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return null;

  const { data, error } = await client
    .from("project_room_preferences")
    .select("*")
    .eq("project_id", parsed.data)
    .maybeSingle();

  if (error) throw mapProjectPreferencesDbError(error, "load");
  if (!data) return null;
  return asPreferences(data);
}

function toInsert(projectId: string, values: ProjectRoomPreferenceFields) {
  return {
    project_id: projectId,
    room_type: values.roomType,
    selected_styles: values.selectedStyles as Json,
    budget_level: values.budgetLevel,
    wall_main_color: values.wallMainColor.trim(),
    wall_accent_color: values.wallAccentColor.trim(),
    flooring: values.flooring,
    underfloor_heating: values.underfloorHeating,
    bed_type: values.bedType,
    notes: values.notes.trim(),
    keep_existing_walls: values.keepExistingWalls,
    location_input: values.locationInput,
    formatted_address: values.formattedAddress,
    latitude: values.latitude,
    longitude: values.longitude,
    radius_km: values.radiusKm,
    country_code: values.countryCode,
  };
}

export async function upsertProjectRoomPreferences(
  client: Client,
  projectId: string,
  patch: ProjectRoomPreferencesPatch
): Promise<ProjectRoomPreferences> {
  const id = projectIdSchema.safeParse(projectId);
  const parsedPatch = projectRoomPreferencesPatchSchema.safeParse(patch);
  if (!id.success || !parsedPatch.success) {
    throw new ProjectPreferencesError("invalid_input", projectPreferencesErrorMessage("invalid_input"));
  }

  const existing = await getProjectRoomPreferences(client, id.data);
  const next = {
    ...EMPTY_PROJECT_ROOM_PREFERENCES,
    ...(existing
      ? {
          roomType: existing.roomType,
          selectedStyles: existing.selectedStyles,
          budgetLevel: existing.budgetLevel,
          wallMainColor: existing.wallMainColor,
          wallAccentColor: existing.wallAccentColor,
          flooring: existing.flooring,
          underfloorHeating: existing.underfloorHeating,
          bedType: existing.bedType,
          notes: existing.notes,
          keepExistingWalls: existing.keepExistingWalls,
          wallFinishMode: existing.wallFinishMode,
          locationInput: existing.locationInput,
          formattedAddress: existing.formattedAddress,
          latitude: existing.latitude,
          longitude: existing.longitude,
          radiusKm: existing.radiusKm,
          countryCode: existing.countryCode,
        }
      : {}),
    ...parsedPatch.data,
  };

  const payload = toInsert(id.data, next);
  const { data, error } = await client
    .from("project_room_preferences")
    .upsert(payload, { onConflict: "project_id" })
    .select("*")
    .single();

  if (error || !data) throw mapProjectPreferencesDbError(error, "mutate");
  return asPreferences(data);
}
