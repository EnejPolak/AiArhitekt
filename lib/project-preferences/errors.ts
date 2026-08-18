export type ProjectPreferencesErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "not_found"
  | "failed";

export class ProjectPreferencesError extends Error {
  readonly code: ProjectPreferencesErrorCode;

  constructor(code: ProjectPreferencesErrorCode, message: string) {
    super(message);
    this.name = "ProjectPreferencesError";
    this.code = code;
  }
}

export function projectPreferencesErrorMessage(code: ProjectPreferencesErrorCode): string {
  switch (code) {
    case "invalid_input":
      return "Check your design choices and try again.";
    case "unauthenticated":
      return "Sign in to continue.";
    case "not_found":
      return "Project not found.";
    default:
      return "Could not save your preferences. Try again.";
  }
}

export function mapProjectPreferencesDbError(
  error: { message?: string; code?: string } | null
): ProjectPreferencesError {
  if (!error) {
    return new ProjectPreferencesError("failed", projectPreferencesErrorMessage("failed"));
  }
  const code = (error.code ?? "").toUpperCase();
  if (code === "PGRST116" || code === "42501" || code === "PGRST301") {
    return new ProjectPreferencesError("not_found", projectPreferencesErrorMessage("not_found"));
  }
  return new ProjectPreferencesError("failed", projectPreferencesErrorMessage("failed"));
}
