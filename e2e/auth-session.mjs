/**
 * Auth-only Playwright session: /sign-in → /app → reload.
 * Reuses the Schedulizer-installed Playwright/Chromium runtime.
 * Does not create a project or call paid providers.
 * Never prints credentials, tokens, or cookie values.
 */
import { chromium } from "/Users/enejpolak/Projetki /Schedulizer/node_modules/playwright/index.mjs";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTH_STATE_PATH,
  ensureAuthStateDir,
  requirePlaywrightTestUser,
} from "./playwrightEnv.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://localhost:3000";
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

const CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  "/Users/enejpolak/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

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

function hostOf(raw) {
  try {
    return new URL(String(raw || "").trim()).host || "unparseable";
  } catch {
    return "unparseable";
  }
}

function sanitizeText(value) {
  return String(value || "")
    .replace(EMAIL_RE, "[email]")
    .replace(JWT_RE, "[token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

const localEnv = loadDotEnv(join(ROOT, ".env.local"));
const fileEnv = loadDotEnv(join(ROOT, ".env"));
const supabaseHostLocal = hostOf(localEnv.NEXT_PUBLIC_SUPABASE_URL);
const supabaseHostDotenv = fileEnv.NEXT_PUBLIC_SUPABASE_URL
  ? hostOf(fileEnv.NEXT_PUBLIC_SUPABASE_URL)
  : "(unset)";

const user = requirePlaywrightTestUser();
ensureAuthStateDir();

console.log("origin " + ORIGIN);
console.log("supabase_host_env_local " + supabaseHostLocal);
console.log("supabase_host_env_file " + supabaseHostDotenv);
console.log(
  "supabase_project_match " +
    (supabaseHostDotenv === "(unset)" || supabaseHostDotenv === supabaseHostLocal ? "YES" : "NO")
);
console.log("playwright_email_configured " + Boolean(user.email));
console.log("playwright_email_has_at " + user.email.includes("@"));
console.log("playwright_password_configured " + Boolean(user.password));

const browser = await chromium.launch({
  headless: process.env.PLAYWRIGHT_HEADED === "1" ? false : true,
  executablePath: CHROMIUM,
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => {
  localStorage.setItem(
    "arhitekt-ai-cookie-preferences",
    JSON.stringify({ essential: true, functional: false, analytics: false })
  );
});
const page = await context.newPage();

const spendHits = [];
const navLog = [];
const cookieNamesSeen = new Set();
let signInPost = { status: null, setCookieCount: 0, durationMs: null };
let appRequested = false;
let originChanged = false;

page.on("request", (request) => {
  let url;
  try {
    url = new URL(request.url());
  } catch {
    return;
  }
  if (url.origin !== ORIGIN && url.protocol.startsWith("http")) {
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") originChanged = true;
  }
  const path = url.pathname;
  if (
    path.startsWith("/api/geocode") ||
    path.startsWith("/api/places") ||
    path.startsWith("/api/serp") ||
    path.startsWith("/api/render") ||
    path.startsWith("/api-debug")
  ) {
    spendHits.push(path);
  }
  if (path.startsWith("/app")) appRequested = true;
});

page.on("response", (response) => {
  let url;
  try {
    url = new URL(response.url());
  } catch {
    return;
  }
  const path = url.pathname;
  const headers = response.headers();
  const setCookie = headers["set-cookie"] || "";
  const setCookieCount = setCookie ? setCookie.split(/,(?=[^ ;]+=)/).filter(Boolean).length : 0;
  if (response.request().method() === "POST" && path === "/sign-in") {
    signInPost = {
      status: response.status(),
      setCookieCount,
      durationMs: null,
    };
  }
  if (path.startsWith("/app") || path === "/sign-in") {
    navLog.push(`${response.request().method()} ${path} ${response.status()}`);
  }
});

try {
  await page.goto(`${ORIGIN}/sign-in`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (!page.url().startsWith(ORIGIN)) originChanged = true;
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForFunction(() => {
    const el = document.querySelector("#email");
    return Boolean(el && Object.keys(el).some((key) => key.startsWith("__react")));
  }, { timeout: 15_000 });

  await page.locator("#email").click();
  await page.locator("#email").fill("");
  await page.locator("#email").pressSequentially(user.email, { delay: 10 });
  await page.locator("#password").click();
  await page.locator("#password").fill("");
  await page.locator("#password").pressSequentially(user.password, { delay: 10 });

  const emailValue = await page.locator("#email").inputValue();
  const passwordValue = await page.locator("#password").inputValue();
  console.log("email_field_has_at " + emailValue.includes("@"));
  console.log("email_field_nonempty " + Boolean(emailValue.trim()));
  console.log("password_field_nonempty " + Boolean(passwordValue));

  const started = Date.now();
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await page
    .waitForURL((next) => next.pathname.startsWith("/app"), { timeout: 25_000 })
    .catch(() => {});

  signInPost.durationMs = Date.now() - started;

  const alertText = sanitizeText(await page.getByRole("alert").textContent().catch(() => ""));
  const statusText = sanitizeText(await page.getByRole("status").textContent().catch(() => ""));
  const buttonText = sanitizeText(
    await page.getByRole("button", { name: /sign in|signing in/i }).first().textContent().catch(() => "")
  );
  let url;
  try {
    url = new URL(page.url());
  } catch {
    url = { pathname: "unparseable", origin: "unparseable" };
  }
  if (url.origin && url.origin !== ORIGIN) originChanged = true;

  for (const cookie of await context.cookies()) {
    if (cookie.name.startsWith("sb-")) cookieNamesSeen.add("sb-*");
    else cookieNamesSeen.add("other");
  }

  const bodySnip = sanitizeText(await page.locator("body").innerText());
  console.log("body_snip " + bodySnip.slice(0, 280));
  console.log("customer_status " + (statusText || "(none)"));
  console.log("button_text " + (buttonText || "(none)"));
  console.log("final_path " + url.pathname);
  console.log("origin_changed " + (originChanged ? "YES" : "NO"));
  console.log("post_sign_in_status " + String(signInPost.status ?? "none"));
  console.log("post_sign_in_set_cookie_count " + String(signInPost.setCookieCount));
  console.log("post_sign_in_ms " + String(signInPost.durationMs));
  console.log("sb_cookie_present " + (cookieNamesSeen.has("sb-*") ? "YES" : "NO"));
  console.log("app_requested " + (appRequested ? "YES" : "NO"));
  console.log("nav " + (navLog.slice(-8).join(" | ") || "(none)"));
  console.log("spend_routes " + spendHits.length);

  const reachedApp = url.pathname.startsWith("/app");
  if (!reachedApp) {
    throw new Error(
      `SIGN_IN_DID_NOT_REACH_APP alert=${alertText || "(none)"} status=${statusText || "(none)"} path=${url.pathname}`
    );
  }

  const shell = await page.locator("body").innerText();
  if (!/new project|no projects yet|projects/i.test(shell)) {
    throw new Error("Reached a URL under /app but the authenticated shell was not visible.");
  }

  await context.storageState({ path: AUTH_STATE_PATH });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForURL((next) => next.pathname.startsWith("/app"), { timeout: 30_000 });
  if (!page.url().includes("/app")) {
    throw new Error("Reload lost the authenticated session.");
  }
  if (spendHits.length) {
    throw new Error("Auth-only run must not call spend routes.");
  }

  console.log("AUTH_SESSION_OK");
  console.log("reached_/app yes");
  console.log("reload_authenticated yes");
  console.log("storageState_written yes");
} finally {
  await browser.close();
}
