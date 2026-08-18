import { detectImageMime } from "@/lib/uploads/signature";
import { MAX_RENDER_OUTPUT_BYTES, type RoomRenderOutputMimeType } from "./constants";
import { RenderError, renderErrorMessage } from "./errors";

export function validateRenderOutputBytes(bytes: Uint8Array): {
  mime: RoomRenderOutputMimeType;
  sizeBytes: number;
} {
  if (!bytes || bytes.byteLength === 0) {
    throw new RenderError("invalid_output", renderErrorMessage("invalid_output"));
  }
  if (bytes.byteLength > MAX_RENDER_OUTPUT_BYTES) {
    throw new RenderError("invalid_output", renderErrorMessage("invalid_output"));
  }
  const mime = detectImageMime(bytes);
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
    throw new RenderError("invalid_output", renderErrorMessage("invalid_output"));
  }
  return { mime, sizeBytes: bytes.byteLength };
}
