# Backend — persistence, auth, environment

Source of truth for persistence, auth, storage, and deployment environment. Product shopping remains **A → D → C** (`docs/ARCHITECTURE.md`).

---

## P1.3 scope (current)

| Included | Not included |
| --- | --- |
| `public.projects` + ownership + RLS | profiles, locations, uploads, Storage |
| Create / list / open / rename / archive / restore / hard delete | renders, analyses, jobs, products, estimates |
| Wizard position: `current_step_key` + `flow_version` | Places/SERP persistence, reports, legal |
| Server actions in `lib/projects/*` | service/admin client, orgs, sharing, billing |

Normal project CRUD uses the publishable key + authenticated session. **Do not** use `SUPABASE_SECRET_KEY` for project CRUD. RLS is the security boundary.

---

## P1.4 — Room photo Storage

Private bucket `project-uploads` (6 MB, JPEG/PNG/WebP). Canonical path:

```text
projects/{projectId}/uploads/{uploadId}.{jpg|png|webp}
```

`public.project_uploads` stores metadata only (no signed URLs, no bytes). One `room_photo` per project (`unique (project_id, kind)`). Ownership is via `projects` RLS (`auth.uid()`), not a duplicated `user_id`.

Upload: prepare (server) → direct Storage upload (browser + publishable key) → finalize (magic-byte check) → upsert metadata. Replace uploads the new object first. Remove deletes Storage then metadata and returns the wizard to `photo-upload` when needed. Project hard-delete removes Storage objects through the Storage API before deleting the project row.

Signed previews: 15 minutes, created on read, never stored.

P1.4 does **not** call OpenAI, Replicate, Places, or SERP.

---

## P1.5 — AI room analysis + design requirements

One current analysis per project in `public.project_room_analyses`. Observation (`analysis` JSONB) is separate from requirements (`design_requirements` JSONB). User style/budget/preferences remain later wizard steps and are not overwritten by AI guesses.

| Column | Purpose |
| --- | --- |
| `id` | UUID PK |
| `project_id` | Unique FK → `projects(id)` ON DELETE CASCADE |
| `source_upload_id` | FK → `project_uploads(id)` ON DELETE CASCADE |
| `source_storage_path` | Exact private Storage key used for this analysis |
| `schema_version` | Application analysis JSON schema (`1`). Not `projects.flow_version` |
| `provider` / `model` | Actual API call metadata (`openai` / `gpt-4o`) |
| `analysis` | Validated observation JSONB |
| `design_requirements` | Validated furniture/material needs JSONB |
| `created_at` / `updated_at` | DB defaults + trigger |

The room photo is persisted **before** analysis. The server loads the owned project (RLS), downloads the private object, sends it to OpenAI as a data URL (not stored), validates with Zod, then upserts the row. Missing measurements stay unknown/`exactDimensionsKnown: false`. Commerce fields are not part of the contract.

Stale protection: compare `source_upload_id` + `source_storage_path` to the current `room_photo`. Photo replace/remove deletes the analysis. Re-analyze keeps the previous valid row until the new result validates.

**Cost:** upload, refresh, open project, and viewing a saved analysis make **zero** OpenAI calls. Only explicit **Analyze Room** / **Re-analyze** may call the provider. Those paid starts are limited by a **server/database-enforced 60-second cooldown per project** (`claim_room_analysis_slot`). Cached reuse does not claim a slot. Provider failure still consumes the window. The unauthenticated `POST /api/analyze-room` route has been removed.

P1.5 does **not** run Places, SERP, product persistence, or a renovation render.

---

## P1.5.1 — Analysis security + cost guard

`public.project_ai_request_guards` stores `project_id` + `operation` (`room_analysis`) + `last_started_at`. Atomic RPC `claim_room_analysis_slot(p_project_id)` (SECURITY INVOKER, 60s hardcoded) decides whether a provider call may start. RLS is forced; anonymous has no access; User B cannot read/claim/reset User A. Clients cannot backdate `last_started_at` or delete the row. There is no production reset endpoint.

This is a cooldown, not a billing system.

---

## P1.6 — Real product / material discovery + persisted selection

One current discovery per project in `public.project_product_discoveries`, plus one canonical selected product per searched requirement in `public.project_product_selections`.

