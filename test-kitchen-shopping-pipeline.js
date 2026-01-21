/**
 * ============================================================
 * TEST: Kitchen Vision → SERP → Select → Render (OpenAI-only)
 * ============================================================
 *
 * Goal:
 * - Step A: OpenAI Vision extracts a "shopping list" from a kitchen photo (JSON)
 * - Step B: Build 3–6 query variants per item
 * - Step C: SerpAPI fetch (Google Shopping + fallback organic)
 * - Step D: Score + dedupe → top 3 per item
 * - Step E: LLM selects 1 product per item (JSON)
 * - Step F: OpenAI image edit (gpt-image-1) using:
 *   - image[0] = original room photo
 *   - image[1..] = selected product reference images (chair/table/light)
 *
 * Output:
 * - Prints exact JSON sent to the LLM selection step
 * - Prints final chosen products (real links)
 * - Saves final image to ./public/test-assets/kitchen-openai-render.png (if allowed)
 *
 * Requirements in .env.local:
 * - OPENAI_API_KEY=...
 * - SERPAPI_KEY=...
 *
 * Run:
 *   npm run dev   (optional; not required for this script)
 *   node test-kitchen-shopping-pipeline.js
 */

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// ----------------------------
// Env helpers
// ----------------------------

function readEnvLocal() {
  try {
    return fs.readFileSync(".env.local", "utf-8");
  } catch {
    return "";
  }
}

function getEnvValue(envContent, key) {
  const re = new RegExp(`^${key}=(.+)$`, "m");
  const m = envContent.match(re);
  return m ? m[1].trim() : null;
}

// ----------------------------
// Generic helpers
// ----------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function asDataUrlFromFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function pickFirstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardSimilarity(a, b) {
  const A = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const B = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (A.size === 0 && B.size === 0) return 1;
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : inter / union;
}

// ----------------------------
// Step A — Vision shopping list
// ----------------------------

async function visionShoppingList(openai, imageDataUrl) {
  const system =
    "You are an interior architect. Extract a minimal shopping list from the kitchen photo. " +
    "Return ONLY strict JSON. No prose. " +
    "Keys: room_type (string), style_targets (string[]), items (array), constraints (string[]). " +
    "items elements must include: type (string), count (number). Optional: material, color, shape, legs, size_hint, style. " +
    "Constraints must include geometry/camera preservation and any obvious placement constraints.";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the shopping list JSON from this kitchen photo." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content || "{}";
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Vision did not return valid JSON");
  return parsed;
}

// ----------------------------
// Step B — Query builder
// ----------------------------

function buildQueriesFromItem(item) {
  const type = String(item.type || "").toLowerCase();
  const color = item.color ? String(item.color).toLowerCase() : "";
  const material = item.material ? String(item.material).toLowerCase() : "";
  const shape = item.shape ? String(item.shape).toLowerCase() : "";
  const legs = item.legs ? String(item.legs).toLowerCase() : "";
  const style = item.style ? String(item.style).toLowerCase() : "";
  const sizeHint = item.size_hint ? String(item.size_hint).toLowerCase() : "";

  const baseTokens = [color, material, shape, legs, style, sizeHint].filter(Boolean).join(" ").trim();

  const variants = [];
  if (type.includes("chair")) {
    variants.push(`${color} ${material} dining chair ${legs}`.trim());
    variants.push(`${color} upholstered chair ${legs} modern`.trim());
    variants.push(`${color} velvet dining chair black legs`.trim());
    variants.push(`${color} dining chair curved back black legs`.trim());
  } else if (type.includes("table")) {
    variants.push(`${sizeHint} ${shape} ${material} dining table 2 seater`.trim());
    variants.push(`${sizeHint} ${material} dining table`.trim());
    variants.push(`${shape} ${material} dining table small`.trim());
    variants.push(`small dining table for 2 ${material} ${shape}`.trim());
  } else if (type.includes("light")) {
    variants.push(`${shape} flush mount ceiling light minimal`.trim());
    variants.push(`${shape} ceiling light flush mount modern`.trim());
    variants.push(`minimal round flush mount ceiling light`.trim());
    variants.push(`round ceiling light minimal flushmount`.trim());
  } else {
    variants.push(`${baseTokens} ${type}`.trim());
    variants.push(`${type} ${baseTokens} modern`.trim());
    variants.push(`${type} ${baseTokens} minimalist`.trim());
  }

  // cleanup + unique + 3..6
  const uniq = [...new Set(variants.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))];
  return uniq.slice(0, 6);
}

