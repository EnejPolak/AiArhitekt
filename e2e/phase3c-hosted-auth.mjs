/**
 * AUTH-ONLY hosted signup + SMTP confirmation validation.
 * Does not create projects or call paid providers.
 * Never prints passwords, tokens, cookies, or full mailbox credentials.
 */
import { chromium } from "/Users/enejpolak/Projetki /Schedulizer/node_modules/playwright/index.mjs";
import { randomBytes } from "node:crypto";

const ORIGIN = "https://ai-arhitekt.vercel.app";
const CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  "/Users/enejpolak/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function sanitize(value) {
  return String(value || "")
    .replace(EMAIL_RE, "[email]")
    .replace(JWT_RE, "[token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function hostOf(raw) {
  try {
    return new URL(String(raw || "").trim()).hostname || "";
  } catch {
    return "";
  }
}

function pathOf(raw) {
  try {
    return new URL(String(raw || "").trim()).pathname || "";
  } catch {
    return "";
  }
}

function extractUrls(text) {
  return [...String(text || "").matchAll(/https?:\/\/[^\s"'<>\\]+/gi)].map((m) =>
    m[0].replace(/[).,;]+$/, "")
  );
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, data };
}

async function createMailbox() {
  const domainsRes = await jsonFetch("https://api.mail.tm/domains");
  const members = domainsRes.data?.["hydra:member"] || domainsRes.data || [];
  const domain = Array.isArray(members)
    ? members.find((d) => d.isActive !== false)?.domain
    : null;
  if (!domain) throw new Error("MAILBOX_DOMAIN_UNAVAILABLE");
  const local = `ai3c${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const address = `${local}@${domain}`;
  const password = randomBytes(18).toString("base64url");
  const created = await jsonFetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  if (!created.ok) throw new Error(`MAILBOX_CREATE_${created.status}`);
  const tokenRes = await jsonFetch("https://api.mail.tm/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  const token = tokenRes.data?.token;
  if (!token) throw new Error("MAILBOX_TOKEN_MISSING");
  return { address, domain, token };
}

async function listMessages(token) {
  const res = await jsonFetch("https://api.mail.tm/messages", {
    headers: { authorization: `Bearer ${token}` },
  });
  return res.data?.["hydra:member"] || [];
}

async function readMessage(token, id) {
  const res = await jsonFetch(`https://api.mail.tm/messages/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return res.data || {};
}

function pickConfirmationUrl(message) {
  const blobs = [message.text, message.html, message.intro]
    .concat((message.links || []).map((l) => (typeof l === "string" ? l : l?.href)))
    .filter(Boolean)
    .join("\n");
  const urls = extractUrls(blobs);
  return (
    urls.find((u) => /auth\/callback|verify|confirm|type=signup|token_hash|code=/i.test(u)) ||
    urls.find((u) => hostOf(u).includes("ai-arhitekt.vercel.app")) ||
    urls.find((u) => hostOf(u).includes("supabase.co")) ||
    urls[0] ||
    null
  );
}

const mailbox = await createMailbox();
const signupPassword = `${randomBytes(9).toString("base64url")}Aa1!`;
console.log("mailbox_domain " + mailbox.domain);
console.log("origin " + ORIGIN);

const errors = {
  pageerror: 0,
  consoleError: 0,
  http500: 0,
  unexpected401403: 0,
  consoleSamples: [],
};
const spendHits = [];

const browser = await chromium.launch({
  headless: process.env.PLAYWRIGHT_HEADED === "1" ? false : true,
  executablePath: CHROMIUM,
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem(
    "arhitekt-ai-cookie-preferences",
    JSON.stringify({ essential: true, functional: false, analytics: false })
  );
});
const page = await context.newPage();

