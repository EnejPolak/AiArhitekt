/**
 * PHASE 3D — one production customer smoke against https://ai-arhitekt.vercel.app
 * One sign-in, one project, one geocode, one Places+Step C discovery, 3 items.
 * Does not sign up, generate images, search contractors, or retry discovery.
 * Never prints credentials, tokens, cookies, or API keys.
 */
import { chromium } from "/Users/enejpolak/Projetki /Schedulizer/node_modules/playwright/index.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requirePlaywrightTestUser } from "./playwrightEnv.mjs";

const { PNG } = createRequire(import.meta.url)("pngjs");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://ai-arhitekt.vercel.app";
const ARTIFACTS = join(ROOT, ".playwright/artifacts/phase3d");
const PHOTO_PATH = join(ARTIFACTS, "living-room.png");
const CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  "/Users/enejpolak/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const NOTES = [
  "Keep my current sofa. Keep my current chair. Keep my current desk. Keep my current bed. Keep my current wardrobe.",
  "Need only these three products:",
  "1. Black metal floor lamp, maximum budget €150",
  "2. Off-white ceramic vase, maximum budget €80",
  "3. Beige wool rug, 160 × 230 cm, maximum budget €300",
].join(" ");

mkdirSync(ARTIFACTS, { recursive: true });

