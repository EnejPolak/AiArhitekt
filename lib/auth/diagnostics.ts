const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export type AuthDiagnosticStage = "auth.sign_up" | "auth.sign_in";

export type AuthDiagnostic = {
  stage: AuthDiagnosticStage;
  code: string | null;
  status: number | null;
  message: string | null;
  errorPresent: boolean;
  userReturned?: boolean;
  sessionReturned?: boolean;
};

function shouldLogAuthDiagnostics(): boolean {
  return true;
}

export function sanitizeAuthDiagnosticMessage(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  return raw
    .replace(EMAIL_RE, "[email]")
    .replace(JWT_RE, "[token]")
    .replace(/bearer\s+\S+/gi, "bearer [token]")
    .replace(/refresh[_-]?token[=:]\s*\S+/gi, "refresh_token=[redacted]")
    .replace(/access[_-]?token[=:]\s*\S+/gi, "access_token=[redacted]")
    .slice(0, 240);
}

export function buildAuthDiagnostic(
  stage: AuthDiagnosticStage,
  error:
    | {
        message?: string;
        code?: string;
        status?: number;
        name?: string;
      }
    | null
    | undefined,
  extras?: { userReturned?: boolean; sessionReturned?: boolean }
): AuthDiagnostic {
  return {
    stage,
    code: error?.code?.trim() || error?.name?.trim() || null,
    status: typeof error?.status === "number" ? error.status : null,
    message: sanitizeAuthDiagnosticMessage(error?.message),
    errorPresent: Boolean(error?.code || error?.message || error?.name || error?.status),
    userReturned: extras?.userReturned,
    sessionReturned: extras?.sessionReturned,
  };
}

/** Development and production. Never log passwords, tokens, sessions, or keys. */
export function logAuthDiagnostic(
  stage: AuthDiagnosticStage,
  error:
    | {
        message?: string;
        code?: string;
        status?: number;
        name?: string;
      }
    | null
    | undefined,
  extras?: { userReturned?: boolean; sessionReturned?: boolean }
): AuthDiagnostic {
  const diagnostic = buildAuthDiagnostic(stage, error, extras);
  if (shouldLogAuthDiagnostics()) {
    console.info("[auth]", JSON.stringify(diagnostic));
  }
  return diagnostic;
}
