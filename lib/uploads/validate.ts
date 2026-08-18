import {
  MAX_ROOM_PHOTO_BYTES,
  type RoomPhotoMimeType,
} from "./constants";
import { parseRoomPhotoPath } from "./path";
import { detectImageMime } from "./signature";

export function validateRoomPhotoBytes(
  bytes: Uint8Array,
  storagePath: string
): RoomPhotoMimeType {
  if (bytes.length <= 0) {
    throw new Error("empty");
  }
  if (bytes.length > MAX_ROOM_PHOTO_BYTES) {
    throw new Error("oversize");
  }
  const mime = detectImageMime(bytes);
  if (!mime) {
    throw new Error("invalid");
  }
  const parsed = parseRoomPhotoPath(storagePath);
  if (!parsed) {
    throw new Error("path");
  }
  const ext =
    mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  if (parsed.ext !== ext) {
    throw new Error("mismatch");
  }
  return mime;
}