page.on("pageerror", () => {
  errors.pageerror += 1;
});
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  errors.consoleError += 1;
  if (errors.consoleSamples.length < 6) {
    errors.consoleSamples.push(sanitize(msg.text()));
  }
});
page.on("request", (request) => {
  let url;
  try {
    url = new URL(request.url());
  } catch {
    return;
  }
  const path = url.pathname;
  if (
    path.startsWith("/api/geocode") ||
    path.startsWith("/api/places") ||
    path.startsWith("/api/serp") ||
    path.startsWith("/api/render") ||
    path.startsWith("/api/search-products") ||
    path.startsWith("/api/generate")
  ) {
    spendHits.push(path);
  }
});
page.on("response", (response) => {
  const status = response.status();
  let url;
  try {
    url = new URL(response.url());
  } catch {
    return;
  }
  if (status >= 500) errors.http500 += 1;
  const path = url.pathname;
  const expectedAuthDeny =
    (status === 401 || status === 403) &&
    (path.startsWith("/auth") || path.includes("/token") || path.includes("auth/v1"));
  if ((status === 401 || status === 403) && !expectedAuthDeny && url.origin === ORIGIN) {
    errors.unexpected401403 += 1;
  }
});

const result = {
  signupPass: false,
  confirmationUi: false,
  genericFalseError: false,
  emailReceived: false,
  deliveryMs: null,
  senderName: null,
  senderDomain: null,
  linkHost: null,
  linkPath: null,
  localhostInLink: false,
  loopbackInLink: false,
  unexpectedDomain: false,
  callbackPass: false,
  sessionPass: false,
  reachedApp: false,
  workspacePass: false,
  emptyStatePass: false,
  reloadPass: false,
  logoutPass: false,
  appProtected: false,
  signInPass: false,
  signInReachedApp: false,
};