function keywordsForScoring(item) {
  const out = [];
  for (const k of ["color", "material", "shape", "legs", "style", "size_hint", "type"]) {
    if (item[k]) out.push(String(item[k]).toLowerCase());
  }
  // split compound like "black metal" into tokens too
  return [...new Set(out.flatMap((s) => s.split(/\s+/g)).filter(Boolean))];
}

// ----------------------------
// Step C — SerpAPI
// ----------------------------

async function serpSearch(query, serpApiKey) {
  const params = new URLSearchParams({
    api_key: serpApiKey,
    // Use Google with Shopping vertical, but restrict to Slovenian sites.
    // This is more controllable than google_shopping when we need "SI-only".
    engine: "google",
    google_domain: "google.si",
    tbm: "shop",
    q: `site:.si ${query}`,
    gl: "si",
    hl: "sl",
  });

  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) throw new Error(`SerpAPI failed: ${res.status}`);
  return res.json();
}

async function serpSearchOrganic(query, serpApiKey) {
  const params = new URLSearchParams({
    api_key: serpApiKey,
    engine: "google",
    google_domain: "google.si",
    // SI-only + Slovenian "where to buy"
    q: `site:.si ${query} kje kupiti`,
    gl: "si",
    hl: "sl",
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) throw new Error(`SerpAPI (organic) failed: ${res.status}`);
  return res.json();
}

function isSlovenianShopUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();

    // Primary rule: .si domains only
    if (host.endsWith(".si")) return true;

    // Secondary rule: allow localized SI paths on large vendors (rare, but useful)
    if (path.includes("/si/") || path.includes("/sl-si") || path.includes("/sl_si")) return true;

    return false;
  } catch {
    return false;
  }
}

function normalizeSerp(json) {
  const items = [];

  for (const r of json.shopping_results || []) {
    if (!r.link || !isSlovenianShopUrl(r.link)) continue; // enforce SI-only
    items.push({
      title: r.title || "",
      price: typeof r.extracted_price === "number" ? r.extracted_price : null,
      source: r.source || "",
      domain: r.source ? String(r.source).toLowerCase() : extractDomain(r.link),
      link: r.link || "",
      image: r.thumbnail || r.image || null,
      kind: "shopping",
    });
  }

  for (const r of json.organic_results || []) {
    if (!r.link || !isSlovenianShopUrl(r.link)) continue; // enforce SI-only
    items.push({
      title: r.title || "",
      price: null,
      source: extractDomain(r.link),
      domain: extractDomain(r.link),
      link: r.link || "",
      image: r.thumbnail || null,
      kind: "organic",
    });
  }

  return items;
}

// ----------------------------
// Step D — score + dedupe
// ----------------------------

function scoreProduct(p, keywords) {
  let s = 0;
  const t = normalizeTitle(p.title);
  for (const k of keywords) if (t.includes(k)) s += 2;
  if (p.kind === "shopping") s += 1;
  if (p.price) s += 1;
  if (p.image) s += 1;
  if (!p.link) s -= 5;
  // Hard safety: if somehow non-SI slipped through, nuke it.
  if (!isSlovenianShopUrl(p.link)) s -= 100;
  if (/pinterest|facebook|instagram|tiktok/.test(p.link)) s -= 10;
  if (/blog|wordpress|tumblr/.test(p.link)) s -= 4;
  return s;
}

function dedupeProducts(products) {
  const out = [];
  for (const p of products) {
    const domain = p.domain || extractDomain(p.link);
    const title = p.title || "";
    const existingIdx = out.findIndex((x) => {
      if (domain && x.domain && domain === x.domain) {
        return jaccardSimilarity(title, x.title) >= 0.88;
      }
      return false;
    });
    if (existingIdx === -1) out.push(p);
    else {
      // keep the one with higher score (already pre-scored usually)
      if ((p.score || 0) > (out[existingIdx].score || 0)) out[existingIdx] = p;
    }
  }
  return out;
}

function pickTop(products, keywords, n = 3) {
  const scored = products.map((p) => ({ ...p, score: scoreProduct(p, keywords) }));
  const deduped = dedupeProducts(scored);
  return deduped.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, n);
}

// ----------------------------
// Step E — LLM selection
// ----------------------------

async function selectProducts(openai, args) {
  const system =
    "You are a purchasing assistant for interior design. Pick the BEST matching product for each slot. " +
    "Return ONLY strict JSON. No prose. " +
    "Rules: choose 1 product per slot, must have a real url, prefer items with image and price. " +
    "Never invent URLs. Use only items from the shortlist.";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content:
          "Select 1 product per slot from the provided shortlist.\n\n" +
          JSON.stringify(args, null, 2),
      },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content || "{}";
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Selection did not return valid JSON");
  return parsed;
}

