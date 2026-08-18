import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { loadReusableRoomAnalysis } from "./analyze";
import type { ProjectRoomAnalysisRow } from "./queries";
import type { RoomAnalysisView } from "./types";

function toView(row: ProjectRoomAnalysisRow): RoomAnalysisView {
  return {
    id: row.id,
    schemaVersion: row.schema_version,
    provider: row.provider,
    model: row.model,
    sourceUploadId: row.source_upload_id,
    sourceStoragePath: row.source_storage_path,
    analysis: row.analysis,
    designRequirements: row.design_requirements,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** DB read only. Never calls OpenAI. */
export async function loadCurrentRoomAnalysis(
  projectId: string
): Promise<RoomAnalysisView | null> {
  const user = await getVerifiedUser();
  if (!user) return null;
  const supabase = await createClient();
  const row = await loadReusableRoomAnalysis(supabase, projectId);
  return row ? toView(row) : null;
}