try {
  await page.goto(`${ORIGIN}/sign-up`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const rejectCookies = page.getByRole("button", { name: /reject all/i });
  if (await rejectCookies.isVisible().catch(() => false)) {
    await rejectCookies.click();
    await page.waitForTimeout(500);
  }
  await page.locator("#email").waitFor({ timeout: 20_000 });
  await page.locator("#email").fill(mailbox.address);
  await page.locator("#password").fill(signupPassword);
  await page.locator("#confirmPassword").fill(signupPassword);
  await page.locator('input[type="checkbox"][required]').check({ force: true });
  await page.getByRole("button", { name: /create account/i }).click();
  await page
    .waitForFunction(() => {
      const alert = document.querySelector("[role='alert']");
      const status = document.querySelector("[role='status']");
      const button = Array.from(document.querySelectorAll("button")).find((b) =>
        /create account|creating account/i.test(b.textContent || "")
      );
      const text = `${alert?.textContent || ""} ${status?.textContent || ""}`;
      if (/check your email|something went wrong|invalid|unavailable|try again/i.test(text)) {
        return true;
      }
      return Boolean(button && !/creating account/i.test(button.textContent || ""));
    }, { timeout: 25_000 })
    .catch(() => {});

  const afterSignupUrl = new URL(page.url());
  const alertText = sanitize(await page.getByRole("alert").textContent().catch(() => ""));
  const statusText = sanitize(await page.getByRole("status").textContent().catch(() => ""));
  const bodyText = sanitize(await page.locator("body").innerText());
  result.genericFalseError = /something went wrong/i.test(`${alertText} ${statusText} ${bodyText}`);
  result.confirmationUi = /check your email/i.test(`${statusText} ${bodyText}`);
  result.signupPass =
    afterSignupUrl.pathname === "/sign-up" &&
    result.confirmationUi &&
    !result.genericFalseError &&
    !afterSignupUrl.pathname.startsWith("/app");
  console.log("signup_path " + afterSignupUrl.pathname);
  console.log("confirmation_ui " + (result.confirmationUi ? "YES" : "NO"));
  console.log("generic_false_error " + (result.genericFalseError ? "YES" : "NO"));
  console.log("customer_alert " + (alertText || "(none)"));
  console.log("customer_status " + (statusText || "(none)"));
  console.log("signup_body_snip " + bodyText.slice(0, 240));
  if (!result.signupPass) {
    throw new Error("SIGNUP_UI_FAILED");
  }

  const started = Date.now();
  let confirmationUrl = null;
  let message = null;
  for (let i = 0; i < 24; i += 1) {
    const messages = await listMessages(mailbox.token);
    if (messages.length) {
      message = await readMessage(mailbox.token, messages[0].id);
      confirmationUrl = pickConfirmationUrl(message);
      if (confirmationUrl) {
        result.emailReceived = true;
        result.deliveryMs = Date.now() - started;
        break;
      }
    }
    await page.waitForTimeout(5000);
  }
  const from = Array.isArray(message?.from) ? message.from[0] : message?.from;
  result.senderName = from?.name || message?.from?.name || null;
  const fromAddress = from?.address || from?.email || "";
  result.senderDomain = fromAddress.includes("@") ? fromAddress.split("@")[1] : null;
  console.log("email_received " + (result.emailReceived ? "YES" : "NO"));
  console.log("delivery_ms " + String(result.deliveryMs ?? "none"));
  console.log("sender_name " + (result.senderName || "(none)"));
  console.log("sender_domain " + (result.senderDomain || "(none)"));
  if (!confirmationUrl) throw new Error("CONFIRMATION_EMAIL_MISSING");

  result.linkHost = hostOf(confirmationUrl);
  result.linkPath = pathOf(confirmationUrl);
  result.localhostInLink = /localhost/i.test(confirmationUrl);
  result.loopbackInLink = /127\.0\.0\.1/.test(confirmationUrl);
  result.unexpectedDomain = !(
    result.linkHost === "ai-arhitekt.vercel.app" ||
    result.linkHost.endsWith(".supabase.co")
  );
  console.log("link_host " + result.linkHost);
  console.log("link_path " + result.linkPath);
  console.log("localhost_in_link " + (result.localhostInLink ? "YES" : "NO"));
  console.log("loopback_in_link " + (result.loopbackInLink ? "YES" : "NO"));

  await page.goto(confirmationUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL((next) => next.pathname.startsWith("/app") || next.pathname.startsWith("/sign-in"), {
    timeout: 45_000,
  }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const afterConfirm = new URL(page.url());
  result.callbackPass =
    afterConfirm.origin === ORIGIN &&
    (afterConfirm.pathname.startsWith("/app") || afterConfirm.pathname.includes("/auth/callback"));
  result.reachedApp = afterConfirm.pathname.startsWith("/app");
  const appBody = await page.locator("body").innerText();
  result.workspacePass = /new project|no projects yet|projects/i.test(appBody);
  result.emptyStatePass = /no projects yet/i.test(appBody);
  result.sessionPass = (await context.cookies()).some((c) => c.name.startsWith("sb-"));
  console.log("after_confirm_path " + afterConfirm.pathname);
  console.log("workspace " + (result.workspacePass ? "YES" : "NO"));
  console.log("empty_state " + (result.emptyStatePass ? "YES" : "NO"));
  console.log("sb_cookie " + (result.sessionPass ? "YES" : "NO"));
  if (!result.reachedApp) throw new Error("DID_NOT_REACH_APP_AFTER_CONFIRM");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForURL((next) => next.pathname.startsWith("/app"), { timeout: 30_000 });
  result.reloadPass = page.url().includes("/app");
  console.log("reload_app " + (result.reloadPass ? "YES" : "NO"));

  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL((next) => next.pathname.startsWith("/sign-in"), { timeout: 30_000 });
  result.logoutPass = new URL(page.url()).pathname.startsWith("/sign-in");
  await page.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  result.appProtected = new URL(page.url()).pathname.startsWith("/sign-in");
  console.log("logout " + (result.logoutPass ? "YES" : "NO"));
  console.log("app_protected " + (result.appProtected ? "YES" : "NO"));

  await page.goto(`${ORIGIN}/sign-in`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator("#email").fill(mailbox.address);
  await page.locator("#password").fill(signupPassword);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((next) => next.pathname.startsWith("/app"), { timeout: 30_000 }).catch(() => {});
  const afterSignIn = new URL(page.url());
  result.signInReachedApp = afterSignIn.pathname.startsWith("/app");
  result.signInPass = result.signInReachedApp;
  console.log("signin_path " + afterSignIn.pathname);
} finally {
  console.log("http500 " + errors.http500);
  console.log("unexpected_401_403 " + errors.unexpected401403);
  console.log("pageerror " + errors.pageerror);
  console.log("console_error " + errors.consoleError);
  if (errors.consoleSamples.length) {
    console.log("console_samples " + errors.consoleSamples.join(" || "));
  }
  console.log("spend_routes " + spendHits.length);
  console.log("RESULT_JSON " + JSON.stringify(result));
  await browser.close();
}

if (spendHits.length) {
  throw new Error("AUTH_ONLY_SPEND_ROUTE_HIT");
}
if (!result.signInPass) {
  process.exitCode = 1;
}