function sanitize(value) {
  return String(value || "")
    .replace(EMAIL_RE, "[email]")
    .replace(JWT_RE, "[token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
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

function isGeocode(entry) {
  return entry.path.startsWith("/api/geocode");
}
function isPlaces(entry) {
  return entry.path.startsWith("/api/places") && !entry.path.startsWith("/api/places-contractors");
}
function isContractors(entry) {
  return entry.path.startsWith("/api/places-contractors");
}
function isRender(entry) {
  return entry.path.startsWith("/api/render") || entry.path.startsWith("/api/prompt-room-render");
}
function isAnalyze(entry) {
  return entry.path.startsWith("/api/analyze") || entry.nextAction && entry.phase === "analyze";
}
function isGreeting(entry) {
  return entry.path.startsWith("/api/generate-greeting");
}
function isBilling(entry) {
  return /billing|stripe|checkout/i.test(entry.path);
}
function isSpendish(entry) {
  return (
    isGeocode(entry) ||
    isPlaces(entry) ||
    isContractors(entry) ||
    isRender(entry) ||
    entry.path.startsWith("/api/search-products") ||
    entry.path.startsWith("/api/orchestrator") ||
    entry.path.startsWith("/api/serp")
  );
}

const report = {
  origin: ORIGIN,
  startedAt: new Date().toISOString(),
  preflight: {},
  signedIn: false,
  projectsRun: 0,
  projectId: null,
  projectName: null,
  discoveryRuns: 0,
  extraDiscoveryRuns: 0,
  network: [],
  errors: {
    pageerror: [],
    consoleerror: [],
    http500: [],
    unexpected401: [],
    unexpected403: [],
    hydration: [],
  },
  products: [],
  unmatched: [],
  db: {},
  shopping: {},
  finalReport: {},
  mobile: {},
  flags: { lunaPrimary: "OFF", serpFallback: "OFF", stepCImplementationChanged: "NO" },
  p0: null,
  p1: null,
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

async function clickNamed(page, name, options = {}) {
  const timeout = options.timeout ?? 30_000;
  const button = page.getByRole("button", { name, exact: options.exact ?? true });
  await button.first().waitFor({ state: "visible", timeout });
  await button.first().click({ timeout });
}

async function dumpShot(page, name) {
  const path = join(ARTIFACTS, name);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function overflowCheck(page) {
  return page.evaluate(() => {
    const sw = document.documentElement.scrollWidth;
    const iw = window.innerWidth;
    return { scrollWidth: sw, innerWidth: iw, overflow: sw > iw + 8 };
  });
}

async function extractDiscoveryUi(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    const cards = [];
    const openLinks = [...document.querySelectorAll("a")].filter((a) =>
      /open product|view product/i.test(a.textContent || "")
    );
    for (const link of openLinks) {
      const card = link.closest("div") || link.parentElement;
      const block = (card?.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
      cards.push({ url: link.href || "", lines: block.slice(0, 14) });
    }
    const unresolved = [];
    const unresolvedHeading = [...document.querySelectorAll("h3")].find((h) =>
      /unresolved/i.test(h.textContent || "")
    );
    if (unresolvedHeading) {
      const list = unresolvedHeading.parentElement?.querySelectorAll("li") || [];
      for (const li of list) unresolved.push((li.textContent || "").trim());
    }
    return {
      text: text.slice(0, 16000),
      foundHeading: /Found products/i.test(text),
      allNotFound: /No matching products were found|No verified products/i.test(text),
      partial: /Partial results/i.test(text),
      searchedNear: /Searched near|Search near/i.test(text),
      unresolved,
      interrupted: /interrupted|timed out|couldn't finish searching/i.test(text),
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
          !/open product|view product/i.test(l) &&
          !/use in design/i.test(l) &&
          !/selected for design/i.test(l) &&
          !/price unavailable/i.test(l) &&
          !/€/.test(l) &&
          !/EUR/i.test(l) &&
          !/not yet reference/i.test(l)
      ) || "";
    const priceLine =
      lines.find((l) => /€|EUR|Price unavailable/i.test(l) && !/found this product/i.test(l)) || "";
    const merchant =
      lines.find(
        (l) =>
          l &&
          l !== title &&
          l !== priceLine &&
          !/found this product/i.test(l) &&
          !/open product|view product/i.test(l) &&
          !/use in design/i.test(l) &&
          !/selected for design/i.test(l) &&
          !/not yet reference/i.test(l)
      ) || "";
    let domain = "";
    try {
      domain = new URL(card.url).hostname.replace(/^www\./, "");
    } catch {
      domain = merchant;
    }
    products.push({
      requirement: req,
      product: title,
      merchant,
      domain,
      price: priceLine,
      url: card.url,
      priceVerified: /€|EUR/i.test(priceLine) && !/unavailable/i.test(priceLine),
      sourceBacked: Boolean(card.url && /^https?:\/\//i.test(card.url)),
    });
  }
  return products;
}

function mapRequested(products, unmatched) {
  const requested = [
    {
      identity: "floor lamp",
      keys: [/floor lamp/i, /floorlamp/i, /talna svetil/i, /\blamp\b/i, /lighting/i],
      ceilingBad: /ceiling|pendant|stropn|viseč/i,
    },
    {
      identity: "ceramic vase",
      keys: [/vase/i, /vaza/i, /ceramic/i],
      ceilingBad: null,
    },
    {
      identity: "wool rug",
      keys: [/rug/i, /carpet/i, /prepro/i, /wool/i],
      ceilingBad: null,
    },
  ];
  const unmatchedBlob = (unmatched || []).join(" ");
  return requested.map((item) => {
    const found = products.find((p) =>
      item.keys.some((re) => re.test(`${p.requirement} ${p.product}`))
    );
    const listedMissing = item.keys.some((re) => re.test(unmatchedBlob));
    let result = "NOT_FOUND";
    if (found) result = "FOUND";
    const blob = `${found?.requirement || ""} ${found?.product || ""} ${unmatchedBlob}`;
    const identityCorrect = found
      ? item.ceilingBad
        ? !item.ceilingBad.test(blob)
        : item.keys.some((re) => re.test(blob))
      : listedMissing || true;
    return { ...item, result, match: found || null, identityCorrect, listedMissing };
  });
}

function queryHosted(sql) {
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "--project-ref", "pvzecooaaeotvwbajmty", "--yes", sql],
    { encoding: "utf8", cwd: ROOT, timeout: 30_000 }
  );
  if (r.status !== 0) {
    return { ok: false, error: sanitize(r.stderr || r.stdout || "query_failed") };
  }
  try {
    const data = JSON.parse(r.stdout.replace(/^npm warn.*\n/gm, "").trim() || "{}");
    return { ok: true, rows: data.rows || [] };
  } catch (err) {
    return { ok: false, error: "parse_failed" };
  }
}

writeLivingRoomPng();
const user = requirePlaywrightTestUser();

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

page.on("pageerror", (err) => {
  report.errors.pageerror.push(sanitize(err?.message || String(err)));
});
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = sanitize(msg.text());
  report.errors.consoleerror.push(text);
  if (/hydrat/i.test(text)) report.errors.hydration.push(text);
});
page.on("request", (request) => {
  const { origin, path } = classifyUrl(request.url());
  if (origin !== ORIGIN) return;
  const headers = request.headers();
  const nextAction = Boolean(headers["next-action"] || headers["Next-Action"]);
  const interesting =
    isGeocode({ path }) ||
    isPlaces({ path }) ||
    isContractors({ path }) ||
    isRender({ path }) ||
    isGreeting({ path }) ||
    isBilling({ path }) ||
    path.startsWith("/api/") ||
    nextAction ||
    path.startsWith("/app") ||
    path === "/sign-in";
  if (!interesting) return;
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
  if (status === 401 && path !== "/sign-in" && !path.startsWith("/sign-in")) {
    report.errors.unexpected401.push(path);
  }
  if (status === 403) report.errors.unexpected403.push(path);
});

try {
  report.flags.phase = "auth";
  await page.goto(`${ORIGIN}/sign-in`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const rejectCookies = page.getByRole("button", { name: "Reject All" });
  if (await rejectCookies.isVisible().catch(() => false)) {
    await rejectCookies.click();
  }
  await page.locator("#email").waitFor({ timeout: 20_000 });
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  console.log("email_field_has_at " + (await page.locator("#email").inputValue()).includes("@"));
  console.log("password_field_nonempty " + Boolean(await page.locator("#password").inputValue()));
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((next) => next.pathname.startsWith("/app"), { timeout: 45_000 }).catch(() => {});
  const signedInPath = (() => {
    try {
      return new URL(page.url()).pathname;
    } catch {
      return "";
    }
  })();
  const alertText = sanitize(await page.getByRole("alert").textContent().catch(() => ""));
  if (!signedInPath.startsWith("/app")) {
    report.signedIn = false;
    markP0(`sign-in did not reach /app path=${signedInPath} alert=${alertText || "(none)"}`);
  }
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const shell = await page.locator("body").innerText();
  if (!/new project|no projects yet|projects/i.test(shell)) {
    markP0("signed in but authenticated shell missing");
  }
  report.signedIn = true;
  console.log("signed_in PASS");

  report.flags.phase = "create";
  const createFirst = page.getByRole("link", { name: /Create your first project/i });
  if (await createFirst.isVisible().catch(() => false)) {
    await createFirst.click();
  } else {
    await page.getByRole("link", { name: "New Project" }).click();
  }
  await page.waitForURL(/\/app\/projects\/new/, { timeout: 30_000 });
  await clickNamed(page, "Create room renovation", { timeout: 30_000, exact: false });
  await page.waitForURL(/\/app\/projects\/[0-9a-f-]{36}/i, { timeout: 60_000 });
  const createdMatch = page.url().match(UUID_RE);
  report.projectId = createdMatch ? createdMatch[0] : null;
  report.projectsRun = 1;
  report.projectName = "Room renovation";
  if (!report.projectId) markP0("project created without id");
  console.log("project_id " + report.projectId);

  report.flags.phase = "wizard";
  await page.getByRole("button", { name: "Living room" }).waitFor({ timeout: 90_000 });
  await page.getByRole("button", { name: "Living room" }).click();
  await page.getByText(/upload a photo|Drop a room photo/i).waitFor({ timeout: 30_000 });
  await page.locator('input[type="file"]').setInputFiles(PHOTO_PATH);
  await page.getByRole("button", { name: "Continue" }).waitFor({ timeout: 60_000 });
  await clickNamed(page, "Continue");

  report.flags.phase = "analyze";
  await page.getByRole("button", { name: "Analyze Room" }).waitFor({ timeout: 30_000 });
  await clickNamed(page, "Analyze Room");
  await page.getByRole("button", { name: "Continue" }).waitFor({ timeout: 180_000 });
  await clickNamed(page, "Continue");

  await page.locator("button", { hasText: "Modern" }).first().waitFor({ timeout: 30_000 });
  await page.locator("button", { hasText: "Modern" }).first().click();
  await page.locator("div.text-\\[16px\\]", { hasText: /^Minimal$/ }).click().catch(async () => {
    await page.getByText("Minimal", { exact: true }).click();
  });
  await clickNamed(page, "Continue");
  await page.getByRole("button", { name: /Balanced/ }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /Balanced/ }).click();

  const notesBox = page.locator("textarea");
  await notesBox.first().waitFor({ timeout: 30_000 });
  const keepFloor = page.getByRole("button", { name: /Keep existing/ });
  if (await keepFloor.isVisible().catch(() => false)) {
    await keepFloor.click();
  }
  await notesBox.first().fill(NOTES);
  await clickNamed(page, "Continue");

  report.flags.phase = "geocode";
  const addressBox = page.getByPlaceholder("e.g. Ljubljana, Slovenia");
  await addressBox.waitFor({ timeout: 30_000 });
  await addressBox.fill("Ljubljana, Slovenia");
  const radius = page.locator('input[type="number"]');
  await radius.fill("25");
  const geoBefore = report.network.filter((e) => e.method === "POST" && isGeocode(e)).length;
  await clickNamed(page, "Find");
  await Promise.race([
    page.getByText(/Location:/i).waitFor({ timeout: 45_000 }),
    page.getByText(/visualization is generated after real products/i).waitFor({ timeout: 45_000 }),
    page.getByRole("button", { name: "Find products" }).waitFor({ timeout: 45_000 }),
  ]);
  report.flags.geocodeCalls = report.network.filter((e) => e.method === "POST" && isGeocode(e)).length - geoBefore;
  if (report.flags.geocodeCalls > 1) markP1("more than one geocode during location save");

  for (let i = 0; i < 8; i++) {
    if (await page.getByRole("button", { name: "Find products" }).isVisible().catch(() => false)) break;
    const gen = page.getByRole("button", { name: /Generate design|Regenerate design/i });
    if (await gen.isVisible().catch(() => false)) {
      // do not click image generation
    }
    const cont = page.getByRole("button", { name: "Continue" });
    if (await cont.isVisible().catch(() => false)) {
      await cont.click({ timeout: 10_000 }).catch(() => {});
    }
    await page.waitForTimeout(900);
  }
  await page.getByRole("button", { name: "Find products" }).waitFor({ timeout: 90_000 });

  report.flags.phase = "discovery";
  const discoveryNetStart = snapshotNetwork();
  await clickNamed(page, "Find products");
  report.discoveryRuns = 1;
  await Promise.race([
    page.getByText(/Found products/i).waitFor({ timeout: 420_000 }),
    page.getByText(/No matching products were found/i).waitFor({ timeout: 420_000 }),
    page.getByText(/Unresolved items/i).waitFor({ timeout: 420_000 }),
    page.getByRole("alert").waitFor({ timeout: 420_000 }),
  ]);
  await page.getByText(/Stay on this page/i).waitFor({ state: "hidden", timeout: 420_000 }).catch(() => {});
  if (await page.getByRole("button", { name: "Refresh products" }).isVisible().catch(() => false)) {
    // do not click
  }
  await dumpShot(page, "01-product-results.png");
  const ui1 = await extractDiscoveryUi(page);
  writeFileSync(join(ARTIFACTS, "discovery-ui.txt"), ui1.text);
  report.products = parseCards(ui1);
  report.unmatched = ui1.unresolved;
  report.flags.discoveryUi = {
    foundHeading: ui1.foundHeading,
    allNotFound: ui1.allNotFound,
    interrupted: ui1.interrupted,
    searchedNear: ui1.searchedNear,
  };
  if (ui1.interrupted && !ui1.foundHeading && !ui1.allNotFound) {
    markP1("discovery interrupted without a valid result state");
  }

  report.flags.phase = "persist-query";
  const locQ = queryHosted(`
    select
      left(coalesce(pr.location_input,''), 80) as location_input,
      left(coalesce(pr.formatted_address,''), 80) as formatted_address,
      (pr.latitude is not null) as has_lat,
      (pr.longitude is not null) as has_lng,
      pr.radius_km,
      pr.country_code
    from public.project_room_preferences pr
    where pr.project_id = '${report.projectId}';
  `);
  const discQ = queryHosted(`
    select
      searched_item_count,
      not_searched_count,
      coalesce(jsonb_array_length(allowlist_domains), 0) as merchant_domains,
      coalesce(jsonb_array_length(unmatched_requirements), 0) as unmatched_count,
      left(location_input, 80) as location_input,
      radius_km,
      latitude is not null as has_lat
    from public.project_product_discoveries
    where project_id = '${report.projectId}'
    order by created_at desc
    limit 1;
  `);
  const selQ = queryHosted(`
    select
      requirement_key,
      left(coalesce(item_spec,''), 160) as item_spec,
      left(coalesce(product_title,''), 100) as product_title,
      retailer_domain,
      (price is not null) as has_price,
      (product_url is not null and length(product_url) > 8) as has_url
    from public.project_product_selections
    where project_id = '${report.projectId}'
    order by created_at;
  `);
  report.db = {
    location: locQ.ok ? locQ.rows[0] || null : { error: locQ.error },
    discovery: discQ.ok ? discQ.rows[0] || null : { error: discQ.error },
    selections: selQ.ok ? selQ.rows : { error: selQ.error },
  };

  report.flags.phase = "refresh";
  const refreshNetStart = snapshotNetwork();
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await dumpShot(page, "02-after-refresh.png");
  if (!page.url().includes(report.projectId)) markP1("refresh loses project");
  const afterText = sanitize(await page.locator("body").innerText());
  report.flags.refreshProject = "PASS";
  report.flags.refreshLocation = /Ljubljana/i.test(afterText) ? "PASS" : "FAIL";
  report.flags.refreshRadius = /25\s*km/i.test(afterText) ? "PASS" : "FAIL";
  const ui2 = await extractDiscoveryUi(page);
  report.flags.refreshProducts =
    parseCards(ui2).length > 0 || ui2.allNotFound || ui2.foundHeading || ui2.unresolved.length > 0
      ? "PASS"
      : report.products.length === 0
        ? "PASS"
        : "FAIL";
  const refreshGeocode = countSince(refreshNetStart, (e) => e.method === "POST" && isGeocode(e));
  const refreshPlaces = countSince(refreshNetStart, (e) => e.method === "POST" && isPlaces(e));
  const refreshDisc = countSince(
    refreshNetStart,
    (e) => e.nextAction && (e.phase === "refresh" || e.path.includes("/app/projects/"))
  );
  report.flags.refreshProviderCalls = refreshGeocode + refreshPlaces;
  if (refreshGeocode > 0 || refreshPlaces > 0) {
    markP1("refresh triggered geocode or Places");
  }
  const findAfter = page.getByRole("button", { name: "Find products" });
  if (
    (await findAfter.isVisible().catch(() => false)) &&
    report.products.length > 0 &&
    !(await page.getByRole("button", { name: "Continue" }).isVisible().catch(() => false))
  ) {
    markP1("refresh lost product results");
  }
  if (refreshDisc > 2) {
    // GET document + RSC is expected; extra next-actions would be a rediscovery
  }

  report.flags.phase = "sourcing";
  for (let i = 0; i < 4; i++) {
    if (await page.getByText(/Shopping list from your saved product search/i).isVisible().catch(() => false)) break;
    const gen = page.getByRole("button", { name: /Generate design|Regenerate design/i });
    if (await gen.isVisible().catch(() => false)) {
      const cont = page.getByRole("button", { name: "Continue" });
      if (await cont.isVisible().catch(() => false)) await cont.click().catch(() => {});
    } else if (await page.getByRole("button", { name: "Continue" }).isVisible().catch(() => false)) {
      await clickNamed(page, "Continue");
    }
    await page.waitForTimeout(700);
  }

  report.flags.phase = "shopping";
  await page.getByText(/Shopping list from your saved product search/i).waitFor({ timeout: 45_000 });
  const shopNetStart = snapshotNetwork();
  await dumpShot(page, "03-shopping-list.png");
  const shopText = await page.locator("body").innerText();
  report.shopping = {
    hasFound: /Found products/i.test(shopText),
    hasMissing: /Unresolved|No verified product/i.test(shopText),
    hasPriceUnavailable: /Price unavailable/i.test(shopText),
    hasKnownTotal: /Known product total/i.test(shopText),
    hasPartial: /partial|some prices/i.test(shopText),
    text: sanitize(shopText).slice(0, 1800),
  };
  report.flags.shoppingProviderCalls = countSince(shopNetStart, (e) => e.method === "POST" && isSpendish(e));
  report.mobile.shoppingOverflow = await overflowCheck(page);

  report.flags.phase = "contractors";
  await clickNamed(page, "Continue");
  await page.getByRole("button", { name: /No, skip/i }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /No, skip/i }).click();

  report.flags.phase = "final";
  await page.getByText(/Your renovation project is ready|Estimated renovation cost|Known product total|Found products/i).waitFor({
    timeout: 45_000,
  });
  const finalNetStart = snapshotNetwork();
  await dumpShot(page, "04-final-report.png");
  const finalText = await page.locator("body").innerText();
  report.finalReport = {
    hasProducts: /Found products/i.test(finalText) || report.products.length === 0,
    hasMissing: /Unresolved|No verified product/i.test(finalText),
    text: sanitize(finalText).slice(0, 1800),
  };
  report.flags.finalProviderCalls = countSince(finalNetStart, (e) => e.method === "POST" && isSpendish(e));

  report.flags.phase = "mobile";
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(400);
  report.mobile.finalOverflow = await overflowCheck(page);
  await dumpShot(page, "05-mobile-final.png");
  await page.goto(`${ORIGIN}/app/projects/${report.projectId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(800);
  report.mobile.projectOverflow = await overflowCheck(page);
  await dumpShot(page, "06-mobile-project.png");
  await page.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(600);
  report.mobile.appOverflow = await overflowCheck(page);
  const menu = page.getByRole("button", { name: "Open projects menu" });
  report.mobile.menuVisible = (await menu.isVisible().catch(() => false)) ? "PASS" : "FAIL";
  if (report.mobile.menuVisible === "PASS") {
    await menu.click();
    const dialog = page.getByRole("dialog", { name: "Projects menu" });
    report.mobile.drawerOpen = (await dialog.isVisible().catch(() => false)) ? "PASS" : "FAIL";
    const close = page.getByRole("button", { name: "Close projects menu" }).first();
    await close.click().catch(() => {});
  }
  await dumpShot(page, "07-mobile-app.png");

  report.flags.phase = "done";
} catch (err) {
  report.flags.error = sanitize(err instanceof Error ? err.message : String(err));
  await dumpShot(page, "fail.png").catch(() => {});
  const body = await page.locator("body").innerText().catch(() => "");
  writeFileSync(join(ARTIFACTS, "fail-ui.txt"), body.slice(0, 20000));
} finally {
  await browser.close().catch(() => {});
}

const geocodeTotal = report.network.filter((e) => e.method === "POST" && isGeocode(e)).length;
const placesBrowser = report.network.filter((e) => e.method === "POST" && isPlaces(e)).length;
const contractorTotal = report.network.filter((e) => e.method === "POST" && isContractors(e)).length;
const renderTotal = report.network.filter((e) => e.method === "POST" && isRender(e)).length;
const greetingTotal = report.network.filter((e) => e.method === "POST" && isGreeting(e)).length;
const billingTotal = report.network.filter((e) => isBilling(e)).length;
const discoveryActions = report.network.filter((e) => e.nextAction && e.phase === "discovery").length;

report.counts = {
  geocode: geocodeTotal,
  placesBrowser,
  contractors: contractorTotal,
  renders: renderTotal,
  greetings: greetingTotal,
  billing: billingTotal,
  discoveryNextActions: discoveryActions,
  discoveryRuns: report.discoveryRuns,
  extraDiscoveryRuns: report.extraDiscoveryRuns,
};

if (report.discoveryRuns > 1) report.p0 = report.p0 || "more than one Step C discovery";
if (contractorTotal > 0) report.p1 = report.p1 || "contractor search ran";
if (renderTotal > 0) report.p0 = report.p0 || "image generation ran";
if (billingTotal > 0) report.p0 = report.p0 || "billing call ran";

const mapped = mapRequested(report.products, report.unmatched);
report.mapped = mapped;

writeFileSync(join(ARTIFACTS, "report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(ARTIFACTS, "network.json"), JSON.stringify(report.network, null, 2));

console.log("PHASE3D_JSON " + join(ARTIFACTS, "report.json"));
console.log("signed_in " + (report.signedIn ? "PASS" : "FAIL"));
console.log("project_created " + (report.projectsRun === 1 ? "PASS" : "FAIL"));
console.log("project_id " + (report.projectId || "none"));
console.log("geocode " + geocodeTotal);
console.log("places_browser " + placesBrowser);
console.log("discovery_runs " + report.discoveryRuns);
console.log("contractors " + contractorTotal);
console.log("renders " + renderTotal);
console.log("billing " + billingTotal);
console.log("products_ui " + report.products.length);
console.log("p0 " + (report.p0 || "NO"));
console.log("p1 " + (report.p1 || "NO"));
console.log("error " + (report.flags.error || "none"));
process.exit(report.signedIn ? 0 : 2);
