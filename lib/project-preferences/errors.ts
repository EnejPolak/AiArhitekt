export type ProjectPreferencesErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "not_found"
  | "failed";

export type ProjectPreferencesDbOp = "load" | "mutate";

export class ProjectPreferencesError extends Error {
  readonly code: ProjectPreferencesErrorCode;

  constructor(code: ProjectPreferencesErrorCode, message: string) {
    super(message);
    this.name = "ProjectPreferencesError";
    this.code = code;
  }
}

export function projectPreferencesErrorMessage(
  code: ProjectPreferencesErrorCode,
  op: ProjectPreferencesDbOp = "mutate"
): string {
  switch (code) {
    case "invalid_input":
      return "Check your design choices and try again.";
    case "unauthenticated":
      return "Sign in to continue.";
    case "not_found":
      return "Project not found.";
    default:
      return op === "load"
        ? "Could not load your preferences. Try again."
        : "Could not save your preferences. Try again.";
  }
}

function classifyDbError(code: string, message: string): "permission" | "missing_relation" | "other" {
  const m = message.toLowerCase();
  if (code === "42501" || m.includes("permission denied")) return "permission";
  if (
    code === "PGRST205" ||
    code === "42P01" ||
    m.includes("schema cache") ||
    m.includes("does not exist")
  ) {
    return "missing_relation";
  }
  return "other";
}

export function mapProjectPreferencesDbError(
  error: { message?: string; code?: string | number } | null,
  op: ProjectPreferencesDbOp = "mutate"
): ProjectPreferencesError {
  if (!error) {
    return new ProjectPreferencesError("failed", projectPreferencesErrorMessage("failed", op));
  }
  const code = String(error.code ?? "").toUpperCase();
  if (code === "PGRST116" || code === "42501" || code === "PGRST301") {
    return new ProjectPreferencesError("not_found", projectPreferencesErrorMessage("not_found"));
  }
  console.error("[project-preferences] database_error", {
    op,
    code: code || "unknown",
    kind: classifyDbError(code, error.message ?? ""),
  });
  return new ProjectPreferencesError("failed", projectPreferencesErrorMessage("failed", op));
}
