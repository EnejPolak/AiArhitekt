export const PROJECT_UPLOADS_BUCKET = "project-uploads";
export const ROOM_PHOTO_KIND = "room_photo";
export const MAX_ROOM_PHOTO_BYTES = 6 * 1024 * 1024;
export const SIGNED_PREVIEW_TTL_SECONDS = 15 * 60;

export const ROOM_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type RoomPhotoMimeType = (typeof ROOM_PHOTO_MIME_TYPES)[number];

export const MIME_TO_EXT: Record<RoomPhotoMimeType, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const EXT_TO_MIME = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export type RoomPhotoExt = keyof typeof EXT_TO_MIME;
