import type { EmailOtpType } from "@supabase/supabase-js";
import { DEFAULT_POST_AUTH_PATH, safeInternalPath } from "@/lib/auth/redirect";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export type ParsedAuthCallback =
  | { kind: "code"; code: string; next: string }
  | { kind: "token_hash"; tokenHash: string; type: EmailOtpType; next: string }
  | { kind: "invalid"; next: string };

function isOtpType(value: string | null): value is EmailOtpType {
  return Boolean(value && OTP_TYPES.has(value as EmailOtpType));
}

export function parseAuthCallbackSearch(
  searchParams: URLSearchParams
): ParsedAuthCallback {
  const next = safeInternalPath(searchParams.get("next"));
  const code = (searchParams.get("code") ?? "").trim();
  const tokenHash = (searchParams.get("token_hash") ?? "").trim();
  const type = searchParams.get("type");

  if (code) {
    return { kind: "code", code, next };
  }

  if (tokenHash && isOtpType(type)) {
    return { kind: "token_hash", tokenHash, type, next };
  }

  return { kind: "invalid", next };
}
