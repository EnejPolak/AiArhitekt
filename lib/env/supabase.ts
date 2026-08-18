/**
 * Public Supabase config (URL + publishable key).
 *
 * Never read NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SECRET_KEY here.
 * Missing values must fail clearly — do not construct a client with "".
 */

export class MissingSupabaseConfigError extends Error {
  readonly code = "config" as const;

  constructor() {
    super(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
    this.name = "MissingSupabaseConfigError";
  }
}

export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
  ).trim();

  if (!url || !publishableKey) {
    throw new MissingSupabaseConfigError();
  }

  return { url, publishableKey };
}

/**
 * Origin used in email confirmation redirects (allow-listed in Supabase).
 * Prefer NEXT_PUBLIC_SITE_URL. Do not take this from a user-supplied query param.
 */
export function getAppOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");

  const vercel = (process.env.VERCEL_URL ?? "").trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }

  return "http://127.0.0.1:3000";
}