Pipeline (explicit **Find products** / **Refresh products** only):

```text
persisted room analysis
→ deterministic item specs (no OpenAI)
→ Geocode address once
→ Places once → allowlistDomains (stores only)
→ canonical SERP batch
→ persist discovery + selections
```

| Table | Purpose |
| --- | --- |
| `project_product_discoveries` | Current search context: analysis linkage, location, lat/lng, Places domains, unmatched requirements, normalized shopping preference snapshot + hash |
| `project_product_selections` | Canonical SERP-picked product per requirement (`product_url` from `url`, never `link`) |

A discovery is current only if `source_analysis_id` and `source_analysis_updated_at` match the current analysis **and** the normalized location matches **and** `source_preferences_hash` matches the current shopping-affecting preferences (wall colors, flooring, bed type, underfloor heating, selected styles). Preference changes do not trigger Geocode/Places/SERP; the UI asks the user to Find products again. Successful re-analysis deletes products **after** the new analysis persists. Failed re-analysis keeps the previous analysis and matching products. Photo replace/remove deletes analysis, which cascades discovery + selections.

**Cost:** upload, analyze, refresh, open project, and viewing saved products make **zero** Geocode / Places / SERP / OpenAI calls. Paid discovery starts are limited by `claim_product_discovery_slot` (60s per project, independent of room analysis). Previous valid products are not deleted if a refresh fails. Partial SERP success is valid (`picked: null` → unmatched `no_valid_product`, no fake row). Missing price/image stay null. Empty Places store domains → `no_local_retailers` (do not search the open web). At most 10 requirements are searched (`MAX_PRODUCT_DISCOVERY_ITEMS`); extras are `not_searched`.

`is_confirmed` starts false. The confirm action updates **only** that column. Canonical product rows are written only by `replace_project_product_discovery_result` (service_role persist client). Browser JWTs cannot insert or mutate commerce fields.

### P1.7a — Canonical provenance + private product reference assets

Trusted persist RPC `replace_project_product_discovery_result` is **service_role only**. Authenticated users keep `SELECT` + `DELETE` on discoveries, and `SELECT` + `UPDATE (is_confirmed)` on selections. They cannot PostgREST-insert fake product rows.

Confirmed products with `has_reference_image = true` are copied server-side into the private `project-assets` bucket after SSRF + magic-byte validation:

```text
projects/{projectId}/product-references/{selectionId}.{jpg|png|webp}
```

Metadata lives in `public.project_product_reference_assets` (one current asset per selection). `source_hash` is SHA-256 of the acquired bytes. Authenticated users may `SELECT`/`DELETE` owned rows and Storage objects; they cannot INSERT/UPDATE metadata or upload objects. Writes go through `upsert_project_product_reference_asset` (service_role only).

Confirmation succeeds even if the retailer image fetch fails. Failed fetch does not un-confirm. Unconfirmed SERP rows are not downloaded.

P1.7a does **not** generate a renovation render.

### P1.7b — Product-conditioned final room render

Canonical room-renovation visualization uses OpenAI **`gpt-image-1.5`** via the Images **edits** API (`lib/render/*`). Image 1 is the current private `room_photo`. Images 2..N (at most 10) are validated private `project_product_reference_assets` for **confirmed** selections, ordered deterministically (large furniture → other furniture → materials → accessories). Unconfirmed products, raw SERP URLs, and browser-submitted images are never trusted render inputs.

The prompt is built server-side. `input_fidelity` is always `high`. MVP default quality is `medium`, size `auto`. Kill switch: `OPENAI_IMAGE_RENDER_ENABLED` (not `NEXT_PUBLIC_`). Explicit **Generate design** / **Regenerate design** only. Cooldown: `claim_room_render_slot` (120s per project). In-flight same-fingerprint generations are deduped. Output is stored privately at `projects/{projectId}/renders/{renderId}.{jpg|png|webp}` with SHA-256. Preview uses a short-lived signed URL. A render is current only when `source_fingerprint` matches the live design state.

User-facing language: **“Visualization created using your selected product references.”** Commerce remains `project_product_selections`.

`POST /api/render` and Replicate RealVisXL are not this path.

