import {
  PROJECT_ASSETS_BUCKET,
  RENDER_MIME_TO_EXT,
  type RoomRenderOutputMimeType,
} from "./constants";

const PATH_PATTERN =
  /^projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/renders\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/;

export type ParsedRoomRenderPath = {
  projectId: string;
  renderId: string;
  ext: "jpg" | "png" | "webp";
  bucket: typeof PROJECT_ASSETS_BUCKET;
  storagePath: string;
};

export function extensionForRenderMime(mime: RoomRenderOutputMimeType): "jpg" | "png" | "webp" {
  return RENDER_MIME_TO_EXT[mime];
}

export function buildRoomRenderPath(
  projectId: string,
  renderId: string,
  mime: RoomRenderOutputMimeType
): string {
  return `projects/${projectId}/renders/${renderId}.${extensionForRenderMime(mime)}`;
}

export function parseRoomRenderPath(path: string): ParsedRoomRenderPath | null {
  if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/")) {
    return null;
  }
  const match = PATH_PATTERN.exec(path);
  if (!match) return null;
  return {
    projectId: match[1],
    renderId: match[2],
    ext: match[3] as "jpg" | "png" | "webp",
    bucket: PROJECT_ASSETS_BUCKET,
    storagePath: path,
  };
}

export function projectRenderFolderPrefix(projectId: string): string {
  return `projects/${projectId}/renders`;
}
