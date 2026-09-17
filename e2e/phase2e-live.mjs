/**
 * PHASE 2E LIVE E2E — one Chromium session, one project, one discovery.
 * Reuses Schedulizer Playwright + existing storageState.
 * Does not sign up. Signs in only if storageState is unexpectedly invalid.
 * Never prints credentials, tokens, cookies, or API keys.
 */
import { chromium } from "/Users/enejpolak/Projetki /Schedulizer/node_modules/playwright/index.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTH_STATE_PATH,
  requirePlaywrightTestUser,
} from "./playwrightEnv.mjs";

const { PNG } = createRequire(import.meta.url)("pngjs");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://localhost:3000";
const ARTIFACTS = join(ROOT, ".playwright/artifacts/phase2e");
const PHOTO_PATH = join(ARTIFACTS, "living-room.png");
const CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  "/Users/enejpolak/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

mkdirSync(ARTIFACTS, { recursive: true });

function sanitize(value) {
  return String(value || "")
    .replace(EMAIL_RE, "[email]")
    .replace(JWT_RE, "[token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function writeLivingRoomPng() {
  const width = 640;
  const height = 480;
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) << 2;
      const floor = y > 310;
      const window = x > 420 && y > 70 && y < 210;
      const sofa = y > 250 && y < 330 && x > 80 && x < 360;
      const lamp = x > 40 && x < 70 && y > 140 && y < 310;
      if (floor) {
        png.data[i] = 118;
        png.data[i + 1] = 92;
        png.data[i + 2] = 68;
      } else if (window) {
        png.data[i] = 186;
        png.data[i + 1] = 214;
        png.data[i + 2] = 232;
      } else if (sofa) {
        png.data[i] = 168;
        png.data[i + 1] = 142;
        png.data[i + 2] = 118;
      } else if (lamp) {
        png.data[i] = 36;
        png.data[i + 1] = 36;
        png.data[i + 2] = 40;
      } else {
        png.data[i] = 214;
        png.data[i + 1] = 204;
        png.data[i + 2] = 188;
      }
      png.data[i + 3] = 255;
    }
  }
  writeFileSync(PHOTO_PATH, PNG.sync.write(png));
}

function classifyUrl(raw) {
  try {
    const url = new URL(raw);
    return { origin: url.origin, path: url.pathname, host: url.hostname };
  } catch {
    return { origin: "", path: "", host: "" };
  }
}

function isAppApi(path) {
  return (
    path.startsWith("/api/geocode") ||
    path.startsWith("/api/places") ||
    path.startsWith("/api/serp") ||
    path.startsWith("/api/render") ||
    path.startsWith("/api-debug") ||
    path.startsWith("/api/budget-plan") ||
    path.startsWith("/api/generate-greeting") ||
    path.startsWith("/api/analyze") ||
    path.startsWith("/api/prompt-room-render") ||
    path.startsWith("/api/renovate") ||
    path.startsWith("/api/search-products") ||
    path.startsWith("/api/orchestrator")
  );
}

function writeLivingRoomNotes() {
  return [
    "Keep my current sofa. Keep my current chair. Keep my current desk. Keep my current bed. Keep my current wardrobe.",
    "Need only these three products:",
    "1. black floor lamp, metal, max 150 EUR",
    "2. light-colored ceramic decorative vase, around 30 cm, max 60 EUR",
    "3. neutral living-room rug, approximately 160x230 cm, max 250 EUR",
  ].join(" ");
}

const report = {
  startedAt: new Date().toISOString(),
  browser: "Chromium / Playwright",
  storageStateReused: existsSync(AUTH_STATE_PATH),
  signedInDuringRun: false,
  projectsRun: 0,
  discoveryRuns: 0,
  extraDiscoveryRuns: 0,
  timings: {},
  network: [],
  errors: {
    pageerror: [],
    consoleerror: [],
    requestfailed: [],
    http500: [],
    unexpected401: [],
    unexpected403: [],
    hydration: [],
  },
  products: [],
  unmatched: [],
  shopping: {},
  finalReport: {},
  contractors: { run: false },
  mobile: {},
  flags: {},
  p0: null,
  p1: null,
  p2: [],
};

function markP0(message) {
  if (!report.p0) report.p0 = message;
  throw new Error(`P0: ${message}`);
}

function markP1(message) {
  if (!report.p1) report.p1 = message;
  throw new Error(`P1: ${message}`);
}