// ----------------------------
// Step F — Render edit with references
// ----------------------------

async function downloadToFile(url, outPath) {
  const res = await fetch(url, {
    headers: {
      // Some CDNs block empty UA
      "user-agent": "Mozilla/5.0 (AI Architect test pipeline)",
      accept: "image/*,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return outPath;
}

async function renderWithProductRefs(openai, args) {
  const images = [
    fs.createReadStream(args.roomImagePath),
    fs.createReadStream(args.chairImagePath),
    fs.createReadStream(args.tableImagePath),
    fs.createReadStream(args.lightImagePath),
  ];

  const prompt =
    "You will receive multiple reference images.\n" +
    "- Image 1 is the ORIGINAL kitchen photo (keep geometry identical).\n" +
    "- Image 2 is the EXACT chair product reference.\n" +
    "- Image 3 is the EXACT table product reference.\n" +
    "- Image 4 is the EXACT ceiling light product reference.\n\n" +
    "TASK: Redesign the kitchen interior using the exact provided products (match silhouette, materials, and colors as closely as possible). " +
    "Preserve the exact room geometry, camera position, perspective, windows/doors, and layout. " +
    "Replace only the furniture/items needed so the room contains the provided chair/table/light. " +
    "Keep the scene photorealistic, clean, decluttered, neutral even lighting, ultra-sharp focus. " +
    "Do NOT invent alternative furniture.\n\n" +
    "Selected products (for reference, do not browse):\n" +
    JSON.stringify(args.selectedProducts, null, 2);

  const resp = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
    size: args.size || "1024x1536",
    quality: "high",
  });

  const arr = Array.isArray(resp?.data) ? resp.data : [];
  const b64 = arr.map((d) => d?.b64_json).find((x) => typeof x === "string");
  const url = arr.map((d) => d?.url).find((x) => typeof x === "string");
  return { b64_json: b64 || null, url: url || null };
}

// ----------------------------
// MAIN
// ----------------------------

(async () => {
  const envContent = readEnvLocal();
  const OPENAI_API_KEY = getEnvValue(envContent, "OPENAI_API_KEY") || process.env.OPENAI_API_KEY || null;
  const SERPAPI_KEY = getEnvValue(envContent, "SERPAPI_KEY") || process.env.SERPAPI_KEY || null;

  console.log("🔑 Keys:");
  console.log(`   OpenAI: ${OPENAI_API_KEY ? `${OPENAI_API_KEY.slice(0, 12)}...` : "❌ missing"}`);
  console.log(`   SerpAPI: ${SERPAPI_KEY ? `${SERPAPI_KEY.slice(0, 12)}...` : "❌ missing"}`);
  console.log("");

  if (!OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY required");
    process.exit(1);
  }
  if (!SERPAPI_KEY) {
    console.error("❌ SERPAPI_KEY required");
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const roomImagePath =
    pickFirstExisting([
      path.join(__dirname, "IMG_1690.png"),
      path.join(__dirname, "IMG_1479.png"),
      path.join(__dirname, "public", "test-assets", "floorplan-test.png"),
    ]) || null;

  if (!roomImagePath) {
    console.error("❌ No input image found. Put a photo at IMG_1690.png or IMG_1479.png in repo root.");
    process.exit(1);
  }

  console.log("🏠 Input photo:", roomImagePath);
  const roomImageDataUrl = asDataUrlFromFile(roomImagePath);

  // A) Vision
  console.log("\n═".repeat(80));
  console.log("A) Vision → shopping list JSON");
  console.log("─".repeat(80));

  const vision = await visionShoppingList(openai, roomImageDataUrl);
  console.log(JSON.stringify(vision, null, 2));

  // Normalize to 3 slots (chair/table/light) for the demo
  const items = Array.isArray(vision.items) ? vision.items : [];
  const chairItem = items.find((x) => String(x.type || "").toLowerCase().includes("chair")) || { type: "chair", count: 2, color: "burgundy", material: "fabric", legs: "black" };
  const tableItem = items.find((x) => String(x.type || "").toLowerCase().includes("table")) || { type: "table", count: 1, material: "marble", shape: "rectangular", size_hint: "small" };
  const lightItem = items.find((x) => String(x.type || "").toLowerCase().includes("light")) || { type: "ceiling_light", count: 1, style: "flush mount", shape: "round" };

  const slots = [
    { slot: "chair", item: chairItem },
    { slot: "table", item: tableItem },
    { slot: "light", item: lightItem },
  ];

  // B/C/D) SERP per slot
  console.log("\n═".repeat(80));
  console.log("B/C/D) Build queries → SerpAPI → score+dedupe → top 3");
  console.log("─".repeat(80));

  const perSlot = {};

  for (const s of slots) {
    const queries = buildQueriesFromItem(s.item);
    const keywords = keywordsForScoring(s.item);
    console.log(`\n[${s.slot}] queries (${queries.length}):`);
    for (const q of queries) console.log(" -", q);

    let all = [];
    for (const q of queries) {
      // Shopping
      try {
        const json = await serpSearch(q, SERPAPI_KEY);
        all = all.concat(normalizeSerp(json));
      } catch (e) {
        console.warn(`[${s.slot}] shopping SERP failed for "${q}":`, e?.message || String(e));
      }
      // Organic fallback
      try {
        const json = await serpSearchOrganic(q, SERPAPI_KEY);
        all = all.concat(normalizeSerp(json));
      } catch (e) {
        console.warn(`[${s.slot}] organic SERP failed for "${q}":`, e?.message || String(e));
      }
      await sleep(400); // small politeness delay
    }

    const top = pickTop(all, keywords, 3);
    perSlot[s.slot] = {
      keywords,
      queries,
      shortlist: top.map((p) => ({
        title: p.title,
        price: p.price,
        domain: p.domain,
        source: p.source,
        url: p.link,
        image: p.image,
        score: p.score,
        kind: p.kind,
      })),
    };

    console.log(`\n[${s.slot}] top ${perSlot[s.slot].shortlist.length}:`);
    perSlot[s.slot].shortlist.forEach((p, i) => {
      console.log(` ${i + 1}. (${p.score}) ${p.title}`);
      console.log(`    ${p.url}`);
    });
  }

  // E) LLM selection — print EXACT JSON we send
  console.log("\n═".repeat(80));
  console.log("E) LLM selection (1 per slot)");
  console.log("─".repeat(80));

  const selectionInput = {
    room_type: vision.room_type || vision.roomType || "kitchen",
    style_targets: vision.style_targets || vision.styleTargets || [],
    slots: {
      chair: perSlot.chair.shortlist,
      table: perSlot.table.shortlist,
      light: perSlot.light.shortlist,
    },
    rules: {
      use_exact_products: true,
      preserve_geometry: true,
      pick_only_from_shortlist: true,
    },
  };

  console.log("\nJSON sent to LLM selection:");
  console.log(JSON.stringify(selectionInput, null, 2));

  const selected = await selectProducts(openai, selectionInput);
  console.log("\nSelected products JSON:");
  console.log(JSON.stringify(selected, null, 2));

  const chairSel = selected?.chair || selected?.Chair || null;
  const tableSel = selected?.table || selected?.Table || null;
  const lightSel = selected?.light || selected?.Light || null;

  if (!chairSel?.image || !tableSel?.image || !lightSel?.image) {
    console.warn("\n⚠️ Missing one or more selected product image URLs. Render step may fail.");
  }

  // F) Download product images + render
  console.log("\n═".repeat(80));
  console.log("F) Render edit using ORIGINAL + product reference images");
  console.log("─".repeat(80));

  const outDir = path.join(__dirname, "public", "test-assets");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const chairPath = path.join(outDir, "ref-chair.jpg");
  const tablePath = path.join(outDir, "ref-table.jpg");
  const lightPath = path.join(outDir, "ref-light.jpg");

  try {
    if (chairSel?.image) await downloadToFile(chairSel.image, chairPath);
    if (tableSel?.image) await downloadToFile(tableSel.image, tablePath);
    if (lightSel?.image) await downloadToFile(lightSel.image, lightPath);
  } catch (e) {
    console.warn("⚠️ Failed downloading one or more product images:", e?.message || String(e));
  }

  const selectedProducts = {
    chair: chairSel,
    table: tableSel,
    light: lightSel,
  };

  try {
    const result = await renderWithProductRefs(openai, {
      roomImagePath,
      chairImagePath: chairPath,
      tableImagePath: tablePath,
      lightImagePath: lightPath,
      selectedProducts,
      size: "1024x1536",
    });

    if (result.b64_json) {
      const outPath = path.join(outDir, "kitchen-openai-render.png");
      fs.writeFileSync(outPath, Buffer.from(result.b64_json, "base64"));
      console.log("✅ Saved render:", outPath);
    } else if (result.url) {
      console.log("✅ Render URL:", result.url);
    } else {
      console.log("❌ No image returned from OpenAI render step.");
    }
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("❌ Render step failed:", msg);
    console.error(
      "If you see a 403 about gpt-image-1 verification, verify your OpenAI organization first."
    );
  }

  console.log("\nDone.");
})().catch((e) => {
  console.error("❌ Fatal error:", e?.message || String(e));
  process.exit(1);
});

