"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { getProjectById } from "@/lib/projects/queries";
import { MVP_PROJECT_TYPE } from "@/lib/projects/types";
import { stepIndexFromKey } from "@/lib/projects/steps";
import {
  PROJECT_UPLOADS_BUCKET,
  ROOM_PHOTO_KIND,
  SIGNED_PREVIEW_TTL_SECONDS,
} from "./constants";
import { UploadError, uploadErrorMessage } from "./errors";
import {
  finalizeRoomPhotoSchema,
  prepareRoomPhotoSchema,
  projectUploadIdInputSchema,
} from "./schema";
import {
  buildRoomPhotoPath,
  candidateRoomPhotoPaths,
  isCanonicalRoomPhotoPath,
  sanitizeOriginalFilename,
} from "./path";
import { validateRoomPhotoBytes } from "./validate";
import { deleteProjectRoomAnalysis } from "@/lib/analysis/queries";
import { getRoomPhotoUpload, type ProjectUploadRow } from "./queries";
import { removeProjectAssetObjects } from "@/lib/references/storageCleanup";

export type UploadActionResult =
  | {
      ok: true;
      uploadId?: string;
      bucket?: string;
      path?: string;
      filename?: string;
      previewUrl?: string | null;
    }
  | { ok: false; code: string; message: string };

function fail(
  code: "invalid_input" | "unauthenticated" | "not_found" | "invalid_image" | "failed",
  message?: string
): UploadActionResult {
  return { ok: false, code, message: message ?? uploadErrorMessage(code) };
}

function fromCaught(error: unknown): UploadActionResult {
  if (error instanceof UploadError) {
    return fail(error.code, error.message);
  }
  return fail("failed");
}

async function requireUser() {
  const user = await getVerifiedUser();
  if (!user) throw new UploadError("unauthenticated", uploadErrorMessage("unauthenticated"));
  return user;
}

async function requireOwnedProject(projectId: string) {
  await requireUser();
  const supabase = await createClient();
  const project = await getProjectById(supabase, projectId);
  if (!project) throw new UploadError("not_found", uploadErrorMessage("not_found"));
  return { supabase, project };
}

async function requireOwnedRoomProject(projectId: string) {
  const result = await requireOwnedProject(projectId);
  if (result.project.project_type !== MVP_PROJECT_TYPE) {
    throw new UploadError("invalid_input", "This project cannot accept a room photo.");
  }
  return result;
}

function logCleanupFailure(context: string, details: Record<string, string>) {
  console.error(`[uploads] ${context}`, details);
}

export async function prepareRoomPhotoUpload(input: {
  projectId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<UploadActionResult> {
  const parsed = prepareRoomPhotoSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid_input", parsed.error.issues[0]?.message);
  }

  try {
    await requireOwnedRoomProject(parsed.data.projectId);
    const uploadId = randomUUID();
    const path = buildRoomPhotoPath(
      parsed.data.projectId,
      uploadId,
      parsed.data.mimeType
    );
    return {
      ok: true,
      uploadId,
      bucket: PROJECT_UPLOADS_BUCKET,
      path,
    };
  } catch (error) {
    return fromCaught(error);
  }
}

async function findUploadedObject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  uploadId: string
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(PROJECT_UPLOADS_BUCKET)
    .list(`projects/${projectId}/uploads`, { search: uploadId, limit: 20 });
  const listed = (data ?? [])
    .map((item) => `projects/${projectId}/uploads/${item.name}`)
    .find((path) => isCanonicalRoomPhotoPath(path, { projectId, uploadId }));
  if (listed) return listed;

  for (const path of candidateRoomPhotoPaths(projectId, uploadId)) {
    const { data: blob, error } = await supabase.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .download(path);
    if (!error && blob) return path;
  }
  return null;
}

