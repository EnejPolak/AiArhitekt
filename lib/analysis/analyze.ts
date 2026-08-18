import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { PROJECT_UPLOADS_BUCKET } from "@/lib/uploads/constants";
import { getRoomPhotoUpload } from "@/lib/uploads/queries";
import { ROOM_ANALYSIS_SCHEMA_VERSION } from "./constants";
import { claimRoomAnalysisSlot } from "./claim";
import { AnalysisError, analysisErrorMessage } from "./errors";
import { analyzeRoomImage } from "./openai";
import {
  deleteProjectRoomAnalysis,
  getProjectRoomAnalysis,
  upsertProjectRoomAnalysis,
  type ProjectRoomAnalysisRow,
} from "./queries";
import { isCurrentRoomAnalysis, isStaleRoomAnalysis } from "./stale";

type Client = SupabaseClient<Database>;

export type AnalyzeRoomOptions = {
  force?: boolean;
  analyzeImage?: typeof analyzeRoomImage;
};

async function downloadPrivateRoomPhoto(
  client: Client,
  path: string
): Promise<Buffer> {
  const { data, error } = await client.storage.from(PROJECT_UPLOADS_BUCKET).download(path);
  if (error || !data) {
    throw new AnalysisError("missing_photo", analysisErrorMessage("missing_photo"));
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function loadReusableRoomAnalysis(
  client: Client,
  projectId: string
): Promise<ProjectRoomAnalysisRow | null> {
  const photo = await getRoomPhotoUpload(client, projectId);
  const existing = await getProjectRoomAnalysis(client, projectId);
  if (!existing) return null;

  if (isStaleRoomAnalysis(existing, photo)) {
    await deleteProjectRoomAnalysis(client, projectId);
    return null;
  }

  if (!photo || !isCurrentRoomAnalysis(existing, photo)) {
    return null;
  }

  return existing;
}

export async function runRoomAnalysis(
  client: Client,
  projectId: string,
  options: AnalyzeRoomOptions = {}
): Promise<{ analysis: ProjectRoomAnalysisRow; reused: boolean }> {
  const photo = await getRoomPhotoUpload(client, projectId);
  if (!photo) {
    throw new AnalysisError("missing_photo", analysisErrorMessage("missing_photo"));
  }

  if (!options.force) {
    const existing = await getProjectRoomAnalysis(client, projectId);
    if (existing && isCurrentRoomAnalysis(existing, photo)) {
      return { analysis: existing, reused: true };
    }
  }

  await claimRoomAnalysisSlot(client, projectId);

  const bytes = await downloadPrivateRoomPhoto(client, photo.storage_path);
  const analyzeImage = options.analyzeImage ?? analyzeRoomImage;
  const { result, meta } = await analyzeImage({
    bytes,
    mime: photo.mime_type,
  });

  const saved = await upsertProjectRoomAnalysis(client, {
    projectId,
    sourceUploadId: photo.id,
    sourceStoragePath: photo.storage_path,
    provider: meta.provider,
    model: meta.model,
    analysis: result.analysis,
    designRequirements: result.designRequirements,
  });

  return { analysis: saved, reused: false };
}

export { ROOM_ANALYSIS_SCHEMA_VERSION };
