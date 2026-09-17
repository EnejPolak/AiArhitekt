import { getDeploymentEnv } from "./deployment";
import { assertHostedSupabaseUrl, assertProductionSiteUrl } from "./productionConfig";

/**
 * Public Supabase config (URL + publishable key) plus a separate secret helper
 * used only for trusted persist RPCs.
 *
 * Never read NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Never put SUPABASE_SECRET_KEY in NEXT_PUBLIC_*.
 */

export class MissingSupabaseConfigError extends Error {
  readonly code = "config" as const;

  constructor(message = "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
    super(message);
    this.name = "MissingSupabaseConfigError";
  }
}

export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export type SupabaseSecretConfig = {
  url: string;
  secretKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
  ).trim();

  if (!url || !publishableKey) {
    throw new MissingSupabaseConfigError();
  }

  const env = getDeploymentEnv();
  if (env === "production" || env === "preview") {
    assertHostedSupabaseUrl(url, env);
  }

  return { url, publishableKey };
}

/**
 * Server-only secret for trusted persist RPCs. Never NEXT_PUBLIC_.
 * Not used for login, project CRUD, or browser operations.
 */
export function getSupabaseSecretConfig(): SupabaseSecretConfig {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  if (!url || !secretKey) {
    throw new MissingSupabaseConfigError(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY"
    );
  }
  const env = getDeploymentEnv();
  if (env === "production" || env === "preview") {
    assertHostedSupabaseUrl(url, env);
  }
  return { url, secretKey };
}

/**
 * Origin used in email confirmation redirects (allow-listed in Supabase).
 * Prefer NEXT_PUBLIC_SITE_URL. Do not take this from a user-supplied query param.
 */
export function getAppOrigin(): string {
  const env = getDeploymentEnv();
  const configured = assertProductionSiteUrl(process.env.NEXT_PUBLIC_SITE_URL, env);
  if (configured) return configured;

  const vercel = (process.env.VERCEL_URL ?? "").trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }

  return "http://127.0.0.1:3000";
}
