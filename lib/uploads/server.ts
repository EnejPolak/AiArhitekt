import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { SIGNED_PREVIEW_TTL_SECONDS, PROJECT_UPLOADS_BUCKET } from "./constants";
import { getRoomPhotoUpload, type ProjectUploadRow } from "./queries";

export type RoomPhotoPreview = {
  upload: ProjectUploadRow;
  previewUrl: string | null;
};

export async function loadRoomPhotoPreview(
  projectId: string
): Promise<RoomPhotoPreview | null> {
  const user = await getVerifiedUser();
  if (!user) return null;
  const supabase = await createClient();
  const upload = await getRoomPhotoUpload(supabase, projectId);
  if (!upload) return null;

  const { data } = await supabase.storage
    .from(PROJECT_UPLOADS_BUCKET)
    .createSignedUrl(upload.storage_path, SIGNED_PREVIEW_TTL_SECONDS);

  return { upload, previewUrl: data?.signedUrl ?? null };
}
