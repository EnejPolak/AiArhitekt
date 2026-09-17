export type AuthErrorCode =
  | "invalid_credentials"
  | "invalid_email"
  | "invalid_password"
  | "email_confirmation_required"
  | "user_already_exists"
  | "callback_invalid"
  | "rate_limited"
  | "signup_disabled"
  | "captcha_failed"
  | "provider_unavailable"
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
  user_already_exists: "Could not create this account. Try signing in instead.",
  callback_invalid:
    "This sign-in link is invalid or has expired. Request a new one or sign in again.",
  rate_limited: "Too many attempts. Try again in a few minutes.",
  signup_disabled: "New accounts are not available right now.",
  captcha_failed: "Could not verify this request. Try again.",
  provider_unavailable: "Authentication is temporarily unavailable. Try again later.",
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
  const status = error.status;
  const name = normalize(error.name);

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
    code === "user_already_exists" ||
    code === "email_exists" ||
    message.includes("already registered") ||
    message.includes("user already exists") ||
    message.includes("email already")
  ) {
    return {
      code: "user_already_exists",
      message: MESSAGES.user_already_exists,
    };
  }

  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    code === "over_sms_send_rate_limit" ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    status === 429
  ) {
    return { code: "rate_limited", message: MESSAGES.rate_limited };
  }

  if (
    code === "signup_disabled" ||
    message.includes("signups not allowed") ||
    message.includes("signup is disabled") ||
    message.includes("signups disabled")
  ) {
    return { code: "signup_disabled", message: MESSAGES.signup_disabled };
  }

  if (
    code === "captcha_failed" ||
    code === "captcha_unprocessable" ||
    message.includes("captcha") ||
    message.includes("turnstile")
  ) {
    return { code: "captcha_failed", message: MESSAGES.captcha_failed };
  }

  if (
    code === "otp_expired" ||
    code === "flow_state_expired" ||
    code === "flow_state_not_found" ||
    message.includes("invalid token") ||
    message.includes("code verifier") ||
    message.includes("flow state")
  ) {
    return { code: "callback_invalid", message: MESSAGES.callback_invalid };
  }

  if (
    message.includes("redirect") &&
    (message.includes("invalid") ||
      message.includes("not allowed") ||
      message.includes("whitelist") ||
      message.includes("allow"))
  ) {
    return { code: "config", message: MESSAGES.config };
  }

  if (
    message.includes("error sending") ||
    message.includes("confirmation email") ||
    message.includes("smtp") ||
    message.includes("error sending confirmation")
  ) {
    return {
      code: "provider_unavailable",
      message: MESSAGES.provider_unavailable,
    };
  }

  if (
    name.includes("authretryable") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborterror") ||
    status === 504 ||
    status === 502 ||
    status === 503
  ) {
    if (message.includes("timeout") || message.includes("timed out") || status === 504) {
      return { code: "provider_unavailable", message: MESSAGES.provider_unavailable };
    }
    return { code: "network", message: MESSAGES.network };
  }

  if (status != null && status >= 500) {
    return { code: "provider_unavailable", message: MESSAGES.provider_unavailable };
  }

  return { code: "generic", message: MESSAGES.generic };
}
