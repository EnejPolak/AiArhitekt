export type SignUpProviderData = {
  session?: unknown | null;
  user?: {
    identities?: unknown[] | null;
  } | null;
};

/**
 * Interpret a successful GoTrue signUp payload.
 *
 * Immediate session  → app may enter /app.
 * No session         → email confirmation (or existing-email obfuscation).
 * Never treat missing session as an exception.
 */
export function interpretSignUpData(data: SignUpProviderData | null | undefined): {
  ok: true;
  needsEmailConfirmation?: boolean;
} {
  if (data?.session) {
    return { ok: true };
  }
  return { ok: true, needsEmailConfirmation: true };
}
