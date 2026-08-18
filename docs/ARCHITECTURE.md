# Architecture — AI Architect (current system)

> **Source of truth for how the app is actually built today.**  
> Root `ARCHITECTURE.md` describes an older 4-layer target (`lib/services/*`) that **does not exist** in this repo. Prefer this file.

Read this before large structural changes. Do not migrate frameworks. Improve incrementally.

---

## Product

AI Architect is a Next.js App Router product. **MVP project type is `room-renovation` only** (one room). Whole-home and new-construction cannot be created.

### MVP pipeline (invariant)

The final room visualization is generated **only after** concrete products/materials have been selected. Do **not** generate a render first and then search for similar products.

```text
ROOM PHOTO
        ↓
ROOM ANALYSIS
        ↓
DESIGN REQUIREMENTS
        ↓
REAL PRODUCT / MATERIAL DISCOVERY
        ↓
PRODUCT SELECTION
        ↓
FINAL RENDER USING SELECTED PRODUCTS AS REFERENCES
        ↓
RESULT + BUYABLE PRODUCTS (price / store / link)
```

P1.4 persists the **room photo**. P1.5 persists **structured room analysis + design requirements** from that private photo. Product discovery and the final render come later — do not invert this pipeline.

Intended feel: **premium professional architectural SaaS**, not a generic AI dashboard.

---

## Current stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 App Router (`app/`), React 19, TypeScript 5.9 |
| Styling | Tailwind CSS 3.4, `clsx` + `tailwind-merge` (`cn()`), CVA on Button |
| Font | Manrope (`next/font/google`) |
| Icons | Lucide |
| Motion | `framer-motion` 12 (Motion) |
| Maps (debug / stores) | Leaflet types + Leaflet; Google Maps Places + Geocoding |
| AI | OpenAI SDK (`openai`), Replicate SDK |
| Product search | SerpAPI (`serpapi`) + custom `lib/serp/*` |
| Images | `pngjs`, `pdfjs-dist` |
| Lint/format | ESLint 9 (flat) + Prettier |
| Runtime | Node for AI/Places/SERP routes (`export const runtime = "nodejs"`) |
| Persistence (P1.5) | `projects` + `project_uploads` + `project_room_analyses` + private `project-uploads` bucket. See `docs/BACKEND.md`. |
| Auth (P1.2) | Supabase email/password via `@supabase/ssr` + `@supabase/supabase-js`. Publishable key only. |

**Not present in the running product yet:** object-storage buckets, job queue, shadcn CLI (`components.json`), Radix, Playwright, Storybook. Zod is used on selected API contracts.

---

## Folder structure (adapt; do not force a rewrite)

```text
app/                    # routes + API
  api/                  # server routes (one concern per route family)
  app/page.tsx          # authenticated workspace (empty or unselected)
  app/projects/new      # creates a room-renovation project
  app/projects/[id]     # persistent project UUID
  api-debug/            # A → D → C pipeline debug UI
components/
  ui/                   # Button, Container, BrickLoader only
  app/                  # project workspace + renovation flows
  sections/             # marketing landing
  pages/                # marketing/legal page sections
  layout/               # Navbar, Footer
  cookies/
lib/
  supabase/            # browser + server clients (publishable key)
  auth/                 # errors, redirects, session, server actions
  projects/             # schema, queries, server actions, wizard keys
  analysis/             # P1.5 structured room analysis + design requirements
  uploads/              # P1.4 private room-photo Storage
  env/deployment.ts     # production vs preview vs local; debug-route gating
  database.types.ts     # generated from local migrations (`npm run db:types`)
  places/               # Google Places discovery + store/service classification
  serp/                 # SERP query gen, ranking, enrich, quota
  geo/                  # haversine
  geocode/              # Geocoding kill switch + normalized cache (A only)
  cache.ts, rateLimit.ts, serpGuardrails.ts
  contexts/CookieContext.tsx
docs/                   # this architecture + design + AI + testing + backend
supabase/               # local CLI config + feature-phased migrations
```

---

## Routing

**Marketing / legal (static):** `/`, `/about`, `/ai-features`, `/pricing`, `/contact`, `/sign-in`, `/sign-up`, cookie/privacy/terms/disclaimer/refund, `/construction-safety-warning`.

**Product:** `/app` — **authenticated**. Server layout verifies the user with `supabase.auth.getUser()` and loads that user's projects. Routes:

```text
/app                      empty state, or “no project selected”
/app/projects/new         create room-renovation (server injects user.id)
/app/projects/{projectId} workspace for that UUID
```

Conversation answers stay in React memory; wizard **position** is persisted (`current_step_key` + `flow_version`). The room photo and current room analysis are persisted (P1.4 / P1.5).

**Auth:** `/sign-in`, `/sign-up`, `/auth/callback`.

**Debug:** `/api-debug` — Geocode → Places → SERP (and orchestrator helpers). Not an end-user surface. **Production deployments always disable it** (`lib/env/deployment.ts`); preview/local require `API_DEBUG_ENABLED=true`. Do not gate on `NODE_ENV` alone.

**Kitchen:** `/renovate-kitchen` + `/api/renovate-kitchen`, mask routes.

---

## Backend / data

**P1.3:** `public.projects` is the first application table. Ownership is `user_id` → `auth.users(id)` with RLS. Product data still includes:

- In-memory / process TTL caches (`lib/cache.ts`)
- File-backed SERP daily usage (`tmp/serp-usage.json`)
- Browser React state for renovation **answers** (not yet persisted)

Platform:

| Service | Used for |
| --- | --- |
| Supabase Postgres | `projects`, `project_uploads`, `project_room_analyses`; RLS is the security boundary |
| Supabase Auth | Email/password. `/sign-in` and `/sign-up` are live. `/app` is protected. |
| Supabase Storage | Private `project-uploads` bucket. Paths `projects/{projectId}/uploads/{uploadId}.{ext}` (P1.4). |

