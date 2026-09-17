import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadPlaywrightTestEnv() {
  const fileEnv = loadDotEnv(join(ROOT, ".env.local"));
  const email = String(process.env.PLAYWRIGHT_TEST_EMAIL || fileEnv.PLAYWRIGHT_TEST_EMAIL || "").trim();
  const password = String(
    process.env.PLAYWRIGHT_TEST_PASSWORD || fileEnv.PLAYWRIGHT_TEST_PASSWORD || ""
  );
  const baseUrl = String(
    process.env.PLAYWRIGHT_BASE_URL || fileEnv.PLAYWRIGHT_BASE_URL || "http://localhost:3000"
  ).replace(/\/$/, "");
  return { email, password, baseUrl };
}

export function requirePlaywrightTestUser() {
  const env = loadPlaywrightTestEnv();
  const missing = [];
  if (!env.email) missing.push("PLAYWRIGHT_TEST_EMAIL");
  if (!env.password) missing.push("PLAYWRIGHT_TEST_PASSWORD");
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(" and ")}. Create a verified test user manually, set the names in .env.local (never commit), then re-run. Passwords are not printed.`
    );
  }
  return env;
}

export const AUTH_STATE_PATH = join(ROOT, ".playwright/.auth/aiarhitekt-user.json");

export function ensureAuthStateDir() {
  mkdirSync(dirname(AUTH_STATE_PATH), { recursive: true });
}
