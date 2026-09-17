import { getDeploymentEnv, type DeploymentEnv } from "./deployment";

export class InvalidProductionConfigError extends Error {
  readonly code = "config" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvalidProductionConfigError";
  }
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost")
  );
}

export function parsePublicHttpUrl(raw: string, label: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new InvalidProductionConfigError(`${label} is missing`);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new InvalidProductionConfigError(`${label} is malformed`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidProductionConfigError(`${label} is malformed`);
  }
  if (!parsed.hostname) {
    throw new InvalidProductionConfigError(`${label} is malformed`);
  }
  return parsed;
}

export function assertHostedSupabaseUrl(url: string, env: DeploymentEnv): void {
  const parsed = parsePublicHttpUrl(url, "NEXT_PUBLIC_SUPABASE_URL");
  if (env !== "production" && env !== "preview") return;
  if (isLoopbackHost(parsed.hostname)) {
    throw new InvalidProductionConfigError(
      "NEXT_PUBLIC_SUPABASE_URL must not point at localhost in this environment"
    );
  }
  if (parsed.protocol !== "https:") {
    throw new InvalidProductionConfigError(
      "NEXT_PUBLIC_SUPABASE_URL must use https in this environment"
    );
  }
}

export function assertProductionSiteUrl(raw: string | undefined, env: DeploymentEnv): string | null {
  const trimmed = (raw ?? "").trim();
  if (env !== "production") return trimmed ? trimmed.replace(/\/$/, "") : null;
  if (!trimmed) {
    throw new InvalidProductionConfigError("NEXT_PUBLIC_SITE_URL is missing");
  }
  const parsed = parsePublicHttpUrl(trimmed, "NEXT_PUBLIC_SITE_URL");
  if (isLoopbackHost(parsed.hostname)) {
    throw new InvalidProductionConfigError(
      "NEXT_PUBLIC_SITE_URL must not point at localhost in production"
    );
  }
  if (parsed.protocol !== "https:") {
    throw new InvalidProductionConfigError("NEXT_PUBLIC_SITE_URL must use https in production");
  }
  return parsed.origin;
}

/**
 * Fail fast on hosted deployments when required public/backend config is invalid.
 * Local development continues to allow http://127.0.0.1:54421.
 */
export function assertRuntimeConfig(env: DeploymentEnv = getDeploymentEnv()): void {
  if (env !== "production" && env !== "preview") return;

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const publishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();

  if (!url) {
    throw new InvalidProductionConfigError("NEXT_PUBLIC_SUPABASE_URL is missing");
  }
  if (!publishableKey) {
    throw new InvalidProductionConfigError("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing");
  }
  if (!secretKey) {
    throw new InvalidProductionConfigError("SUPABASE_SECRET_KEY is missing");
  }

  assertHostedSupabaseUrl(url, env);
  if (env === "production") {
    assertProductionSiteUrl(process.env.NEXT_PUBLIC_SITE_URL, env);
  }
}
