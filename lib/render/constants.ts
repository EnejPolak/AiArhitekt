export const ROOM_RENDER_SCHEMA_VERSION = 1;
export const ROOM_RENDER_PROVIDER = "openai";
export const ROOM_RENDER_MODEL = "gpt-image-1.5";
export const ROOM_RENDER_GUARD_OPERATION = "room_render";
export const ROOM_RENDER_COOLDOWN_SECONDS = 120;
export const ROOM_RENDER_TIMEOUT_MS = 120_000;
/** Max selected products whose primary images are sent to the image model. */
export const MAX_RENDER_REFERENCE_IMAGES = 6;
/** Stored candidates per product; the renderer sends one primary image each. */
export const MAX_RENDER_REFERENCE_IMAGES_PER_PRODUCT = 1;
export const MAX_RENDER_OUTPUT_BYTES = 15 * 1024 * 1024;
export const RENDER_SIGNED_PREVIEW_TTL_SECONDS = 15 * 60;
export const PROJECT_ASSETS_BUCKET = "project-assets";
export const ROOM_RENDER_INPUT_FIDELITY = "high" as const;

export const ROOM_RENDER_STATUSES = ["processing", "succeeded", "failed"] as const;
export type RoomRenderStatus = (typeof ROOM_RENDER_STATUSES)[number];

export const ROOM_RENDER_OUTPUT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type RoomRenderOutputMimeType = (typeof ROOM_RENDER_OUTPUT_MIME_TYPES)[number];

export const RENDER_MIME_TO_EXT: Record<RoomRenderOutputMimeType, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const PRODUCT_FIDELITY_DISCLAIMER =
  "Visualization created from your room photo using selected product images as visual references. It is not a photograph of those exact items in your room.";
