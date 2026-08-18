export type UploadErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "not_found"
  | "invalid_image"
  | "failed";

export class UploadError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode, message: string) {
    super(message);
    this.name = "UploadError";
    this.code = code;
  }
}

export function uploadErrorMessage(code: UploadErrorCode): string {
  switch (code) {
    case "invalid_input":
      return "Check the image and try again.";
    case "unauthenticated":
      return "Sign in to continue.";
    case "not_found":
      return "Project not found.";
    case "invalid_image":
      return "That file is not a valid JPEG, PNG, or WebP image.";
    default:
      return "Could not update the photo. Try again.";
  }
}

export function mapUploadDbError(error: { message?: string; code?: string } | null): UploadError {
  if (!error) return new UploadError("failed", uploadErrorMessage("failed"));
  const code = (error.code ?? "").toUpperCase();
  if (code === "PGRST116" || code === "42501" || code === "PGRST301") {
    return new UploadError("not_found", uploadErrorMessage("not_found"));
  }
  return new UploadError("failed", uploadErrorMessage("failed"));
}
