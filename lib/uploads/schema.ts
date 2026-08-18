import { z } from "zod";
import { MAX_ROOM_PHOTO_BYTES, ROOM_PHOTO_MIME_TYPES } from "./constants";
import { projectIdSchema } from "@/lib/projects/schema";

export const roomPhotoMimeSchema = z.enum(ROOM_PHOTO_MIME_TYPES);

export const originalFilenameSchema = z
  .string()
  .trim()
  .min(1, "Choose an image file.")
  .max(255, "Filename is too long.");

export const prepareRoomPhotoSchema = z.object({
  projectId: projectIdSchema,
  originalFilename: originalFilenameSchema,
  mimeType: roomPhotoMimeSchema,
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_ROOM_PHOTO_BYTES, "Image must be 6 MB or smaller."),
});

export const finalizeRoomPhotoSchema = z.object({
  projectId: projectIdSchema,
  uploadId: z.string().uuid("Invalid upload."),
  originalFilename: originalFilenameSchema,
});

export const projectUploadIdInputSchema = z.object({
  projectId: projectIdSchema,
});

export function clientFileError(file: File | null | undefined): string | null {
  if (!file) return "Choose an image file.";
  if (file.size <= 0) return "The file is empty.";
  if (file.size > MAX_ROOM_PHOTO_BYTES) return "Image must be 6 MB or smaller.";
  if (!ROOM_PHOTO_MIME_TYPES.includes(file.type as (typeof ROOM_PHOTO_MIME_TYPES)[number])) {
    return "Use a JPEG, PNG, or WebP image.";
  }
  return null;
}
