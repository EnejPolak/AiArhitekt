# Testing

## Runner

**Vitest** (`vitest` ^4) is the unit-test runner.

| Script | Command |
| --- | --- |
| `npm test` | `vitest run` (CI / one-shot) |
| `npm run test:watch` | `vitest` (watch) |

Config: `vitest.config.ts` — Node environment, `**/*.test.ts`, path alias `@` → repo root. Tests import `describe` / `it` / `expect` / `vi` from `vitest` (no Jest). `*.test.ts` is excluded from Next.js `tsconfig` so tests are not typechecked into the production app.

Vitest was chosen over Jest: existing files were already `describe`/`it` unit tests with no Jest-specific matchers or transformers, and Vitest is a smaller add-on for this Next.js repo.

There is **no Playwright**, no Storybook, no coverage script (keep the stack small).

---

## What exists today

| Kind | Location | Runner |
| --- | --- | --- |
| Geo | `lib/geo/haversine.test.ts` | Vitest |
| Places | `lib/places/domainUtils.test.ts`, `placesService.test.ts`, `placesService.distance.test.ts` | Vitest |
| SERP | `lib/serp/queryGen.test.ts`, `pickBest.test.ts`, `normalize.test.ts`, `domains.test.ts`, `app/api/serp/search/route.test.ts` | Vitest (provider mocked) |
| Geocode | `lib/geocode/geocode.test.ts` | Vitest (Google `fetch` mocked; never live) |
| Deployment / debug gate | `lib/env/deployment.test.ts` | Vitest |
| Auth | `lib/auth/*.test.ts`, `lib/env/supabase.test.ts`, `app/auth/callback/route.test.ts` | Vitest (Supabase mocked) |
| Projects | `lib/projects/*.test.ts` | Vitest (schema unit + local RLS integration) |
| Uploads | `lib/uploads/*.test.ts` | Vitest (path/signature unit + local Storage RLS) |
| Room analysis | `lib/analysis/*.test.ts` | Vitest (Zod + mocked OpenAI + RLS/source/cooldown; no hosted OpenAI) |
| Manual | `/api-debug` A→D→C | Human (requires `API_DEBUG_ENABLED=true` on non-production) |
| Lint | `npm run lint` | ESLint 9 |
| Typecheck / production | `npx tsc --noEmit` and `npm run build` | Next 16 |

Paid APIs are mocked (`global.fetch = vi.fn()` or injected provider functions). Do not call Places/SerpAPI/OpenAI in default unit tests.

---

## Principles

1. Critical user flows get E2E once auth and persistence exist (P1).
2. Ranking, geo, and Places classification stay **unit-tested** (deterministic).
3. Do not call paid APIs in default unit tests — mock `fetch`.
4. Do not mock away the thing under test (e.g. don’t stub `pickBestCandidate` when testing it).
5. Do not weaken assertions to get a green suite. `places[]` is always empty by design — assert `stores` / `contractors` / `meta` instead.

---

## Coverage that must stay green

- `lib/geo/haversine` — radius distances
- `lib/places` — store vs contractor classification; service-domain heuristic; radius filter (`filteredOutCount` / `discardedOutOfRadius`); unique `place_id` in `stores`/`contractors`
- `lib/serp/queryGen` — item specs → `site:domain keywords`; store names stripped from keywords
- `lib/serp/pickBest` — category URL not picked; product `/p/` preferred; score &lt; 25 → `picked: null`
- `lib/serp/normalize` — raw SerpAPI → internal organic rows (`link` internal, API exposes `url`)
- `lib/serp/domains` — allowlist normalize / reject junk
- API contract (manual or later route tests): empty `allowlistDomains` → 400; `dryRun` → `executedCount: 0` without provider; HTTP 200 includes `dailyUsed` / `dailyRemaining`
- `lib/geocode` — kill switch; successful geocode; quota / denied / malformed; normalized cache; no retry on quota errors
- `POST /api/serp/search` — invalid body / empty allowlist → 400; `dryRun` → `executedCount: 0` without provider; HTTP 200 includes `dailyUsed` / `dailyRemaining`; picked uses `url` (not `link`); missing product → `picked: null`
- `lib/env/deployment` — production always disables debug APIs even if `API_DEBUG_ENABLED=true`; `NODE_ENV` alone is not production; preview/local require an explicit flag
- Auth — safe internal redirects; missing publishable config throws; unauthenticated `requireAppUser` redirects; callback rejects missing/malformed code and external `next`
- Projects — Zod create/rename/id/wizard validation; archive helper; error mapping does not leak SQL/policy names; local RLS integration against `127.0.0.1` only (anonymous deny-all; User A CRUD; User B isolation; no forged ownership)
- Uploads — canonical path; magic-byte validation; local Storage RLS
- Room analysis — structured Zod contract (no invented measurements, commerce fields stripped); provider errors mapped; local RLS; stale source invalidation; mocked provider persist/idempotency (load does not re-call OpenAI); per-project 60s cooldown; concurrent claims; legacy `/api/analyze-room` removed

---

## Manual auth smoke test (P1.2)

Use a disposable address. Do not use a real customer account.

1. Open `/sign-up`
2. Create a test user (email + password)
3. If email confirmation is enabled, confirm via the callback link
4. Sign in at `/sign-in`
5. Reach `/app`
6. Refresh the browser — session remains
7. Sign out
8. `/app` redirects to `/sign-in`
9. Sign in again

Playwright is still not in this phase.

---

## Projects RLS (P1.3, local only)

`lib/projects/projects.rls.test.ts` talks to **local** Supabase (API port from `supabase/config.toml`). It refuses `supabase.co`. Requires `npm run db:start` (and a reset after schema changes). It does not use `SUPABASE_SECRET_KEY` for project CRUD.

`lib/uploads/storage.rls.test.ts` covers private Storage + `project_uploads` the same way (anonymous / User A / User B / path attacks).

`lib/analysis/analysis.rls.test.ts`, `analysis.flow.test.ts`, `analysis.cooldown.test.ts`, and `guard.rls.test.ts` cover `project_room_analyses` and `project_ai_request_guards` (anonymous deny-all; User A/B isolation; source-photo mismatch; mocked OpenAI call counts; concurrent claim). They refuse `supabase.co`.

---

## Playwright (P1 — when flows are stable)

Install as **devDependency only**. Specs under `e2e/`. Not in this P0.

---

## Storybook

**Do not add now.**

---

## Quality gate before merge

1. `npm test`
2. `npm run lint`
3. `npm run build`
4. No invented commerce data in product picks (title/url/price must come from provider rows; missing → `null`)