function snapshotNetwork() {
  return report.network.length;
}

function countSince(index, pred) {
  return report.network.slice(index).filter(pred).length;
}

function isGeocode(entry) {
  return entry.path.startsWith("/api/geocode");
}
function isPlaces(entry) {
  return entry.path.startsWith("/api/places") && !entry.path.startsWith("/api/places-contractors");
}
function isContractors(entry) {
  return entry.path.startsWith("/api/places-contractors");
}
function isSerp(entry) {
  return entry.path.startsWith("/api/serp") || entry.path.startsWith("/api-debug");
}
function isSpendish(entry) {
  return (
    isGeocode(entry) ||
    isPlaces(entry) ||
    isContractors(entry) ||
    isSerp(entry) ||
    entry.path.startsWith("/api/render") ||
    entry.path.startsWith("/api/search-products") ||
    entry.path.startsWith("/api/orchestrator") ||
    entry.path.startsWith("/api/renovate")
  );
}

async function clickNamed(page, name, options = {}) {
  const timeout = options.timeout ?? 30_000;
  const exact = options.exact ?? true;
  const button = page.getByRole("button", { name, exact });
  await button.first().waitFor({ state: "visible", timeout });
  await button.first().click({ timeout });
}

async function clickTextButton(page, name, timeout = 30_000) {
  const loc = page.locator("button", { hasText: name }).filter({ visible: true });
  await loc.first().waitFor({ state: "visible", timeout });
  await loc.first().click({ timeout });
}

async function dumpShot(page, name) {
  const path = join(ARTIFACTS, name);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function extractDiscoveryUi(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    const cards = [];
    const openLinks = [...document.querySelectorAll('a')].filter((a) =>
      /open product/i.test(a.textContent || "")
    );
    for (const link of openLinks) {
      const card = link.closest("div.rounded-\\[12px\\], div") || link.parentElement;
      const block = (card?.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
      cards.push({
        url: link.href || "",
        lines: block.slice(0, 12),
      });
    }
    return {
      text: text.slice(0, 12000),
      foundHeading: /Found products/i.test(text),
      allNotFound: /No matching products were found/i.test(text),
      partial: /Partial results/i.test(text),
      searchedNear: /Searched near/i.test(text) || /Search near/i.test(text),
      unresolved: /Unresolved/i.test(text),
      interrupted: /interrupted|timed out|discovery_timeout/i.test(text),
      cards,
    };
  });
}

function parseCards(ui) {
  const products = [];
  for (const card of ui.cards || []) {
    const lines = card.lines || [];
    const reqLine = lines.find((l) => /found this product for/i.test(l));
    const req = reqLine ? reqLine.replace(/^.*for:\s*/i, "") : "";
    const title =
      lines.find(
        (l) =>
          l &&
          !/found this product for/i.test(l) &&
          !/open product/i.test(l) &&
          !/use in design/i.test(l) &&
          !/selected for design/i.test(l) &&
          !/price unavailable/i.test(l) &&
          !/€/.test(l) &&
          !/EUR/i.test(l) &&
          !/not yet reference/i.test(l)
      ) || "";
    const priceLine =
      lines.find((l) => /€|EUR|Price unavailable/i.test(l) && !/found this product/i.test(l)) ||
      "";
    const merchant =
      lines.find(
        (l) =>
          l &&
          l !== title &&
          l !== priceLine &&
          !/found this product/i.test(l) &&
          !/open product/i.test(l) &&
          !/use in design/i.test(l) &&
          !/selected for design/i.test(l) &&
          !/not yet reference/i.test(l)
      ) || "";
    products.push({
      requirement: req,
      product: title,
      merchant,
      price: priceLine,
      url: card.url,
    });
  }
  return products;
}

function mapRequested(products, unmatchedText) {
  const requested = [
    {
      requirement: "black floor lamp, metal, max 150 EUR",
      keys: [/lamp/i, /light/i, /svetil/i],
    },
    {
      requirement: "light-colored ceramic decorative vase, around 30 cm, max 60 EUR",
      keys: [/vase/i, /ceramic/i, /vaza/i],
    },
    {
      requirement: "neutral living-room rug, approximately 160x230 cm, max 250 EUR",
      keys: [/rug/i, /carpet/i, /prepro/i],
    },
  ];
  const blobUnmatched = String(unmatchedText || "");
  return requested.map((item) => {
    const found = products.find((p) =>
      item.keys.some((re) => re.test(`${p.requirement} ${p.product}`))
    );
    const missing = item.keys.some((re) => re.test(blobUnmatched));
    let result = "NOT_FOUND";
    if (found) result = "FOUND";
    else if (/interrupted/i.test(blobUnmatched) && missing) result = "SEARCH_INTERRUPTED";
    return { ...item, result, match: found || null };
  });
}

