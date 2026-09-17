import { existsSync, statSync } from "node:fs";

/**
 * Final Phase 3F exact-product proof must use a real empty/unfinished room photo
 * and an existing project. The 2146-byte synthetic Phase 3D PNG is rejected.
 *
 * Required env for that later run (not executed here):
 * - PHASE3F_PROJECT_ID
 * - PHASE3F_ROOM_PHOTO_PATH
 */
export function resolvePhase3FProjectId(env = process.env) {
  const projectId = String(env.PHASE3F_PROJECT_ID || "").trim();
  if (!projectId) {
    throw new Error("PHASE3F_PROJECT_ID is required for the real-room exact-product proof.");
  }
  return projectId;
}

export function resolvePhase3FRoomPhotoPath(env = process.env) {
  const photoPath = String(env.PHASE3F_ROOM_PHOTO_PATH || "").trim();
  if (!photoPath) {
    throw new Error("PHASE3F_ROOM_PHOTO_PATH is required for the real-room exact-product proof.");
  }
  if (!existsSync(photoPath)) {
    throw new Error("PHASE3F_ROOM_PHOTO_PATH does not exist.");
  }
  const size = statSync(photoPath).size;
  if (size <= 2146) {
    throw new Error("Synthetic Phase 3D PNG is not accepted as the real-room proof photo.");
  }
  return photoPath;
}
