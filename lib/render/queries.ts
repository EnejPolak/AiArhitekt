import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { projectIdSchema } from "@/lib/projects/schema";
import { mapRenderDbError } from "./errors";
import { ROOM_RENDER_STATUSES, type RoomRenderStatus } from "./constants";
import type { RoomRenderView } from "./types";

type Client = SupabaseClient<Database>;

function asStatus(value: string): RoomRenderStatus | null {
  return (ROOM_RENDER_STATUSES as readonly string[]).includes(value)
    ? (value as RoomRenderStatus)
    : null;
}

function asRender(
  row: Database["public"]["Tables"]["project_room_renders"]["Row"]
): RoomRenderView | null {
  const status = asStatus(row.status);
  if (!status) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    sourceUploadId: row.source_upload_id,
    sourceAnalysisId: row.source_analysis_id,
    sourceAnalysisUpdatedAt: row.source_analysis_updated_at,
    sourceDiscoveryId: row.source_discovery_id,
    sourceFingerprint: row.source_fingerprint,
    provider: row.provider,
    model: row.model,
    schemaVersion: row.schema_version,
    status,
    promptSnapshot: row.prompt_snapshot,
    referenceSnapshot: row.reference_snapshot,
    outputStorageBucket: row.output_storage_bucket,
    outputStoragePath: row.output_storage_path,
    outputMimeType: row.output_mime_type,
    outputSizeBytes: row.output_size_bytes,
    outputHash: row.output_hash,
    errorCode: row.error_code,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    previewUrl: null,
    isCurrent: false,
  };
}

export async function listProjectRoomRenders(
  client: Client,
  projectId: string
): Promise<RoomRenderView[]> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return [];
  const { data, error } = await client
    .from("project_room_renders")
    .select("*")
    .eq("project_id", parsed.data)
    .order("created_at", { ascending: false });
  if (error) throw mapRenderDbError(error);
  return (data ?? [])
    .map(asRender)
    .filter((row): row is RoomRenderView => row !== null);
}

export async function getProjectRoomRender(
  client: Client,
  renderId: string
): Promise<RoomRenderView | null> {
  const { data, error } = await client
    .from("project_room_renders")
    .select("*")
    .eq("id", renderId)
    .maybeSingle();
  if (error) throw mapRenderDbError(error);
  if (!data) return null;
  return asRender(data);
}

export async function getProcessingRenderByFingerprint(
  client: Client,
  projectId: string,
  fingerprint: string
): Promise<RoomRenderView | null> {
  const { data, error } = await client
    .from("project_room_renders")
    .select("*")
    .eq("project_id", projectId)
    .eq("source_fingerprint", fingerprint)
    .eq("status", "processing")
    .maybeSingle();
  if (error) throw mapRenderDbError(error);
  if (!data) return null;
  return asRender(data);
}

export async function getLatestSucceededRenderByFingerprint(
  client: Client,
  projectId: string,
  fingerprint: string
): Promise<RoomRenderView | null> {
  const { data, error } = await client
    .from("project_room_renders")
    .select("*")
    .eq("project_id", projectId)
    .eq("source_fingerprint", fingerprint)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapRenderDbError(error);
  if (!data) return null;
  return asRender(data);
}

export async function getLatestSucceededRender(
  client: Client,
  projectId: string
): Promise<RoomRenderView | null> {
  const { data, error } = await client
    .from("project_room_renders")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapRenderDbError(error);
  if (!data) return null;
  return asRender(data);
}

export function markCurrent(renders: RoomRenderView[], fingerprint: string): RoomRenderView[] {
  return renders.map((row) => ({
    ...row,
    isCurrent: row.status === "succeeded" && row.sourceFingerprint === fingerprint,
  }));
}

export function promptSnapshotAsJson(value: unknown): Json {
  return value as Json;
}
