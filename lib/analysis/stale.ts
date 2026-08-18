import { ROOM_ANALYSIS_SCHEMA_VERSION } from "./constants";
import type { ProjectRoomAnalysisRow } from "./queries";

export type AnalysisSourcePhoto = {
  id: string;
  storage_path: string;
};

export function isCurrentRoomAnalysis(
  analysis: ProjectRoomAnalysisRow,
  photo: AnalysisSourcePhoto | null
): boolean {
  if (!photo) return false;
  return (
    analysis.source_upload_id === photo.id &&
    analysis.source_storage_path === photo.storage_path &&
    analysis.schema_version === ROOM_ANALYSIS_SCHEMA_VERSION
  );
}

export function isStaleRoomAnalysis(
  analysis: ProjectRoomAnalysisRow,
  photo: AnalysisSourcePhoto | null
): boolean {
  if (!photo) return true;
  return (
    analysis.source_upload_id !== photo.id ||
    analysis.source_storage_path !== photo.storage_path
  );
}
