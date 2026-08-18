import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { mapUploadDbError, UploadError, uploadErrorMessage } from "./errors";
import { PROJECT_UPLOADS_BUCKET, ROOM_PHOTO_KIND } from "./constants";
import { projectIdSchema } from "@/lib/projects/schema";
import type { RoomPhotoMimeType } from "./constants";

type Client = SupabaseClient<Database>;

export type ProjectUploadRow = {
  id: string;
  project_id: string;
  kind: typeof ROOM_PHOTO_KIND;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: RoomPhotoMimeType;
  size_bytes: number;
  created_at: string;
  updated_at: string;
};

function asUpload(row: {
  id: string;
  project_id: string;
  kind: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}): ProjectUploadRow {
  if (row.kind !== ROOM_PHOTO_KIND) {
    throw new UploadError("failed", uploadErrorMessage("failed"));
  }
  const mime = row.mime_type;
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
    throw new UploadError("failed", uploadErrorMessage("failed"));
  }
  return {
    id: row.id,
    project_id: row.project_id,
    kind: ROOM_PHOTO_KIND,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    original_filename: row.original_filename,
    mime_type: mime,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getRoomPhotoUpload(
  client: Client,
  projectId: string
): Promise<ProjectUploadRow | null> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return null;

  const { data, error } = await client
    .from("project_uploads")
    .select("*")
    .eq("project_id", parsed.data)
    .eq("kind", ROOM_PHOTO_KIND)
    .maybeSingle();

  if (error) throw mapUploadDbError(error);
  if (!data) return null;
  return asUpload(data);
}

export { PROJECT_UPLOADS_BUCKET };
