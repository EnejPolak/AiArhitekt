import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { projectIdSchema } from "@/lib/projects/schema";
import { ROOM_ANALYSIS_SCHEMA_VERSION } from "./constants";
import { AnalysisError, analysisErrorMessage, mapAnalysisDbError } from "./errors";
import {
  parseRoomAnalysisResult,
  type DesignRequirements,
  type RoomAnalysisObservation,
} from "./schema";
import { removeProductReferenceStorageObjects } from "@/lib/references/storageCleanup";

type Client = SupabaseClient<Database>;

export type ProjectRoomAnalysisRow = {
  id: string;
  project_id: string;
  source_upload_id: string;
  source_storage_path: string;
  schema_version: number;
  provider: string;
  model: string;
  analysis: RoomAnalysisObservation;
  design_requirements: DesignRequirements;
  created_at: string;
  updated_at: string;
};

function asAnalysis(row: {
  id: string;
  project_id: string;
  source_upload_id: string;
  source_storage_path: string;
  schema_version: number;
  provider: string;
  model: string;
  analysis: Json;
  design_requirements: Json;
  created_at: string;
  updated_at: string;
}): ProjectRoomAnalysisRow | null {
  try {
    const parsed = parseRoomAnalysisResult({
      analysis: row.analysis,
      designRequirements: row.design_requirements,
    });
    return {
      id: row.id,
      project_id: row.project_id,
      source_upload_id: row.source_upload_id,
      source_storage_path: row.source_storage_path,
      schema_version: row.schema_version,
      provider: row.provider,
      model: row.model,
      analysis: parsed.analysis,
      design_requirements: parsed.designRequirements,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch {
    return null;
  }
}

export async function getProjectRoomAnalysis(
  client: Client,
  projectId: string
): Promise<ProjectRoomAnalysisRow | null> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return null;

  const { data, error } = await client
    .from("project_room_analyses")
    .select("*")
    .eq("project_id", parsed.data)
    .maybeSingle();

  if (error) throw mapAnalysisDbError(error);
  if (!data) return null;
  return asAnalysis(data);
}

export async function deleteProjectRoomAnalysis(
  client: Client,
  projectId: string
): Promise<void> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return;

  await removeProductReferenceStorageObjects(client, parsed.data);

  const { error } = await client
    .from("project_room_analyses")
    .delete()
    .eq("project_id", parsed.data);

  if (error) throw mapAnalysisDbError(error);
}

export async function upsertProjectRoomAnalysis(
  client: Client,
  row: {
    projectId: string;
    sourceUploadId: string;
    sourceStoragePath: string;
    provider: string;
    model: string;
    analysis: RoomAnalysisObservation;
    designRequirements: DesignRequirements;
  }
): Promise<ProjectRoomAnalysisRow> {
  const { data, error } = await client
    .from("project_room_analyses")
    .upsert(
      {
        project_id: row.projectId,
        source_upload_id: row.sourceUploadId,
        source_storage_path: row.sourceStoragePath,
        schema_version: ROOM_ANALYSIS_SCHEMA_VERSION,
        provider: row.provider,
        model: row.model,
        analysis: row.analysis as unknown as Json,
        design_requirements: row.designRequirements as unknown as Json,
      },
      { onConflict: "project_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new AnalysisError("failed", analysisErrorMessage("failed"));
  }
  const mapped = asAnalysis(data);
  if (!mapped) {
    throw new AnalysisError("invalid_result", analysisErrorMessage("invalid_result"));
  }
  return mapped;
}
