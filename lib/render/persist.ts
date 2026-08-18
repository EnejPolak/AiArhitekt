import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { mapRenderDbError, RenderError, renderErrorMessage } from "./errors";
import { getProjectRoomRender } from "./queries";
import type { RoomRenderView } from "./types";
import {
  ROOM_RENDER_MODEL,
  ROOM_RENDER_PROVIDER,
  ROOM_RENDER_SCHEMA_VERSION,
  type RoomRenderOutputMimeType,
} from "./constants";

type Client = SupabaseClient<Database>;

const insertResultSchema = z.object({
  id: z.string().uuid(),
  created: z.boolean(),
});

export async function insertProcessingRoomRender(input: {
  persistClient: Client;
  ownerUserId: string;
  projectId: string;
  sourceUploadId: string;
  sourceAnalysisId: string;
  sourceAnalysisUpdatedAt: string;
  sourceDiscoveryId: string;
  sourceFingerprint: string;
  promptSnapshot: Json;
  referenceSnapshot: Json;
}): Promise<{ id: string; created: boolean; row: RoomRenderView }> {
  const { data, error } = await input.persistClient.rpc("insert_project_room_render_processing", {
    p_owner_user_id: input.ownerUserId,
    p_project_id: input.projectId,
    p_source_upload_id: input.sourceUploadId,
    p_source_analysis_id: input.sourceAnalysisId,
    p_source_analysis_updated_at: input.sourceAnalysisUpdatedAt,
    p_source_discovery_id: input.sourceDiscoveryId,
    p_source_fingerprint: input.sourceFingerprint,
    p_provider: ROOM_RENDER_PROVIDER,
    p_model: ROOM_RENDER_MODEL,
    p_schema_version: ROOM_RENDER_SCHEMA_VERSION,
    p_prompt_snapshot: input.promptSnapshot,
    p_reference_snapshot: input.referenceSnapshot,
  });

  if (error) throw mapRenderDbError(error);

  let raw: unknown = data;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new RenderError("failed", renderErrorMessage("failed"));
    }
  }
  const parsed = insertResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RenderError("failed", renderErrorMessage("failed"));
  }

  const row = await getProjectRoomRender(input.persistClient, parsed.data.id);
  if (!row) {
    throw new RenderError("failed", renderErrorMessage("failed"));
  }
  return { id: parsed.data.id, created: parsed.data.created, row };
}

export async function completeRoomRender(input: {
  persistClient: Client;
  ownerUserId: string;
  projectId: string;
  renderId: string;
  outputStoragePath: string;
  outputMimeType: RoomRenderOutputMimeType;
  outputSizeBytes: number;
  outputHash: string;
}): Promise<RoomRenderView> {
  const { data, error } = await input.persistClient.rpc("complete_project_room_render", {
    p_owner_user_id: input.ownerUserId,
    p_project_id: input.projectId,
    p_render_id: input.renderId,
    p_output_storage_path: input.outputStoragePath,
    p_output_mime_type: input.outputMimeType,
    p_output_size_bytes: input.outputSizeBytes,
    p_output_hash: input.outputHash,
  });
  if (error || data == null) throw mapRenderDbError(error);
  const row = await getProjectRoomRender(input.persistClient, input.renderId);
  if (!row) throw new RenderError("failed", renderErrorMessage("failed"));
  return row;
}

export async function failRoomRender(input: {
  persistClient: Client;
  ownerUserId: string;
  projectId: string;
  renderId: string;
  errorCode: string;
}): Promise<void> {
  const { error } = await input.persistClient.rpc("fail_project_room_render", {
    p_owner_user_id: input.ownerUserId,
    p_project_id: input.projectId,
    p_render_id: input.renderId,
    p_error_code: input.errorCode,
  });
  if (error) throw mapRenderDbError(error);
}