External APIs (keys server-side):

| Service | Used for |
| --- | --- |
| OpenAI | Vision analysis, greetings, budget JSON, image edits (`gpt-image-1`), GPT pick/summarize |
| Google Maps | Geocode, Places Nearby + Details |
| SerpAPI | Product search on allowlisted store domains |
| Replicate | Some render/segment paths (also OpenAI Images on `/api/render`) |

---

## Auth

Email + password only. Session cookies via `@supabase/ssr`.

- **Authorization boundary:** `app/app/layout.tsx` → `requireAppUser()` → `supabase.auth.getUser()`.
- **Proxy (`proxy.ts`):** refresh cookies + optimistic `/app` → `/sign-in` (and the reverse for already-signed-in users). Not the security boundary.
- **Logout:** `signOut` server action; `/app` is blocked afterwards.
- Never trust client `user_id`, localStorage, or `getSession()` alone for access control.

No `profiles` table. Project ownership/RLS is P1.3 (`lib/projects/*`). Server actions inject `user.id`; the browser never supplies ownership.

---

## Request flow (product shopping pipeline)

```text
A Geocode          GET  /api/geocode
        ↓ lat/lng
D Places           POST /api/places/search
        ↓ allowlistDomains (stores only)
C SERP             POST /api/serp/search
        ↓ items[] + domains → site:domain queries → 1 picked / item
Optional GPT       /api/orchestrator/pick-candidates | summarize | generate-items
```

Places classifies **stores vs services** (keyword/types boost, forced-move if service-like). SERP must search **only** store domains from D. LLM must not invent products or prices.

This discovery path (A → D → C) is unchanged in P1.3.1. Architecturally it belongs **before** the final render: find and select real products, then generate the visualization from those products.

---

## Google Geocoding cost protection

Target configuration:

```text
Google Cloud hard quota:
200 requests/day

Application safety target:
< 8,000 requests/month
```

`200 × 31 = 6,200` theoretical monthly max if the **Geocoding API** daily quota is 200, which stays under the 8,000 soft target.

| Layer | Role |
| --- | --- |
| **Google Cloud quota** | Real hard protection / billing cutoff |
| **`GOOGLE_GEOCODING_ENABLED=false`** | Application kill switch — `/api/geocode` never calls Google |
| **Normalized 24h in-memory cache** | Same location string (e.g. `Velenje` / ` velenje ` / `VELENJE`) shares one request **per server instance** |
| **Budget alerts** | Notification only — **not** a hard cutoff |
| **In-app daily/monthly counters** | **Not implemented.** There is no database. Memory, JSON files, cookies, and localStorage are not reliable on serverless/Vercel |

Env (see `env.example`):

```text
GOOGLE_GEOCODING_ENABLED=true
GOOGLE_GEOCODING_DAILY_LIMIT=200
GOOGLE_GEOCODING_MONTHLY_SOFT_LIMIT=8000
```

`DAILY_LIMIT` / `MONTHLY_SOFT_LIMIT` document the intended Google quota. They are not a persistent global counter. When disabled or when Google returns `OVER_QUERY_LIMIT` / HTTP 429, the API returns a structured error (`GEOCODING_DISABLED` / `GEOCODING_QUOTA_REACHED`) and **does not retry**.

Places (`/api/places/search`) is separate and is **not** covered by this kill switch.

---

## API families (keep separate — never a single `/api/ai`)

| Family | Routes | Role |
| --- | --- | --- |
| Vision / analysis | `lib/analysis/*` authenticated server action. `POST /api/analyze-room` removed. Per-project 60s DB cooldown. |
| Render | `render`, `generate/render`, `prompt-room-render`, `mask/*` | Images |
| Orchestrate generate | `generate` + intent/search/curate/map | Older 4-step pipeline |
| Location | `geocode`, `places/search`, `places/details`, `places-stores`, `places-contractors` | Local stores |
| Products | `serp/search`, `search-products` | Real URLs |
| Budget | `budget-plan` | LLM JSON caps (not a cost DB) |
| Orchestrator | `orchestrator/*` | GPT pick/summarize/items |

---

## UI architecture (today vs target)

**Today:** marketing sections + large flow components (`RoomRenovationFlow` with many `steps/*`). `components/ui` is three files. Tokens in Tailwind are incomplete; many screens use hardcoded `#0D0D0F` / rgba.

**Target (incremental):** shadcn-style primitives under `components/ui`, then domain folders (`upload`, `ai`, `render`, `cost`, `materials`) only when extracting from flows. Do not duplicate a second design system (Origin/Magic/React Bits = reference or landing-only).

---

## Constraints for future work

1. Do not reinstall libraries that already exist.
2. Do not migrate off Next.js.
3. Do not rewrite working Places/SERP/render paths without a measured reason.
4. Read `docs/DESIGN.md` before substantial UI changes.
5. Legal/permits: sourced only, never hallucinated as fact.
6. Cost numbers: not “LLM → random €”. Products: not invented by the model.
7. Long AI work: design for job states (`queued` → `completed`/`failed`); do not treat 60s+ generates as a normal instant POST forever.
8. **Products before final render.** Do not generate a room visualization and then search for similar products.

---

## Related docs

- `docs/BACKEND.md` — Supabase, env separation, types, P1 platform rules
- `docs/DESIGN.md` — UI tokens and product feel
- `docs/AI_ARCHITECTURE.md` — AI services and contracts
- `docs/TESTING.md` — tests and Playwright plan
- `docs/API-DEBUG-FLOW.md` — A→D→C debug page
- `lib/places/README.md` — Places cost controls
