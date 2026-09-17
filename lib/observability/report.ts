import type { ErrorEvent } from "@sentry/core";

export type SafeCaptureContext = {
  projectId?: string | null;
  attemptId?: string | null;
  stage?: string | null;
  errorCode?: string | null;
  level?: "error" | "warning" | "info";
};

const BLOCKED_CONTEXT_KEY = /password|secret|token|cookie|authorization|session|api[_-]?key|html|evidence|body/i;

export function safeCaptureTags(context: SafeCaptureContext = {}): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    if (key === "level") continue;
    if (BLOCKED_CONTEXT_KEY.test(key)) continue;
    if (value == null || value === "") continue;
    tags[key] = String(value).slice(0, 120);
  }
  return tags;
}

export function sentryDsn(): string {
  return (process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim();
}

function applyPrivacyScrub(event: { request?: unknown; extra?: unknown }): void {
  if (event.request && typeof event.request === "object") {
    const request = event.request as {
      cookies?: unknown;
      headers?: Record<string, unknown>;
      data?: unknown;
    };
    delete request.cookies;
    delete request.data;
    if (request.headers) {
      for (const header of Object.keys(request.headers)) {
        if (/cookie|authorization|set-cookie|x-supabase|apikey|api-key/i.test(header)) {
          delete request.headers[header];
        }
      }
    }
  }
  if (event.extra && typeof event.extra === "object") {
    const extra = event.extra as Record<string, unknown>;
    for (const key of Object.keys(extra)) {
      if (BLOCKED_CONTEXT_KEY.test(key)) delete extra[key];
    }
  }
}

export function sentryBrowserOptions() {
  const dsn = sentryDsn();
  return {
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    sendDefaultPii: false,
    maxValueLength: 250,
    beforeSend(event: ErrorEvent) {
      applyPrivacyScrub(event);
      return event;
    },
  };
}

export async function captureSafeException(
  error: unknown,
  context: SafeCaptureContext = {}
): Promise<void> {
  const tags = safeCaptureTags(context);
  const name = error instanceof Error ? error.name : "unknown";
  console.error("[app-error]", { ...tags, name });
  if (!sentryDsn()) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.withScope((scope) => {
      scope.setTags(tags);
      scope.setLevel(context.level ?? "error");
      Sentry.captureException(error instanceof Error ? error : new Error(name));
    });
  } catch {
    // Observability must never break the request path.
  }
}