### P1.7c — Least-privilege grants + live smoke-test prep

Authenticated table GRANTs on trusted commerce/render tables were tightened so default `ALL` leftovers cannot linger beside FORCE RLS. `project_room_renders`: SELECT only. Discovery/reference-asset owners keep SELECT+DELETE for cleanup. Selections keep SELECT + `UPDATE (is_confirmed)`.

Manual paid render is **not** automated. Checklist: `docs/P1_7C_LIVE_SMOKE_TEST.md`. First live attempt should confirm 2–3 products (not 10). Kill switch must be enabled in server env before Generate design; enabling it does not start a call.

Next: one manual end-to-end live render, then P1.8 — Final project result + cost summary + regeneration UX.

---

## P1.3.1 — MVP type (`room-renovation` only)

Application create/wizard validation allows **only** `room-renovation`. Crafted `home-renovation` / `new-construction` payloads are rejected server-side.

The database CHECK still allows the three P1.3 values (forward-compatible; no new migration). Historical rows of inactive types, if any, are left untouched and are not runnable in the MVP workspace.

---

## P1.2 recap

| Included | Not included |
| --- | --- |
| Email/password auth via Supabase | OAuth, magic link, phone |
| SSR session cookies (`@supabase/ssr`) | `profiles` table |
| Protected `/app` (server layout + `getUser()`) | Uploads, storage buckets, jobs |
| `/auth/callback` (PKCE / email confirm) | Playwright E2E |

P1.2 needed **no application table**. Identity is `auth.users` (id + email).

---

## Auth architecture

```text
browser → Supabase Auth → server-verified identity (getUser)
        → /app layout (authorization boundary)
        → lib/projects server actions + queries (publishable key)
        → Postgres RLS on public.projects
```

| File | Role |
| --- | --- |
| `lib/supabase/client.ts` | Browser client. Publishable key only. |
| `lib/supabase/server.ts` | Server Components / actions / Route Handlers. Publishable key + cookies. |
| `lib/supabase/updateSession.ts` | Called from `proxy.ts`. Refresh cookies + optimistic redirects. |
| `lib/auth/session.ts` | `getUser()` — **authorization** for `/app`. |
| `app/auth/callback/route.ts` | Exchange `code` or `token_hash`; safe `next` only. |
| `lib/projects/schema.ts` | Zod for create / rename / id / wizard step |
| `lib/projects/queries.ts` | Server reads (list active/archived, get by id) |
| `lib/projects/actions.ts` | Server mutations; injects `user.id` on create |
| `lib/projects/steps.ts` | Allowed `current_step_key` values per project type |

`proxy.ts` is **not** the security boundary. It may refresh the session and redirect anonymous `/app` requests to `/sign-in`. The `/app` layout always calls `supabase.auth.getUser()` and redirects if there is no user.

Do not use `SUPABASE_SECRET_KEY` for signup, login, logout, or `/app` protection.

Routes: `/sign-in`, `/sign-up`, `/auth/callback`, `/app`. Public marketing pages stay public.

---

## P1.1 recap

| Included | Not included (was P1.2+ at the time) |
| --- | --- |
| Local Supabase (`supabase/config.toml`, CLI scripts) | Auth UI (now P1.2) |
| Environment separation + debug gating | Project CRUD |
| P1.1-only migration (no application tables) | Uploads / storage buckets |
| Generated types strategy (`lib/database.types.ts`) | Jobs / Replicate persistence |

Do not implement P1.4–P1.6 in the same change set as P1.3.

---

## Platform

**Supabase Auth + Postgres + Storage + RLS.**

| Concern | Decision |
| --- | --- |
| Initial auth | Email/password only (P1.2). No OAuth, magic link, or phone in P1. |
| Migrations | Feature-phased. Create a table only when that feature is implemented. |
| Types | Commit generated types. Regenerate after migrations (`npm run db:types`). |
| Jobs (later) | Polling-first Replicate. No Redis / BullMQ / Temporal. Webhooks optional in P1.6 and must verify provider signature + timestamp before service-role writes. |
| Usage costs (later) | `provider_usage_events` must use a decimal/`numeric` cost, not integer cents. |

---

## Environment separation

