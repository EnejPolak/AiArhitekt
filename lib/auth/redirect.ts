const DEFAULT_NEXT = "/app";

/**
 * Allow only relative in-app paths. Reject protocol-relative, absolute, and
 * backslash-obfuscated URLs to prevent open redirects.
 */
export function isSafeInternalPath(value: string | null | undefined): boolean {
  if (!value) return false;
  if (value.length > 512) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  if (value.includes("://")) return false;
  if (/[\s<>'"]/.test(value)) return false;

  try {
    const parsed = new URL(value, "http://internal.invalid");
    if (parsed.origin !== "http://internal.invalid") return false;
    if (parsed.username || parsed.password) return false;
    if (!parsed.pathname.startsWith("/")) return false;
    if (parsed.pathname.startsWith("//")) return false;
    return true;
  } catch {
    return false;
  }
}

export function safeInternalPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_NEXT
): string {
  if (isSafeInternalPath(value)) return value as string;
  return isSafeInternalPath(fallback) ? fallback : DEFAULT_NEXT;
}

export const DEFAULT_POST_AUTH_PATH = DEFAULT_NEXT;