async function downloadValidatedImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string
): Promise<{ bytes: Buffer; mime: "image/jpeg" | "image/png" | "image/webp" }> {
  const { data, error } = await supabase.storage
    .from(PROJECT_UPLOADS_BUCKET)
    .download(path);
  if (error || !data) {
    throw new UploadError("not_found", uploadErrorMessage("not_found"));
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  try {
    const mime = validateRoomPhotoBytes(bytes, path);
    return { bytes, mime };
  } catch {
    await supabase.storage.from(PROJECT_UPLOADS_BUCKET).remove([path]);
    throw new UploadError("invalid_image", uploadErrorMessage("invalid_image"));
  }
}

async function persistRoomPhotoRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: {
    projectId: string;
    path: string;
    filename: string;
    mime: "image/jpeg" | "image/png" | "image/webp";
    sizeBytes: number;
    currentStepKey: string;
  }
): Promise<ProjectUploadRow> {
  const existing = await getRoomPhotoUpload(supabase, row.projectId);
  const payload = {
    project_id: row.projectId,
    kind: ROOM_PHOTO_KIND,
    storage_bucket: PROJECT_UPLOADS_BUCKET,
    storage_path: row.path,
    original_filename: row.filename,
    mime_type: row.mime,
    size_bytes: row.sizeBytes,
  };

  const { data, error } = await supabase
    .from("project_uploads")
    .upsert(payload, { onConflict: "project_id,kind" })
    .select("*")
    .single();

  if (error || !data) {
    throw new UploadError("failed", uploadErrorMessage("failed"));
  }

  if (existing && existing.storage_path !== row.path) {
    await deleteProjectRoomAnalysis(supabase, row.projectId);
    const analysisIndex = stepIndexFromKey(MVP_PROJECT_TYPE, "ai-observation");
    const currentIndex = stepIndexFromKey(MVP_PROJECT_TYPE, row.currentStepKey);
    if (currentIndex >= analysisIndex) {
      await supabase
        .from("projects")
        .update({ current_step_key: "ai-observation" })
        .eq("id", row.projectId);
    }
    const cleanup = await supabase.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .remove([existing.storage_path]);
    if (cleanup.error) {
      logCleanupFailure("replacement leftover object", {
        projectId: row.projectId,
        path: existing.storage_path,
      });
    }
  }

  return {
    id: data.id,
    project_id: data.project_id,
    kind: ROOM_PHOTO_KIND,
    storage_bucket: data.storage_bucket,
    storage_path: data.storage_path,
    original_filename: data.original_filename,
    mime_type: data.mime_type as "image/jpeg" | "image/png" | "image/webp",
    size_bytes: data.size_bytes,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function finalizeRoomPhotoUpload(input: {
  projectId: string;
  uploadId: string;
  originalFilename: string;
}): Promise<UploadActionResult> {
  const parsed = finalizeRoomPhotoSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid_input", parsed.error.issues[0]?.message);
  }

  try {
    const { supabase, project } = await requireOwnedRoomProject(parsed.data.projectId);
    const path = await findUploadedObject(
      supabase,
      project.id,
      parsed.data.uploadId
    );
    if (!path || !isCanonicalRoomPhotoPath(path, { projectId: project.id, uploadId: parsed.data.uploadId })) {
      return fail("not_found");
    }

    const { bytes, mime } = await downloadValidatedImage(supabase, path);
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
    const filename = sanitizeOriginalFilename(parsed.data.originalFilename, ext);
    const saved = await persistRoomPhotoRow(supabase, {
      projectId: project.id,
      path,
      filename,
      mime,
      sizeBytes: bytes.length,
      currentStepKey: project.current_step_key,
    });

    const preview = await supabase.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .createSignedUrl(saved.storage_path, SIGNED_PREVIEW_TTL_SECONDS);

    return {
      ok: true,
      uploadId: saved.id,
      filename: saved.original_filename,
      previewUrl: preview.data?.signedUrl ?? null,
    };
  } catch (error) {
    return fromCaught(error);
  }
}

export async function removeRoomPhoto(input: {
  projectId: string;
}): Promise<UploadActionResult> {
  const parsed = projectUploadIdInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  try {
    const { supabase, project } = await requireOwnedRoomProject(parsed.data.projectId);
    const existing = await getRoomPhotoUpload(supabase, project.id);
    if (!existing) return { ok: true };

    await deleteProjectRoomAnalysis(supabase, project.id);

    const { error: storageError } = await supabase.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .remove([existing.storage_path]);
    if (storageError) {
      logCleanupFailure("remove photo storage failed", {
        projectId: project.id,
        path: existing.storage_path,
      });
      return fail("failed");
    }

    const { error } = await supabase
      .from("project_uploads")
      .delete()
      .eq("id", existing.id)
      .eq("project_id", project.id);
    if (error) return fail("failed");

    const photoIndex = stepIndexFromKey(MVP_PROJECT_TYPE, "photo-upload");
    const currentIndex = stepIndexFromKey(MVP_PROJECT_TYPE, project.current_step_key);
    if (currentIndex > photoIndex) {
      await supabase
        .from("projects")
        .update({ current_step_key: "photo-upload" })
        .eq("id", project.id);
    }

    return { ok: true };
  } catch (error) {
    return fromCaught(error);
  }
}

export async function removeProjectStorageObjects(projectId: string): Promise<void> {
  const { supabase, project } = await requireOwnedProject(projectId);
  const existing = await getRoomPhotoUpload(supabase, project.id);
  const paths = new Set<string>();
  if (existing) paths.add(existing.storage_path);

  const listed = await supabase.storage
    .from(PROJECT_UPLOADS_BUCKET)
    .list(`projects/${project.id}/uploads`);
  if (listed.data) {
    for (const item of listed.data) {
      if (item.name) {
        paths.add(`projects/${project.id}/uploads/${item.name}`);
      }
    }
  }

  if (paths.size > 0) {
    const { error } = await supabase.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .remove([...paths]);
    if (error) {
      logCleanupFailure("project hard-delete storage failed", {
        projectId: project.id,
      });
      throw new UploadError("failed", uploadErrorMessage("failed"));
    }
  }

  await removeProjectAssetObjects(supabase, project.id);
}
