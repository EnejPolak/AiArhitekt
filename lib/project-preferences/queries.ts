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

type Client = SupabaseClient<Database>;

type PreferenceRow = Database["public"]["Tables"]["project_room_preferences"]["Row"];

function asPreferences(row: PreferenceRow): ProjectRoomPreferences {
  return projectRoomPreferencesRowSchema.parse({
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
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

  if (error) throw mapProjectPreferencesDbError(error);
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

  if (error || !data) throw mapProjectPreferencesDbError(error);
  return asPreferences(data);
}
