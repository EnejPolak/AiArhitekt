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
import {
  floorFinishModeFromFlooring,
  inferFloorFinishMode,
  inferLegacyFloorFinishMode,
  inferWallFinishMode,
  keepExistingWallsFromWallFinishMode,
} from "@/lib/render/preferences";

type Client = SupabaseClient<Database>;

type PreferenceRow = Database["public"]["Tables"]["project_room_preferences"]["Row"];

export type FinishModeReadContext = {
  hasReadyExactWallProduct?: boolean;
  hasReadyExactFloorProduct?: boolean;
};

export function mapProjectRoomPreferenceRow(
  row: PreferenceRow,
  context: FinishModeReadContext = {}
): ProjectRoomPreferences {
  const wallFinishModeExplicit = typeof row.wall_finish_mode === "string" && row.wall_finish_mode.length > 0;
  const floorFinishModeExplicit = typeof row.floor_finish_mode === "string" && row.floor_finish_mode.length > 0;
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
      wallMainColor: row.wall_main_color,
      wallAccentColor: row.wall_accent_color,
      hasReadyExactWallProduct: context.hasReadyExactWallProduct,
    }),
    wallFinishModeExplicit,
    floorFinishMode: (() => {
      const persisted = inferFloorFinishMode({
        floorFinishMode: row.floor_finish_mode,
        flooring: row.flooring,
      });
      if (typeof row.floor_finish_mode === "string" && row.floor_finish_mode.length > 0) {
        return persisted;
      }
      return inferLegacyFloorFinishMode({
        flooring: row.flooring,
        hasReadyExactFloorProduct: context.hasReadyExactFloorProduct,
      });
    })(),
    floorFinishModeExplicit,
    locationInput: row.location_input?.trim() ? row.location_input.trim() : null,
    formattedAddress: row.formatted_address?.trim() ? row.formatted_address.trim() : null,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusKm: row.radius_km,
    countryCode: (() => {
      const code = row.country_code?.trim().toUpperCase() ?? "";
      return /^[A-Z]{2}$/.test(code) ? code : null;
    })(),
    furnishingPlan: row.furnishing_plan,
    designBriefAnswers: row.design_brief_answers,
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

function asPreferences(row: PreferenceRow): ProjectRoomPreferences {
  return mapProjectRoomPreferenceRow(row);
}

export async function getProjectRoomPreferences(
  client: Client,
  projectId: string,
  context: FinishModeReadContext = {}
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
  return mapProjectRoomPreferenceRow(data, context);
}

function toInsert(
  projectId: string,
  values: ProjectRoomPreferenceFields,
  options: {
    writeWallFinishMode: boolean;
    writeFloorFinishMode: boolean;
    writeFurnishingPlan: boolean;
    writeDesignBriefAnswers: boolean;
  }
) {
  const payload: Database["public"]["Tables"]["project_room_preferences"]["Insert"] = {
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
  if (options.writeWallFinishMode) {
    payload.wall_finish_mode = values.wallFinishMode;
  }
  if (options.writeFloorFinishMode) {
    payload.floor_finish_mode = values.floorFinishMode;
  }
  if (options.writeFurnishingPlan) {
    payload.furnishing_plan = values.furnishingPlan as Json;
  }
  if (options.writeDesignBriefAnswers) {
    payload.design_brief_answers = values.designBriefAnswers as Json;
  }
  return payload;
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

  const { data: rawExisting, error: loadError } = await client
    .from("project_room_preferences")
    .select("*")
    .eq("project_id", id.data)
    .maybeSingle();
  if (loadError) throw mapProjectPreferencesDbError(loadError, "load");

  const existing = rawExisting ? asPreferences(rawExisting) : null;
  const patchData: ProjectRoomPreferencesPatch = { ...parsedPatch.data };
  if (patchData.flooring !== undefined && patchData.floorFinishMode === undefined) {
    patchData.floorFinishMode = floorFinishModeFromFlooring(patchData.flooring);
  }
  if (patchData.floorFinishMode === "keep_existing" && patchData.flooring === undefined) {
    patchData.flooring = "keep";
  }
  if (patchData.wallFinishMode !== undefined && patchData.keepExistingWalls === undefined) {
    patchData.keepExistingWalls = keepExistingWallsFromWallFinishMode(patchData.wallFinishMode);
  }

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
          wallFinishModeExplicit: existing.wallFinishModeExplicit,
          floorFinishMode: existing.floorFinishMode,
          floorFinishModeExplicit: existing.floorFinishModeExplicit,
          locationInput: existing.locationInput,
          formattedAddress: existing.formattedAddress,
          latitude: existing.latitude,
          longitude: existing.longitude,
          radiusKm: existing.radiusKm,
          countryCode: existing.countryCode,
          furnishingPlan: existing.furnishingPlan,
          designBriefAnswers: existing.designBriefAnswers,
        }
      : {}),
    ...patchData,
  };

  const isInsert = !rawExisting;
  const writeWallFinishMode =
    isInsert ||
    existing?.wallFinishModeExplicit === true ||
    patchData.wallFinishMode !== undefined;
  const writeFloorFinishMode =
    isInsert ||
    existing?.floorFinishModeExplicit === true ||
    patchData.floorFinishMode !== undefined ||
    patchData.flooring !== undefined;
  const writeFurnishingPlan = patchData.furnishingPlan !== undefined;
  const writeDesignBriefAnswers = patchData.designBriefAnswers !== undefined;

  const payload = toInsert(id.data, next, {
    writeWallFinishMode,
    writeFloorFinishMode,
    writeFurnishingPlan,
    writeDesignBriefAnswers,
  });
  const { data, error } = await client
    .from("project_room_preferences")
    .upsert(payload, { onConflict: "project_id" })
    .select("*")
    .single();

  if (error || !data) throw mapProjectPreferencesDbError(error, "mutate");
  return asPreferences(data);
}
