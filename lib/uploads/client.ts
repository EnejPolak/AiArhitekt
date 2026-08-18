"use client";

import { createClient } from "@/lib/supabase/client";
import { prepareRoomPhotoUpload, finalizeRoomPhotoUpload } from "./actions";
import { clientFileError } from "./schema";

export async function uploadRoomPhotoFile(
  projectId: string,
  file: File
): Promise<{ ok: true; previewUrl: string | null; filename: string } | { ok: false; message: string }> {
  const clientError = clientFileError(file);
  if (clientError) return { ok: false, message: clientError };

  const prepared = await prepareRoomPhotoUpload({
    projectId,
    originalFilename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  if (!prepared.ok || !prepared.path || !prepared.bucket || !prepared.uploadId) {
    return { ok: false, message: prepared.ok ? "Could not update the photo. Try again." : prepared.message };
  }

  const supabase = createClient();
  const { error } = await supabase.storage.from(prepared.bucket).upload(prepared.path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return { ok: false, message: "Could not upload the photo. Try again." };
  }

  const finalized = await finalizeRoomPhotoUpload({
    projectId,
    uploadId: prepared.uploadId,
    originalFilename: file.name,
  });
  if (!finalized.ok) {
    await supabase.storage.from(prepared.bucket).remove([prepared.path]);
    return { ok: false, message: finalized.message };
  }

  return {
    ok: true,
    previewUrl: finalized.previewUrl ?? null,
    filename: finalized.filename ?? file.name,
  };
}