Never mix local, preview, and production Supabase projects. Local keys come from `npm run db:status`. Production/preview keys live only in the host (Vercel) env — not in git.

This app uses the **new Supabase API key model** ([docs](https://supabase.com/docs/guides/getting-started/api-keys)):

| Variable | Where | Role |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Project URL (`http://127.0.0.1:54421` locally; `https://<ref>.supabase.co` remotely) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client + server | Publishable key (`sb_publishable_...`). Low privilege; **RLS applies**. Safe to expose. Replaces legacy `anon`. |
| `NEXT_PUBLIC_SITE_URL` | Client + server | Optional. App origin for email confirmation links (e.g. `http://127.0.0.1:3000`). Not the Supabase API URL. |
| `SUPABASE_SECRET_KEY` | Server only | Secret key (`sb_secret_...`). Bypasses RLS. Use only when a feature needs elevated access. **Never** `NEXT_PUBLIC_`. Replaces legacy `service_role`. |
| `OPENAI_API_KEY` | Server only | OpenAI. Room analysis + P1.7b image edits. **Never** `NEXT_PUBLIC_`. |
| `OPENAI_IMAGE_RENDER_ENABLED` | Server only | P1.7b kill switch (`true` / `false`). If false, Generate design does not call Images. **Never** `NEXT_PUBLIC_`. |
| `OPENAI_IMAGE_QUALITY` | Server only | Optional. Default `medium`. Browser cannot choose. |
| `OPENAI_IMAGE_SIZE` | Server only | Optional. Default `auto`. Browser cannot choose. |
| `API_DEBUG_ENABLED` | Server | Explicit opt-in for debug routes in **non-production** only |
| `APP_DEPLOYMENT_ENV` | Server | Non-Vercel equivalent of `VERCEL_ENV` (`production` / `preview` / `development`) |

**Do not standardize application code on** `NEXT_PUBLIC_SUPABASE_ANON_KEY` **or** `SUPABASE_SERVICE_ROLE_KEY`. Those are the legacy JWT keys. `anon` is the legacy equivalent of the publishable key.

P1.2 (email/password, user-scoped clients) needs URL + publishable key. `SUPABASE_SECRET_KEY` is required for P1.7a trusted persist RPCs, P1.7b room-render trusted writes, and private `project-assets` writes. Do not use it for login, project CRUD, or browser operations. Prefer the secret key over `service_role` when that path is implemented.

Local CLI currently still prints **anon key** / **service_role key** (`Platform, CLI` in the Supabase key table). Paste them into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` until the CLI emits `sb_publishable_` / `sb_secret_` values. Do not introduce `*_ANON_KEY` / `*_SERVICE_ROLE_KEY` env names in new code.

Vercel already sets `VERCEL_ENV` (`production` \| `preview` \| `development`). `VERCEL_TARGET_ENV` is treated as a documented equivalent.

**Do not use `NODE_ENV` as the production detector.** Next.js sets `NODE_ENV=production` for every production build, including preview and `next start` locally.

Helper: `lib/env/deployment.ts`

- `isProductionDeployment()` — true when `VERCEL_ENV` / `VERCEL_TARGET_ENV` / `APP_DEPLOYMENT_ENV` is `production`
- `isDebugApiAllowed()` — **false in production always**, even if `API_DEBUG_ENABLED=true`. Preview/development/local require `API_DEBUG_ENABLED=true` (or `1` / `yes`)

Gated today:

- `/api-debug` (server layout → `notFound()`)
- `POST /api/serp/reset-usage` → 404

---

## Local CLI

Requires Docker Desktop (or equivalent) and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
npm run db:start
npm run db:status    # copy URL; map CLI anon → PUBLISHABLE_KEY (see keys above)
npm run db:reset     # apply supabase/migrations
npm run db:types     # overwrite lib/database.types.ts from local DB
npm run db:stop
```

Studio: `http://127.0.0.1:54423`. Inbucket (local email): `http://127.0.0.1:54424`. Local API: `http://127.0.0.1:54421` (offset from CLI defaults so this stack can coexist with another local Supabase project on 54321).

Details: `supabase/README.md`.

---

## Remote project (CLI link)

`supabase/` is local config + migrations. This repo is CLI-linked to `pvzecooaaeotvwbajmty`. Linking is not a schema deploy.

- Do not `db push` or change remote schema except in the phase that owns that migration.
- Do not `db pull` unless remote has objects this repo must capture. Pulling would write migration files.

---

## Migrations

`supabase/migrations/20260818100000_p1_1_platform_baseline.sql`

- Comments the public schema
- Creates no application tables

`supabase/migrations/20260818120000_p1_3_projects.sql`

- Creates `public.projects`
- Enables + forces RLS
- Policies for SELECT / INSERT / UPDATE / DELETE (`auth.uid() = user_id`, `to authenticated` only)
- Index `(user_id, archived_at, updated_at desc)`
- Triggers: `updated_at`, immutable `user_id`

`supabase/migrations/20260818140000_p1_4_project_uploads.sql`

- Creates `public.project_uploads`
- Private bucket `project-uploads`
- Table + Storage RLS
- Unique `(project_id, kind)` — one current `room_photo`

`supabase/migrations/20260818160000_p1_5_room_analyses.sql`

- Creates `public.project_room_analyses`
- Unique one current analysis per `project_id`
- Source-upload trigger (same project, `room_photo`, matching path)
- FORCE RLS via project ownership

`supabase/migrations/20260818180000_p1_5_1_analysis_cost_guard.sql`

- Creates `public.project_ai_request_guards`
- RPC `claim_room_analysis_slot` (60s, SECURITY INVOKER)
- FORCE RLS; no anonymous access; no DELETE grant

`supabase/migrations/20260818200000_p1_6_product_discovery.sql`

- Broadens guard operations with `product_discovery` + RPC `claim_product_discovery_slot` (60s, SECURITY INVOKER)
- Creates `public.project_product_discoveries` (unique `project_id`) and `public.project_product_selections`
- FORCE RLS via project ownership; selections column-grant UPDATE (`is_confirmed`) only
- Analysis delete cascades discovery; project delete cascades both

`supabase/migrations/20260818220000_p1_7_product_provenance_and_references.sql`

- Revokes authenticated INSERT/UPDATE of discovery rows and INSERT/DELETE of selection rows
- Trusted persist RPC `replace_project_product_discovery_result` (service_role only)
- Private bucket `project-assets` (10 MB, JPEG/PNG/WebP)
- `public.project_product_reference_assets` + `upsert_project_product_reference_asset` (service_role only)
- Storage SELECT/DELETE for owned `product-references` (and reserved `renders` prefix). No authenticated INSERT/UPDATE

Push in timestamp order. Do not rewrite P1.1/P1.3/P1.4/P1.5 history. Never `db reset --linked`.

---

## `projects` schema (P1.3)

| Column | Purpose |
| --- | --- |
| `id` | UUID PK (`gen_random_uuid()`). Never sequential. |
| `user_id` | Owner. `references auth.users(id) on delete cascade`. Application injects `user.id`; the browser never chooses ownership. |
| `name` | Required. Trimmed in Zod. DB check: trimmed length 1–120. |
| `project_type` | Constrained `text` (DB still allows `room-renovation` \| `home-renovation` \| `new-construction`). **MVP create allow-list is `room-renovation` only** (`z.literal`). Not a Postgres enum. |
| `current_step_key` | Semantic wizard position (default `greeting`). Never `flow_step int`. |
| `flow_version` | Wizard schema version (default `1`). |
| `archived_at` | `NULL` = active. Timestamp = archived (reversible). Hard delete is a separate action. |
| `created_at` / `updated_at` | DB defaults. `updated_at` maintained by a small trigger. |

**Ownership chain:** sign-in → `getUser()` → server insert `{ user_id: user.id }` → RLS `with check (auth.uid() = user_id)`. Filtering `.eq("user_id")` is not the security boundary.

**Archive vs delete:** Archive sets `archived_at`. Restore sets it to `null`. `Delete Project` is a hard delete of the row. P1.4+ must also remove uploads, generated assets, reports, storage objects, and jobs.

**CRUD:** server actions in `lib/projects/actions.ts`. Reads in `lib/projects/queries.ts`. No extra REST routes. No `SUPABASE_SECRET_KEY` / service-role client.

**Routes:** `/app/projects/new` creates a `room-renovation` project; `/app/projects/{uuid}` opens. Missing or other-user IDs both `notFound()`.

---

## `project_uploads` schema (P1.4)

| Column | Purpose |
| --- | --- |
| `id` | UUID PK |
| `project_id` | FK → `projects(id)` ON DELETE CASCADE (metadata only; Storage needs API delete) |
| `kind` | `room_photo` (constrained text) |
| `storage_bucket` | `project-uploads` |
| `storage_path` | Canonical object key |
| `original_filename` | Display metadata, never the Storage key |
| `mime_type` | `image/jpeg` \| `image/png` \| `image/webp` |
| `size_bytes` | 1–6,291,456 |
| `created_at` / `updated_at` | DB defaults + trigger |

---

## Generated database types

| Rule | Why |
| --- | --- |
| Commit `lib/database.types.ts` | App and CI typecheck without a running database |
| Regenerate with `npm run db:types` after schema changes | Types follow SQL, not the other way around |
| Do not hand-edit table shapes | Drift. Change a migration, then regenerate |
| `public.projects` comes from `npm run db:types` | Do not maintain the row shape by hand |

When `@supabase/supabase-js` is used, instantiate as `createClient<Database>(url, publishableKey)` via `lib/supabase/client.ts` or `lib/supabase/server.ts`. Do not read `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## Local auth testing

1. `npm run db:start` (or point `.env` at the hosted project URL + publishable key).
2. Copy URL + publishable key into `.env.local` (map local CLI **anon key** → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
3. Local `supabase/config.toml`: `site_url = http://127.0.0.1:3000`, redirect URLs include `/auth/callback`. Local email confirmations are off (`enable_confirmations = false`) so signup can create a session immediately. Inbucket: `http://127.0.0.1:54424` if you turn confirmations on.
4. `npm run dev` → `/sign-up` → `/sign-in` → `/app` → Sign out.

Do not hardcode the hosted project URL in source. Env vars select local vs remote.

---

## Remote Dashboard (hosted project)

The CLI cannot safely change hosted Auth URLs from this repo. In [Authentication → URL configuration](https://supabase.com/dashboard/project/pvzecooaaeotvwbajmty/auth/url-configuration) set:

| Setting | Value |
| --- | --- |
| Site URL | Production app origin, e.g. `https://<your-domain>` (local testing against remote: `http://127.0.0.1:3000`) |
| Redirect URLs | `http://127.0.0.1:3000/auth/callback`, `http://localhost:3000/auth/callback`, and the production `/auth/callback` |
| Email provider | Email + password enabled. Confirm whether **Confirm email** is on; if on, signup shows “check your email” and does not enter `/app` until the callback succeeds. |

P1.1 (comment-only) and P1.3 (`projects`) are applied together in timestamp order. Do not `db reset --linked`.

---

## Authorization (locked)

`proxy.ts` / Next.js middleware may do **optimistic redirects and session refresh only**.

It is **not** the security boundary.

Real authorization:

1. Verified server-side Supabase identity (Auth session from cookies/JWT, verified on the server)
2. Route Handler / Server Component checks where appropriate
3. Postgres RLS
4. Project ownership in the database

Never trust `user_id` or project ownership sent by the client.

---

## Locked schema / product rules (implement in the phase that needs them)

**Wizard persistence (P1.3):**

```text
current_step_key  text
flow_version      int  default 1
```

Do **not** persist `flow_step int`. Reordering or inserting wizard steps must not break saved projects.

**Storage paths (P1.4):**

```text
projects/{projectId}/...
```

No `userId` in the path. Ownership is database + RLS.

**Archive vs delete (P1.3):**

- Archive = reversible (`archived_at = now()`). Restore = `archived_at = null`.
- Delete Project = hard delete of the `projects` row. Future phases must also delete child rows and storage.

**Generated assets (when that table exists):**

```text
asset_kind   = render | mask
is_selected  boolean
```

One canonical selection state. Do not also store `variant = candidate | selected | mask`.

---

## Related

- `docs/ARCHITECTURE.md` — current product architecture
- `docs/TESTING.md` — verification
- `env.example` — variable names
- `supabase/README.md` — local commands
