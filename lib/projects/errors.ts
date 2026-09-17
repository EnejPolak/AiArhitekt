export type ProjectErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "not_found"
  | "failed";

export type ProjectDbOp = "load" | "mutate";

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;

  constructor(code: ProjectErrorCode, message: string) {
    super(message);
    this.name = "ProjectError";
    this.code = code;
  }
}

export function projectErrorMessage(
  code: ProjectErrorCode,
  op: ProjectDbOp = "mutate"
): string {
  switch (code) {
    case "invalid_input":
      return "Check the project details and try again.";
    case "unauthenticated":
      return "Sign in to continue.";
    case "not_found":
      return "Project not found.";
    default:
      return op === "load"
        ? "Could not load your projects. Try again."
        : "Could not update the project. Try again.";
  }
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function sanitizeProjectDbDiagnostic(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  return raw.replace(EMAIL_RE, "[email]").replace(JWT_RE, "[token]").slice(0, 240);
}

export function mapProjectDbError(
  error: { message?: string; code?: string; details?: string; hint?: string } | null,
  op: ProjectDbOp = "mutate"
): ProjectError {
  if (!error) return new ProjectError("failed", projectErrorMessage("failed", op));
  const code = (error.code ?? "").toUpperCase();
  if (code === "PGRST116" || code === "42501" || code === "PGRST301") {
    return new ProjectError("not_found", projectErrorMessage("not_found"));
  }
  if (process.env.NODE_ENV !== "production") {
    console.error(
      "[projects] database_error",
      JSON.stringify({
        op,
        code: code || "unknown",
        message: sanitizeProjectDbDiagnostic(error.message),
        details: sanitizeProjectDbDiagnostic(error.details),
        hint: sanitizeProjectDbDiagnostic(error.hint),
      })
    );
  }
  return new ProjectError("failed", projectErrorMessage("failed", op));
}
