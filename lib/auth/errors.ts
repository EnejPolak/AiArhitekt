export type AuthErrorCode =
  | "invalid_credentials"
  | "invalid_email"
  | "invalid_password"
  | "email_confirmation_required"
  | "callback_invalid"
  | "network"
  | "config"
  | "generic";

export type AuthErrorInfo = {
  code: AuthErrorCode;
  message: string;
};

const MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: "Invalid email or password.",
  invalid_email: "Enter a valid email address.",
  invalid_password:
    "Password must be at least 8 characters. Use a stronger password.",
  email_confirmation_required:
    "Confirm your email before signing in. Check your inbox for a link.",
  callback_invalid:
    "This sign-in link is invalid or has expired. Request a new one or sign in again.",
  network: "We could not reach the authentication service. Try again.",
  config:
    "Authentication is not configured. Set the required environment variables.",
  generic: "Something went wrong. Try again.",
};

export function authErrorMessage(code: AuthErrorCode): string {
  return MESSAGES[code];
}

function normalize(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Map a provider error to a safe UI message. Do not pass through raw objects.
 */
export function mapAuthError(
  error:
    | {
        message?: string;
        code?: string;
        status?: number;
        name?: string;
      }
    | null
    | undefined
): AuthErrorInfo {
  if (!error) return { code: "generic", message: MESSAGES.generic };

  const code = normalize(error.code);
  const message = normalize(error.message);

  if (code === "config" || error.name === "MissingSupabaseConfigError") {
    return { code: "config", message: MESSAGES.config };
  }

  if (
    code === "invalid_credentials" ||
    code === "invalid_login_credentials" ||
    message.includes("invalid login credentials") ||
    message.includes("invalid email or password")
  ) {
    return {
      code: "invalid_credentials",
      message: MESSAGES.invalid_credentials,
    };
  }

  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  ) {
    return {
      code: "email_confirmation_required",
      message: MESSAGES.email_confirmation_required,
    };
  }

  if (
    code === "weak_password" ||
    (message.includes("password") &&
      (message.includes("weak") ||
        message.includes("at least") ||
        message.includes("too short")))
  ) {
    return { code: "invalid_password", message: MESSAGES.invalid_password };
  }

  if (
    code === "validation_failed" ||
    code === "invalid_email" ||
    message.includes("invalid email") ||
    message.includes("unable to validate email")
  ) {
    return { code: "invalid_email", message: MESSAGES.invalid_email };
  }

  if (
    code === "over_request_rate_limit" ||
    message.includes("rate limit") ||
    message.includes("failed to fetch") ||
    message.includes("network")
  ) {
    return { code: "network", message: MESSAGES.network };
  }

  if (
    code === "otp_expired" ||
    code === "flow_state_expired" ||
    code === "flow_state_not_found" ||
    message.includes("expired") ||
    message.includes("invalid token") ||
    message.includes("code verifier") ||
    message.includes("flow state")
  ) {
    return { code: "callback_invalid", message: MESSAGES.callback_invalid };
  }

  if (
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("user already exists")
  ) {
    return {
      code: "generic",
      message: "Could not create this account. Try signing in instead.",
    };
  }

  return { code: "generic", message: MESSAGES.generic };
}
