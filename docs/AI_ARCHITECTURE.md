# AI architecture

Keep AI **separated by job**. Never a single `/api/ai` that does analysis, render, cost, legal, and shopping.

LLM output must be **structured and validated**. Do not trust raw model text. Do not let the model invent products, prices, or regulations.

---

## Target orchestrator (logical)

```text
AI Orchestrator (thin HTTP)
├── Vision Analysis          lib/analysis (authenticated) / analyze-home
├── Floor Plan Analysis      (home flow + analyze-home)
├── Render Generation        /api/render, generate/render, prompt-room-render
├── Cost Engine              budget-plan today → deterministic engine later
├── Legal / Regulation       not built (must be sourced)
├── Material / Product       P1.6 persisted SERP selections (Places allowlist, no hardcoded stores)
└── Report Generator         Step10/11 UI; no durable PDF yet
```

Each box: own route or `lib/` module, own types, own failure mode.

---

## What exists today

### Vision

- **P1.7b (MVP):** `lib/render/*` generates the canonical room visualization with OpenAI `gpt-image-1.5` image edits. Inputs: private room photo + confirmed private product reference bytes. Explicit Generate/Regenerate only. 120s `claim_room_render_slot`. Kill switch `OPENAI_IMAGE_RENDER_ENABLED`.
- **P1.7a (MVP):** `lib/references/*` copies confirmed product images into private Storage after SSRF + magic-byte checks. Canonical product rows are written only by a service_role persist RPC.
- **P1.6 (MVP):** `lib/discovery/*` server action. Builds item specs from persisted `design_requirements` (no OpenAI). Geocode once → Places once → canonical SERP (`lib/serp/search.ts`, same logic as `POST /api/serp/search`). Persists to `project_product_discoveries` / `project_product_selections`. Explicit Find products / Refresh products only. 60-second per-project cooldown (`claim_product_discovery_slot`).
- **P1.5 / P1.5.1 (MVP):** `lib/analysis/*` server action. Uses the persisted private `room_photo`, `gpt-4o` + `json_object`, then Zod. Persists to `project_room_analyses`. Explicit Analyze / Re-analyze only. 60-second per-project cooldown is enforced in Postgres (`claim_room_analysis_slot`). Unauthenticated `POST /api/analyze-room` has been removed.
- `POST /api/analyze-home` — floor plan / home (inactive MVP types)
- `POST /api/generate-greeting` — copy only (GPT-4o-mini)

### Render

- **Canonical room-renovation final render:** `lib/render/*` — OpenAI `gpt-image-1.5` edits (room + product reference files)
- `POST /api/render` — OpenAI Images (`gpt-image-1`), edits + optional mask (legacy / other flows)
- `app/api/generate/render.ts` — Replicate path used by `/api/generate` (not the MVP room final render)
- `POST /api/prompt-room-render` — prompt helper
- `POST /api/mask/segment`, `mask/auto-kitchen` — kitchen masking

### Combined generate (legacy orchestrator)

`POST /api/generate`: intent → SerpAPI search → curate → Replicate render → map stores.

This is the closest thing to a “do everything” pipeline. Prefer **calling the smaller routes** from the room/home flows rather than growing `/api/generate`.

### Location + products (non-LLM first)

- Geocode → Places (stores vs services) → SERP (`items` + `allowlistDomains`)
- Ranking in `lib/serp/pickBest.ts` is **deterministic**
- GPT may **pick among real TopCandidates** (`/api/orchestrator/pick-candidates`) — never invent a URL
- Summarize: `/api/orchestrator/summarize` must not invent prices

### Budget

`POST /api/budget-plan` asks GPT for JSON category caps. That is **not** an acceptable long-term cost engine. Numbers should come from a database + deterministic formula; LLM classifies and explains.

---

## Structured output (required going forward)

Validate with a schema library (Zod recommended) at the route boundary.

```ts
type RoomAnalysis = {
  roomType: string;
  // Image-only analysis must not invent estimatedArea / metres / cm.
  constraints: string[];
  uncertainties: string[];
};
```

type ProjectAnalysis = {
  projectType: "renovation" | "new_build" | "interior";
  estimatedTotalArea?: number;
  rooms: RoomAnalysis[];
  warnings: string[];
};

type Product = {
  id?: string;
  retailer: string;
  title: string;
  category?: string;
  image: string | null;
  price: number | null;
  currency: "EUR" | null;
  url: string;
  lastUpdatedAt?: string;
};
```

SERP `picked` must match Product-like fields (`url`/`link`, `price`, `domain`). If parse fails, return 502 with a safe error — do not ship half-parsed JSON to the UI as truth.

---

## Product recommendations

- Rank **real** retailer pages from allowlisted domains.
- If SERP `picked` is null, show empty + reason (`no product detail page found`), not a hallucinated SKU.
- Store names belong in generated `site:` queries, never in the user’s item spec.

---

## Legal / permits

Not implemented. When added:

- Never present memory-regulations as fact.
- Each claim: `sourceUrl`, `sourceTitle`, `jurisdiction`, `retrievedAt`, `regulationVersion?`, `confidence`, `disclaimer`.
- Prefer authoritative Slovenian sources. LLM explains retrieved text only.

---

## Cost engine (target)

```text
Cost database + deterministic calc
+ project parameters
+ location factor
+ material factor
+ LLM explanation of assumptions
```

Unacceptable: `user input → LLM → random €`.

---

## Async jobs (target)

Long generates must not look like a hanging POST.

States: `queued | uploading | processing | generating | completed | failed | cancelled`.

UI: progress from real state, retry, cancel when possible. No fake determinate bar when we only know “still running”.

Today: most routes are synchronous HTTP. Cache + daily SERP cap exist. There is **no job table**. Introduce jobs when render/analysis timeouts become user-visible failures.

---

## Image assets (target)

Do not keep all renders as anonymous data-URLs inside one React object.

Track: original upload, analysis image, generated render, variants, thumbnails, selected final — with `projectId`, prompt/config, model, `createdAt`, `status`, source image id.

Requires storage + DB (not present).

---

## Prompt ownership

All production prompts live in this repo (route files / future `lib/ai/prompts`). Do not copy leaked third-party system prompts. Research repos are **reference only**.

---

## Keys and safety

- Keys only on the server (`OPENAI_API_KEY`, `SERPAPI_KEY`, `REPLICATE_API_TOKEN`, `GOOGLE_MAPS_API_KEY`).
- Rate limit SERP/Places; honor dryRun.
- Do not log full image payloads or API keys.
