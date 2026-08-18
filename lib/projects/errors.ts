export type ProjectErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "not_found"
  | "failed";

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;

  constructor(code: ProjectErrorCode, message: string) {
    super(message);
    this.name = "ProjectError";
    this.code = code;
  }
}

export function projectErrorMessage(code: ProjectErrorCode): string {
  switch (code) {
    case "invalid_input":
      return "Check the project details and try again.";
    case "unauthenticated":
      return "Sign in to continue.";
    case "not_found":
      return "Project not found.";
    default:
      return "Could not update the project. Try again.";
  }
}

export function mapProjectDbError(error: { message?: string; code?: string } | null): ProjectError {
  if (!error) return new ProjectError("failed", projectErrorMessage("failed"));
  const code = (error.code ?? "").toUpperCase();
  if (code === "PGRST116" || code === "42501" || code === "PGRST301") {
    return new ProjectError("not_found", projectErrorMessage("not_found"));
  }
  return new ProjectError("failed", projectErrorMessage("failed"));
}
