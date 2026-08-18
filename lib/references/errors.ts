export type ReferenceErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "not_found"
  | "unsafe_url"
  | "invalid_image"
  | "failed";

export class ReferenceError extends Error {
  readonly code: ReferenceErrorCode;

  constructor(code: ReferenceErrorCode, message: string) {
    super(message);
    this.name = "ReferenceError";
    this.code = code;
  }
}

export function referenceErrorMessage(code: ReferenceErrorCode): string {
  switch (code) {
    case "invalid_input":
      return "Check the product image and try again.";
    case "unauthenticated":
      return "Sign in to continue.";
    case "not_found":
      return "Product selection not found.";
    case "unsafe_url":
      return "That product image could not be loaded safely.";
    case "invalid_image":
      return "That file is not a valid JPEG, PNG, or WebP image.";
    default:
      return "Could not save the product image. Try again.";
  }
}

export function mapReferenceDbError(error: { message?: string; code?: string } | null): ReferenceError {
  if (!error) return new ReferenceError("failed", referenceErrorMessage("failed"));
  const code = (error.code ?? "").toUpperCase();
  if (code === "PGRST116" || code === "42501" || code === "PGRST301") {
    return new ReferenceError("not_found", referenceErrorMessage("not_found"));
  }
  return new ReferenceError("failed", referenceErrorMessage("failed"));
}
