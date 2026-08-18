import {
  EXT_TO_MIME,
  MIME_TO_EXT,
  PROJECT_UPLOADS_BUCKET,
  type RoomPhotoExt,
  type RoomPhotoMimeType,
} from "./constants";

const PATH_PATTERN =
  /^projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/;

export type ParsedUploadPath = {
  projectId: string;
  uploadId: string;
  ext: RoomPhotoExt;
  bucket: typeof PROJECT_UPLOADS_BUCKET;
  storagePath: string;
};

export function extensionForMime(mime: RoomPhotoMimeType): RoomPhotoExt {
  return MIME_TO_EXT[mime];
}

export function mimeForExtension(ext: string): RoomPhotoMimeType | null {
  if (ext === "jpg" || ext === "png" || ext === "webp") return EXT_TO_MIME[ext];
  return null;
}

export function buildRoomPhotoPath(projectId: string, uploadId: string, mime: RoomPhotoMimeType): string {
  return `projects/${projectId}/uploads/${uploadId}.${extensionForMime(mime)}`;
}

export function parseRoomPhotoPath(path: string): ParsedUploadPath | null {
  if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/")) {
    return null;
  }
  const match = PATH_PATTERN.exec(path);
  if (!match) return null;
  const projectId = match[1];
  const uploadId = match[2];
  const ext = match[3] as RoomPhotoExt;
  return {
    projectId,
    uploadId,
    ext,
    bucket: PROJECT_UPLOADS_BUCKET,
    storagePath: path,
  };
}

export function isCanonicalRoomPhotoPath(
  path: string,
  expected: { projectId: string; uploadId: string }
): boolean {
  const parsed = parseRoomPhotoPath(path);
  if (!parsed) return false;
  return parsed.projectId === expected.projectId && parsed.uploadId === expected.uploadId;
}

export function candidateRoomPhotoPaths(projectId: string, uploadId: string): string[] {
  return (["jpg", "png", "webp"] as const).map(
    (ext) => `projects/${projectId}/uploads/${uploadId}.${ext}`
  );
}

export function sanitizeOriginalFilename(name: string, fallbackExt: RoomPhotoExt): string {
  const base = name.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  const stripped = base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 255);
  if (stripped.length >= 1) return stripped;
  return `room-photo.${fallbackExt}`;
}