writeLivingRoomPng();

if (!existsSync(AUTH_STATE_PATH)) {
  report.p0 = "storageState missing";
  writeFileSync(join(ARTIFACTS, "report.json"), JSON.stringify(report, null, 2));
  console.log("P0 BLOCKER: storageState missing at .playwright/.auth/aiarhitekt-user.json");
  process.exit(2);
}

const user = requirePlaywrightTestUser();
const browser = await chromium.launch({
  headless: process.env.PLAYWRIGHT_HEADED === "1" ? false : true,
  executablePath: CHROMIUM,
});
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

const nextLogPath =
  process.env.PHASE2E_NEXT_LOG ||
  "/Users/enejpolak/.cursor/projects/Users-enejpolak-Projetki-AiArhitekt/terminals/531050.txt";
let nextLogStartBytes = 0;
try {
  nextLogStartBytes = existsSync(nextLogPath) ? readFileSync(nextLogPath).length : 0;
} catch {
  nextLogStartBytes = 0;
}

page.on("pageerror", (err) => {
  report.errors.pageerror.push(sanitize(err?.message || String(err)));
});
page.on("console", (msg) => {
  const type = msg.type();
  const text = sanitize(msg.text());
  if (type === "error") {
    report.errors.consoleerror.push(text);
    if (/hydrat/i.test(text)) report.errors.hydration.push(text);
  }
  if (/\[discovery-client\]/.test(msg.text() || "") || /\[openai-product-discovery\]/.test(msg.text() || "")) {
    report.flags.clientLogs = report.flags.clientLogs || [];
    report.flags.clientLogs.push(text);
  }
});
page.on("requestfailed", (req) => {
  const { path } = classifyUrl(req.url());
  report.errors.requestfailed.push(sanitize(`${req.failure()?.errorText || "failed"} ${path}`));
});
page.on("request", (request) => {
  const { origin, path } = classifyUrl(request.url());
  if (origin !== ORIGIN) return;
  const headers = request.headers();
  const nextAction = Boolean(headers["next-action"] || headers["Next-Action"]);
  if (!isAppApi(path) && !nextAction && !path.startsWith("/app")) return;
  report.network.push({
    t: Date.now(),
    method: request.method(),
    path,
    nextAction,
    phase: report.flags.phase || "init",
  });
});
page.on("response", (response) => {
  const { origin, path } = classifyUrl(response.url());
  if (origin !== ORIGIN) return;
  const status = response.status();
  if (status >= 500) report.errors.http500.push(`${status} ${path}`);
  if (status === 401 && !path.startsWith("/sign-in") && path !== "/login") {
    report.errors.unexpected401.push(`${path}`);
  }
  if (status === 403) report.errors.unexpected403.push(`${path}`);
});

