/**
 * Deployment environment awareness.
 *
 * Do not gate production-only behaviour on NODE_ENV alone. Next.js sets
 * NODE_ENV=production for every `next build` / `next start`, including local
 * production servers and Vercel preview builds.
 *
 * Production detection (first match wins as production):
 * - VERCEL_ENV or VERCEL_TARGET_ENV === "production" (Vercel)
 * - APP_DEPLOYMENT_ENV === "production" (non-Vercel hosts)
 */

export type DeploymentEnv = "production" | "preview" | "development" | "local";

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim().toLowerCase();
}

function vercelDeploymentLabel(): string {
  return readEnv("VERCEL_ENV") || readEnv("VERCEL_TARGET_ENV");
}

export function getDeploymentEnv(): DeploymentEnv {
  const vercel = vercelDeploymentLabel();
  if (vercel === "production") return "production";
  if (vercel === "preview") return "preview";
  if (vercel === "development") return "development";

  const app = readEnv("APP_DEPLOYMENT_ENV");
  if (app === "production") return "production";
  if (app === "preview") return "preview";
  if (app === "development") return "development";

  return "local";
}

export function isProductionDeployment(): boolean {
  return getDeploymentEnv() === "production";
}

/**
 * Debug surfaces (`/api-debug`, `/api/serp/reset-usage`, later debug routes).
 *
 * Production deployments always reject, even if API_DEBUG_ENABLED is true.
 * Preview / development / local may enable only with an explicit flag.
 */
export function isDebugApiAllowed(): boolean {
  if (isProductionDeployment()) return false;
  const flag = readEnv("API_DEBUG_ENABLED");
  return flag === "true" || flag === "1" || flag === "yes";
}
