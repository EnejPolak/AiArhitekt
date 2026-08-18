export type AnalysisErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "not_found"
  | "missing_photo"
  | "provider_unconfigured"
  | "provider_timeout"
  | "provider_busy"
  | "provider_failed"
  | "invalid_result"
  | "failed";

export class AnalysisError extends Error {
  readonly code: AnalysisErrorCode;

  constructor(code: AnalysisErrorCode, message: string) {
    super(message);
    this.name = "AnalysisError";
    this.code = code;
  }
}

export function analysisErrorMessage(code: AnalysisErrorCode): string {
  switch (code) {
    case "invalid_input":
      return "Check the project and try again.";
    case "unauthenticated":
      return "Sign in to continue.";
    case "not_found":
      return "Project not found.";
    case "missing_photo":
      return "Upload a room photo before analyzing.";
    case "provider_unconfigured":
      return "Room analysis is not configured.";
    case "provider_timeout":
      return "Room analysis timed out. Try again.";
    case "provider_busy":
      return "Room analysis is busy. Try again in a moment.";
    case "provider_failed":
      return "Could not analyze the room. Try again.";
    case "invalid_result":
      return "The analysis result was incomplete. Try again.";
    default:
      return "Could not analyze the room. Try again.";
  }
}

export function mapAnalysisDbError(error: { message?: string; code?: string } | null): AnalysisError {
  if (!error) return new AnalysisError("failed", analysisErrorMessage("failed"));
  const code = (error.code ?? "").toUpperCase();
  if (code === "PGRST116" || code === "42501" || code === "PGRST301") {
    return new AnalysisError("not_found", analysisErrorMessage("not_found"));
  }
  return new AnalysisError("failed", analysisErrorMessage("failed"));
}

export function mapProviderFailure(error: unknown): AnalysisError {
  if (error instanceof AnalysisError) return error;

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    name.includes("Timeout") ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return new AnalysisError("provider_timeout", analysisErrorMessage("provider_timeout"));
  }
  if (status === 429) {
    return new AnalysisError("provider_busy", analysisErrorMessage("provider_busy"));
  }
  if (status !== undefined && status >= 500) {
    return new AnalysisError("provider_failed", analysisErrorMessage("provider_failed"));
  }
  return new AnalysisError("provider_failed", analysisErrorMessage("provider_failed"));
}
