/**
 * Capture remaining Phase 2E screenshots on the SAME persisted project.
 * Does not create a project. Does not run discovery.
 */
import { chromium } from "/Users/enejpolak/Projetki /Schedulizer/node_modules/playwright/index.mjs";
import { AUTH_STATE_PATH } from "./playwrightEnv.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = "http://localhost:3000";
const PROJECT = process.env.PHASE2E_RESUME_ID;
const ARTIFACTS = join(process.cwd(), ".playwright/artifacts/phase2e");
const CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  "/Users/enejpolak/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

mkdirSync(ARTIFACTS, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
const context = await browser.newContext({
  storageState: AUTH_STATE_PATH,
  viewport: { width: 1280, height: 800 },
});
await context.addInitScript(() => {
  localStorage.setItem(
    "arhitekt-ai-cookie-preferences",
    JSON.stringify({ essential: true, functional: false, analytics: false })
  );
});
const page = await context.newPage();
const net = [];
page.on("request", (req) => {
  try {
    const u = new URL(req.url());
    if (u.origin !== ORIGIN) return;
    if (
      u.pathname.startsWith("/api/geocode") ||
      u.pathname.startsWith("/api/places") ||
      u.pathname.startsWith("/api/serp") ||
      u.pathname.startsWith("/api-debug")
    ) {
      net.push(`${req.method()} ${u.pathname}`);
    }
  } catch {
    /* ignore */
  }
});

await page.goto(`${ORIGIN}/app/projects/${PROJECT}`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
await page.getByRole("button", { name: "Download Project Report" }).waitFor({ timeout: 45_000 });
await page.getByRole("button", { name: "Download Project Report" }).scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await page.screenshot({ path: join(ARTIFACTS, "04-final-report.png") });
const desktopText = await page.locator("body").innerText();

await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(400);
const menu = page.getByRole("button", { name: "Open projects menu" });
const menuVisible = await menu.isVisible();
let drawerOpen = false;
let drawerClose = false;
if (menuVisible) {
  await menu.click();
  const dialog = page.getByRole("dialog", { name: "Projects menu" });
  drawerOpen = await dialog.isVisible();
  await page.getByRole("dialog", { name: "Projects menu" }).getByRole("button", { name: "Close projects menu" }).click();
  drawerClose = !(await dialog.isVisible().catch(() => false));
}
await page.screenshot({ path: join(ARTIFACTS, "05-mobile-375.png") });
const overflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
  overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
}));

console.log("capture_spend_calls " + net.length);
console.log("menu " + (menuVisible ? "PASS" : "FAIL"));
console.log("drawerOpen " + (drawerOpen ? "PASS" : "FAIL"));
console.log("drawerClose " + (drawerClose ? "PASS" : "FAIL"));
console.log("overflow " + (overflow.overflow ? "YES" : "NO"));
console.log("overflow_detail " + JSON.stringify(overflow));
console.log("has_known_total " + /Known product total/i.test(desktopText));
console.log("has_estimate " + /estimate/i.test(desktopText));
console.log("has_found_product " + /Found product/i.test(desktopText));
console.log("has_unresolved " + /No verified product|Unresolved requirements/i.test(desktopText));
console.log("has_phoenix " + /Phoenix/i.test(desktopText));
console.log("has_ljubljana_contractor " + /Slikopleskarstvo|Ljubljana/i.test(desktopText));
await browser.close();