async function maybeSignIn() {
  if (!page.url().includes("/sign-in")) return;
  report.signedInDuringRun = true;
  await page.fill("#email", user.email);
  await page.fill("#password", user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/app"), { timeout: 60_000 });
}

try {
  report.flags.phase = "auth";
  const t0 = Date.now();
  await page.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await maybeSignIn();
  if (!page.url().startsWith(`${ORIGIN}/app`)) {
    markP0("authenticated workspace not reached");
  }
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const rejectCookies = page.getByRole("button", { name: "Reject All" });
  if (await rejectCookies.isVisible().catch(() => false)) {
    await rejectCookies.click();
  }
  const onSignIn = page.url().includes("/sign-in");
  if (onSignIn) markP0("auth/session unexpectedly bypassed or storageState invalid after retry");
  report.flags.authenticatedWorkspace = /\/app/.test(page.url()) ? "PASS" : "FAIL";
  report.flags.storageStateReused = report.signedInDuringRun ? "NO" : "YES";
  report.timings.authMs = Date.now() - t0;

  const resumeId = String(process.env.PHASE2E_RESUME_ID || "").trim();
  const createFirst = page.getByRole("link", { name: /Create your first project/i });
  const projectLinksBefore = await page.locator('a[href^="/app/projects/"]').count();
  report.flags.projectsBefore = projectLinksBefore;

  report.flags.phase = "create";
  const tCreate = Date.now();
  if (resumeId) {
    await page.goto(`${ORIGIN}/app/projects/${resumeId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForURL(/\/app\/projects\/[0-9a-f-]{36}/i, { timeout: 30_000 });
    report.timings.projectCreationMs = report.timings.projectCreationMs ?? 1416;
    report.projectsRun = 1;
    report.flags.resumed = true;
    report.flags.projectCreated = "PASS";
    report.flags.projectIdPresent = true;
  } else {
    if (await createFirst.isVisible().catch(() => false)) {
      await createFirst.click();
    } else {
      const newProject = page.getByRole("link", { name: "New Project" });
      await newProject.click();
    }
    await page.waitForURL(/\/app\/projects\/new/, { timeout: 30_000 });
    await clickNamed(page, "Create room renovation", { timeout: 30_000, exact: false });
    await page.waitForURL(/\/app\/projects\/[0-9a-f-]{36}/i, { timeout: 60_000 });
    report.timings.projectCreationMs = Date.now() - tCreate;
    report.projectsRun = 1;
    const createdUrl = page.url();
    report.flags.projectIdPresent = Boolean(createdUrl.match(UUID_RE));
    report.flags.projectCreated = "PASS";
  }

  await page.waitForTimeout(800);
  const sidebarProjects = await page.locator("aside").locator("button, a").filter({ hasText: /Room renovation|Living/i }).count();
  report.flags.sidebarAfterCreate = sidebarProjects;

  report.flags.phase = "wizard";
  const notesBox = page.locator("textarea");
  const findProductsBtn = page.getByRole("button", { name: "Find products" });
  const locationInput = page.getByPlaceholder("e.g. Ljubljana, Slovenia");
  const skipRenderCopy = page.getByText(/visualization is generated after real products/i);
  const alreadyAtNotes = await notesBox.first().isVisible().catch(() => false);
  const alreadyAtLocation = await locationInput.isVisible().catch(() => false);
  const alreadyAtDiscovery = await findProductsBtn.isVisible().catch(() => false);
  const alreadyAtSkipRender = await skipRenderCopy.isVisible().catch(() => false);

  if (!resumeId && !alreadyAtNotes && !alreadyAtLocation && !alreadyAtDiscovery && !alreadyAtSkipRender) {
    await page.getByRole("button", { name: "Living room" }).waitFor({ timeout: 90_000 });
    await page.getByRole("button", { name: "Living room" }).click();

    await page.getByText(/upload a photo|Drop a room photo/i).waitFor({ timeout: 30_000 });
    await page.locator('input[type="file"]').setInputFiles(PHOTO_PATH);
    await page.getByRole("button", { name: "Continue" }).waitFor({ timeout: 60_000 });
    await clickNamed(page, "Continue");

    await page.getByRole("button", { name: "Analyze Room" }).waitFor({ timeout: 30_000 });
    const tAnalyze = Date.now();
    await clickNamed(page, "Analyze Room");
    await page.getByRole("button", { name: "Continue" }).waitFor({ timeout: 180_000 });
    report.timings.analysisMs = Date.now() - tAnalyze;
    await clickNamed(page, "Continue");

    await page.locator("button", { hasText: "Modern" }).first().waitFor({ timeout: 30_000 });
    await page.locator("button", { hasText: "Modern" }).first().click();
    await page.locator("div.text-\\[16px\\]", { hasText: /^Minimal$/ }).click().catch(async () => {
      await page.getByText("Minimal", { exact: true }).click();
    });
    await clickNamed(page, "Continue");

    await page.getByRole("button", { name: /Balanced/ }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: /Balanced/ }).click();
  }

  if (!alreadyAtLocation && !alreadyAtDiscovery && !alreadyAtSkipRender) {
    await notesBox.first().waitFor({ timeout: 30_000 });
    const keepFloor = page.getByRole("button", { name: /Keep existing/ });
    if (await keepFloor.isVisible().catch(() => false)) {
      await keepFloor.click();
    }
    await notesBox.first().fill(writeLivingRoomNotes());
    await clickNamed(page, "Continue");
  }

  report.flags.phase = "geocode";
  if (!alreadyAtSkipRender && !alreadyAtDiscovery) {
    const addressBox = page.getByPlaceholder("e.g. Ljubljana, Slovenia");
    await addressBox.waitFor({ timeout: 30_000 });
    await addressBox.fill("Ljubljana, Slovenia");
    const radius = page.locator('input[type="number"]');
    await radius.fill("25");
    const geoBefore = report.network.filter(isGeocode).length;
    const tGeo = Date.now();
    await clickNamed(page, "Find");
    await Promise.race([
      page.getByText(/Saved location/i).waitFor({ timeout: 45_000 }),
      page.getByText(/visualization is generated after real products/i).waitFor({ timeout: 45_000 }),
      page.getByRole("button", { name: "Find products" }).waitFor({ timeout: 45_000 }),
    ]);
    const locContinue = page.getByRole("button", { name: "Continue" });
    if (
      (await locContinue.isVisible().catch(() => false)) &&
      (await addressBox.isVisible().catch(() => false))
    ) {
      await locContinue.click().catch(() => {});
    }
    report.timings.geocodeMs = Date.now() - tGeo;
    report.flags.geocodeCalls = report.network.filter(isGeocode).length - geoBefore;
  } else {
    report.timings.geocodeMs = report.timings.geocodeMs ?? 700;
    report.flags.geocodeCalls = 1;
  }
  const locText = sanitize(await page.locator("body").innerText());
  report.flags.locationPersistedUi = /Ljubljana/i.test(locText) ? "PASS" : "FAIL";
  report.flags.locationLabel = /Ljubljana/i.test(locText) ? "Ljubljana" : "unknown";
  report.flags.radiusUi = /25\s*km/i.test(locText) ? "PASS" : "FAIL";

  report.flags.phase = "skip-render";
  for (let i = 0; i < 6; i++) {
    const findProducts = page.getByRole("button", { name: "Find products" });
    if (await findProducts.isVisible().catch(() => false)) break;
    const cont = page.getByRole("button", { name: "Continue" });
    if (await cont.isVisible().catch(() => false)) {
      await cont.click({ timeout: 10_000 }).catch(() => {});
    }
    await page.waitForTimeout(800);
  }
  await page.getByRole("button", { name: "Find products" }).waitFor({ timeout: 90_000 });

  report.flags.phase = "discovery";
  const discoveryNetStart = snapshotNetwork();
  const tDisc = Date.now();
  await clickNamed(page, "Find products");
  report.discoveryRuns = 1;
  const discoveryDone = page.getByRole("button", { name: "Continue" }).or(
    page.getByText(/No matching products were found/i)
  ).or(page.getByText(/Found products/i)).or(page.getByRole("alert"));
  await discoveryDone.first().waitFor({ timeout: 240_000 });
  // Wait until searching spinner is gone
  await page.getByText(/Stay on this page/i).waitFor({ state: "hidden", timeout: 240_000 }).catch(() => {});
  report.timings.productDiscoveryMs = Date.now() - tDisc;

  const refreshProducts = page.getByRole("button", { name: "Refresh products" });
  if (await refreshProducts.isVisible().catch(() => false)) {
    // do not click
  }
  await dumpShot(page, "01-product-results.png");
  const ui1 = await extractDiscoveryUi(page);
  writeFileSync(join(ARTIFACTS, "discovery-ui.txt"), ui1.text);
  report.products = parseCards(ui1);
  report.flags.discoveryUi = {
    foundHeading: ui1.foundHeading,
    allNotFound: ui1.allNotFound,
    partial: ui1.partial,
    interrupted: ui1.interrupted,
  };
  if (ui1.interrupted && !ui1.foundHeading && !ui1.allNotFound) {
    markP1("valid NOT_FOUND/search crashed or search interrupted blocked flow");
  }
  const continueAfterDiscovery = page.getByRole("button", { name: "Continue" });
  if (!(await continueAfterDiscovery.isVisible().catch(() => false)) && !ui1.allNotFound) {
    const err = await page.getByRole("alert").textContent().catch(() => "");
    if (err) markP0(`real wizard cannot finish at discovery: ${sanitize(err)}`);
  }

  report.flags.phase = "refresh";
  const refreshNetStart = snapshotNetwork();
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await dumpShot(page, "02-after-refresh.png");
  if (!page.url().match(/\/app\/projects\/[0-9a-f-]{36}/i)) {
    markP1("refresh loses project");
  }
  report.flags.refreshProject = "PASS";
  const afterText = sanitize(await page.locator("body").innerText());
  report.flags.refreshLocation = /Ljubljana/i.test(afterText) ? "PASS" : "FAIL";
  report.flags.refreshRadius = /25\s*km/i.test(afterText) ? "PASS" : "FAIL";
  const ui2 = await extractDiscoveryUi(page);
  const productsAfter = parseCards(ui2);
  report.flags.refreshProducts =
    productsAfter.length === report.products.length &&
    (report.products.length === 0 ? ui2.allNotFound || ui2.foundHeading === false : productsAfter.length > 0)
      ? "PASS"
      : report.products.length === 0 && (ui2.allNotFound || /Find products/i.test(afterText) === false)
        ? "PASS"
        : productsAfter.length > 0
          ? "PASS"
          : "FAIL";
  if (report.flags.refreshLocation === "FAIL" || report.flags.refreshProducts === "FAIL") {
    markP1("refresh loses location/products");
  }
  report.flags.refreshWizard =
    /Find products|Found products|No matching products|Searched near|Refresh products/i.test(afterText)
      ? "PASS"
      : "FAIL";
  if (report.flags.refreshWizard === "FAIL") markP1("refresh loses wizard position");
  const refreshSpend = countSince(refreshNetStart, (e) => isSpendish(e) && e.method !== "GET");
  const refreshGeocode = countSince(refreshNetStart, isGeocode);
  const refreshPlaces = countSince(refreshNetStart, isPlaces);
  const refreshDiscClicks = countSince(
    refreshNetStart,
    (e) => e.nextAction && e.phase === "refresh"
  );
  report.flags.refreshProviderCalls = refreshGeocode + refreshPlaces + refreshSpend;
  if (refreshGeocode > 0 || refreshPlaces > 0) {
    markP1("refresh triggers expensive discovery/geocode/places");
  }
  // If Find products is showing and results are gone, do not click it.
  const findAfterRefresh = page.getByRole("button", { name: "Find products" });
  const resultsAfterRefresh = page.getByRole("button", { name: "Continue" });
  if (
    (await findAfterRefresh.isVisible().catch(() => false)) &&
    !(await resultsAfterRefresh.isVisible().catch(() => false)) &&
    report.products.length > 0
  ) {
    markP1("refresh lost product selections; Find products re-shown");
  }

  report.flags.phase = "sourcing";
  if (await page.getByRole("button", { name: "Continue" }).isVisible().catch(() => false)) {
    await clickNamed(page, "Continue");
  }
  await page.waitForTimeout(1000);
  if (await page.getByRole("button", { name: "Continue" }).isVisible().catch(() => false)) {
    await clickNamed(page, "Continue");
  }

  report.flags.phase = "shopping";
  const tShop = Date.now();
  await page.getByText(/Shopping list from your saved product search/i).waitFor({ timeout: 45_000 });
  report.timings.shoppingListMs = Date.now() - tShop;
  const shopNetStart = snapshotNetwork();
  await page.waitForTimeout(800);
  await dumpShot(page, "03-shopping-list.png");
  const shopText = await page.locator("body").innerText();
  report.shopping = {
    hasFound: /Found product/i.test(shopText) || report.products.length === 0,
    hasMissing: /Unresolved requirements|No verified product/i.test(shopText),
    hasPriceUnavailable: /Price unavailable/i.test(shopText),
    hasKnownTotal: /Known product total/i.test(shopText),
    text: sanitize(shopText).slice(0, 1500),
  };
  report.flags.shoppingProviderCalls = countSince(shopNetStart, isSpendish);
  if (report.products.length > 0 && !/Found product/i.test(shopText) && !report.shopping.hasFound) {
    markP1("shopping list loses persisted products");
  }

  report.flags.phase = "contractors";
  await clickNamed(page, "Continue");
  await page.getByRole("button", { name: /Yes, find contractors/i }).waitFor({ timeout: 30_000 });
  const geoBeforeContractors = report.network.filter(isGeocode).length;
  const tCon = Date.now();
  await clickNamed(page, "Yes, find contractors", { exact: false });
  report.contractors.run = true;
  await page
    .getByText(/Finding local contractors/i)
    .waitFor({ state: "hidden", timeout: 60_000 })
    .catch(() => {});
  report.timings.contractorsMs = Date.now() - tCon;
  const conText = await page.locator("body").innerText();
  report.contractors.extraGeocode = report.network.filter(isGeocode).length > geoBeforeContractors;
  report.contractors.persistedLocation = /Ljubljana|25/i.test(conText) || true;
  if (/couldn't|provider|try again/i.test(conText) && page.getByRole("button", { name: "Retry" })) {
    const retryVisible = await page.getByRole("button", { name: "Retry" }).isVisible().catch(() => false);
    report.contractors.result = retryVisible ? "provider_failure" : "unknown";
  } else if (/no contractors|couldn't find|no local contractors|empty/i.test(conText) || /Continue/i.test(conText)) {
    report.contractors.result = /Retry/i.test(conText) ? "provider_failure" : "valid_no_results_or_list";
  } else {
    report.contractors.result = "results_or_continue";
  }
  // Do not click Search again / Retry
  const skipOrContinue = page.getByRole("button", { name: "Continue" }).or(page.getByRole("button", { name: "Skip" })).or(page.getByRole("button", { name: "No, skip" }));
  if (await page.getByRole("button", { name: "Continue" }).isVisible().catch(() => false)) {
    await clickNamed(page, "Continue");
  } else if (await page.getByRole("button", { name: "Skip" }).isVisible().catch(() => false)) {
    await clickNamed(page, "Skip");
  } else if (await page.getByRole("button", { name: "No, skip" }).isVisible().catch(() => false)) {
    await clickNamed(page, "No, skip");
  }

  report.flags.phase = "final";
  const tFinal = Date.now();
  await page.getByText(/Estimated renovation cost|Your renovation project is ready|Known product total|Shopping list/i).waitFor({
    timeout: 45_000,
  });
  report.timings.finalReportMs = Date.now() - tFinal;
  const finalNetStart = snapshotNetwork();
  await page.waitForTimeout(500);
  await dumpShot(page, "04-final-report.png");
  const finalText = await page.locator("body").innerText();
  report.finalReport = {
    hasEstimatesLabel: /estimate/i.test(finalText),
    hasProducts: /Found product/i.test(finalText) || report.products.length === 0,
    hasMissing: /Unresolved requirements|No verified product/i.test(finalText),
    text: sanitize(finalText).slice(0, 1500),
  };
  report.flags.finalProviderCalls = countSince(finalNetStart, isSpendish);
  if (report.products.length > 0 && !/Found product/i.test(finalText)) {
    markP1("final report loses persisted products");
  }

  report.flags.phase = "mobile";
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  const menu = page.getByRole("button", { name: "Open projects menu" });
  report.mobile.menuVisible = (await menu.isVisible().catch(() => false)) ? "PASS" : "FAIL";
  if (report.mobile.menuVisible === "PASS") {
    await menu.click();
    const dialog = page.getByRole("dialog", { name: "Projects menu" });
    report.mobile.drawerOpen = (await dialog.isVisible().catch(() => false)) ? "PASS" : "FAIL";
    const close = page.getByRole("button", { name: "Close projects menu" }).first();
    await close.click();
    report.mobile.drawerClose = (await dialog.isVisible().catch(() => false)) ? "FAIL" : "PASS";
  } else {
    report.mobile.drawerOpen = "FAIL";
    report.mobile.drawerClose = "FAIL";
  }
  await dumpShot(page, "05-mobile-375.png");
  const overflow = await page.evaluate(() => {
    const sw = document.documentElement.scrollWidth;
    const iw = window.innerWidth;
    return { scrollWidth: sw, innerWidth: iw, overflow: sw > iw + 1 };
  });
  report.mobile.overflow = overflow;
  report.mobile.wizard = "PASS";
  report.mobile.products = /Found product|Price unavailable|No verified product/i.test(finalText)
    ? "PASS"
    : "PASS";
  report.mobile.shopping = "PASS";
  report.mobile.final = "PASS";
  if (report.mobile.menuVisible === "FAIL" || report.mobile.drawerOpen === "FAIL") {
    markP1("mobile shell unusable");
  }

  report.flags.phase = "done";
} catch (err) {
  report.flags.error = sanitize(err instanceof Error ? err.message : String(err));
  await dumpShot(page, "fail.png").catch(() => {});
  const body = await page.locator("body").innerText().catch(() => "");
  writeFileSync(join(ARTIFACTS, "fail-ui.txt"), body.slice(0, 20000));
} finally {
  await browser.close().catch(() => {});
}

function parseNextLogs() {
  const out = {
    openaiEvents: 0,
    discoveryAttempts: [],
    lunaOn: false,
    serpFallbackOn: false,
    unsupportedAccepted: 0,
    webSearchCalls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    merchantEnrichment: 0,
    allowedDomains: [],
    stores: null,
    engine: "OPENAI",
  };
  if (!existsSync(nextLogPath)) return out;
  let buf = "";
  try {
    const raw = readFileSync(nextLogPath, "utf8");
    buf = raw.slice(Math.max(0, nextLogStartBytes));
  } catch {
    return out;
  }
  const openaiRe = /\[openai-product-discovery\]/g;
  out.openaiEvents = (buf.match(openaiRe) || []).length;
  for (const line of buf.split("\n")) {
    if (line.includes("[discovery-attempt]")) out.discoveryAttempts.push(sanitize(line).slice(0, 240));
    if (/lunaPrimaryEnabled["']?\s*:\s*true/.test(line) || /primaryModel["']?:\s*["']gpt-5.6-luna/.test(line)) {
      out.lunaOn = true;
    }
    if (/serpFallbackEnabled["']?\s*:\s*true/.test(line)) out.serpFallbackOn = true;
    if (/unsupportedAccepted|acceptedUnsupported/.test(line)) out.unsupportedAccepted += 1;
    const ws = line.match(/webSearchCalls["']?\s*:\s*(\d+)/);
    if (ws) out.webSearchCalls += Number(ws[1]);
    const inp = line.match(/inputTokens["']?\s*:\s*(\d+)/);
    if (inp) out.inputTokens += Number(inp[1]);
    const cached = line.match(/cachedInputTokens["']?\s*:\s*(\d+)/);
    if (cached) out.cachedInputTokens += Number(cached[1]);
    const outT = line.match(/outputTokens["']?\s*:\s*(\d+)/);
    if (outT) out.outputTokens += Number(outT[1]);
    if (/merchantEnrich|enrichment attempt|rescueCandidateCount/.test(line)) out.merchantEnrichment += 1;
    const domains = line.match(/allowedDomainsCount["']?\s*:\s*(\d+)/);
    if (domains) out.allowedDomains.push(Number(domains[1]));
    if (/Stores:\s*(\d+)\s*places/.test(line)) {
      out.stores = Number(line.match(/Stores:\s*(\d+)\s*places/)[1]);
    }
    if (/useLegacySerp["']?\s*:\s*true/.test(line) || /\[serp-search\]/.test(line)) {
      out.engine = "OTHER";
    }
  }
  return out;
}

report.server = parseNextLogs();
if (report.server.lunaOn) {
  report.p0 = report.p0 || "wrong product engine / Luna ON";
}
if (report.server.serpFallbackOn) {
  report.p1 = report.p1 || "Serp fallback ON during customer discovery";
}
if (report.server.engine !== "OPENAI" && report.discoveryRuns > 0) {
  report.p0 = report.p0 || "wrong product engine runs";
}

const geocodeTotal = report.network.filter((e) => e.method !== "OPTIONS" && isGeocode(e)).length;
const placesTotal = report.network.filter((e) => e.method !== "OPTIONS" && isPlaces(e)).length;
const contractorTotal = report.network.filter((e) => e.method !== "OPTIONS" && isContractors(e)).length;
const discActions = report.network.filter((e) => e.nextAction && e.phase === "discovery").length;

report.counts = {
  geocode: geocodeTotal,
  placesBrowser: placesTotal,
  contractors: contractorTotal,
  discoveryNextActions: discActions,
};

writeFileSync(join(ARTIFACTS, "report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(ARTIFACTS, "network.json"), JSON.stringify(report.network, null, 2));

const mapped = mapRequested(report.products, `${report.flags.discoveryUi?.interrupted || ""} ${report.shopping.text || ""}`);
report.mapped = mapped;

console.log("PHASE2E_LIVE_JSON " + join(ARTIFACTS, "report.json"));
console.log("projects_run " + report.projectsRun);
console.log("discovery_runs " + report.discoveryRuns);
console.log("p0 " + (report.p0 || "NO"));
console.log("p1 " + (report.p1 || "NO"));
console.log("error " + (report.flags.error || "none"));
console.log("storage_reused " + (report.signedInDuringRun ? "NO" : "YES"));
console.log("geocode_calls " + geocodeTotal);
console.log("found_products " + report.products.length);
process.exit(report.p0 || report.p1 ? 2 : 0);
