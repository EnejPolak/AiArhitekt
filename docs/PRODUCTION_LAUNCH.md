# Production launch configuration

Hosted production backend (resumed): `pvzecooaaeotvwbajmty`. Schema is 12/12.

Local CLI stack remains `http://127.0.0.1:54421`. Do **not** `supabase config push` from this repo: local `config.toml` uses localhost Site URL and `enable_confirmations = false`.

## Phase 3B — Auth URL + SMTP (manual)

Canonical production app origin is **not finalized**. Legal copy mentions `https://www.arhitekt.ai`, but that host is not a verified deployment of this app (`NEXT_PUBLIC_SITE_URL` is still localhost; no Vercel project in-repo). Do not invent a domain.

After the production domain is confirmed as `https://<canonical-production-domain>`:

Dashboard → Authentication → URL Configuration:

- Site URL: `https://<canonical-production-domain>`
- Redirect URL 1: `https://<canonical-production-domain>/auth/callback`
- Redirect URL 2: `https://<canonical-production-domain>/auth/callback?next=/app`

Preview: add the exact preview origin later (`https://<preview-host>/auth/callback`). Do not add `https://*` wildcards.

Hosted Auth (read-only CLI diff vs local):

- Signups: enabled (matches local `enable_signup = true`)
- Confirm email: **on** (`enable_confirmations` remote `true`)
- Site URL remote: `http://localhost:3000` — replace with production https origin
- Redirect allow-list remote: **empty** — add the two callback URLs above
- Custom SMTP: not present in compared remote config — configure sender + SMTP in the dashboard

SMTP fields (do not store secrets in git):

- host, port (typically 587), username, password
- sender email (real domain identity)
- sender name: `AiArhitekt`

Confirmation template: use dashboard default, set from-name to AiArhitekt, keep `{{ .ConfirmationURL }}`, no localhost.

Vercel/production env (never print keys):

- `NEXT_PUBLIC_SUPABASE_URL=https://pvzecooaaeotvwbajmty.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_SITE_URL=https://<canonical-production-domain>`

Keep local `.env.local` SITE_URL on localhost for local UI. Do not point local CLI at production unless testing hosted auth.

## 1. Create a new hosted Supabase project

1. Create a new project in the Supabase dashboard (new ref, not `pvzecooaaeotvwbajmty`).
2. Copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Secret key → `SUPABASE_SECRET_KEY` (server only)
3. Do not put secret keys in `NEXT_PUBLIC_*`.

## 2. Apply migrations (new empty production project only)

From the repo, after `supabase link --project-ref <NEW_REF>`:

```bash
npx supabase db push
```

Do **not** run `supabase db reset --linked`. Do **not** push to the dead ref.

Migration order (12 files, latest is project location):

1. `20260818100000_p1_1_platform_baseline.sql`
2. `20260818120000_p1_3_projects.sql`
3. `20260818140000_p1_4_project_uploads.sql`
4. `20260818160000_p1_5_room_analyses.sql`
5. `20260818180000_p1_5_1_analysis_cost_guard.sql`
6. `20260818200000_p1_6_product_discovery.sql`
7. `20260818220000_p1_7_product_provenance_and_references.sql`
8. `20260818240000_p1_7_b_room_renders.sql`
9. `20260818260000_p1_7_c_least_privilege_grants.sql`
10. `20260818280000_p1_6_1_discovery_preference_identity.sql`
11. `20260818300000_p1_6_2_project_room_preferences.sql`
12. `20260818400000_p1_6_3_project_location.sql`

Regenerate types against **local** after schema changes:

```bash
npm run db:types
```

## 3. Auth dashboard checklist (manual)

Authentication → URL Configuration:

- Site URL = production origin from `NEXT_PUBLIC_SITE_URL` (https, not localhost)
- Redirect URLs must include:
  - `https://<prod-host>/auth/callback`
  - `https://<prod-host>/auth/callback?next=/app`
  - preview origins if used

Authentication settings:

- Allow new user signups: enabled
- Confirm email: enabled for production (expected)
- Confirm that “no session after signup” is treated as confirmation, not an error

Email / SMTP:

- Configure a production SMTP sender (custom SMTP or Supabase email)
- Set from-name / from-address
- Review confirmation email template
- Note rate limits
- Do not claim SMTP works until a real confirmation email is received

## 4. Production environment variables

Set on the production host (Vercel Production). Preview uses a separate hosted project/keys.

Required production:

- `NEXT_PUBLIC_SUPABASE_URL` (https hosted, not localhost, not dead ref)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_SITE_URL` (https public origin)
- `OPENAI_API_KEY`
- `GOOGLE_MAPS_API_KEY`

Optional:

- `OPENAI_IMAGE_RENDER_ENABLED` (false unless image spend is intended)
- `GOOGLE_GEOCODING_ENABLED` / daily-monthly quota docs
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`
- `APP_DEPLOYMENT_ENV=production` only on non-Vercel hosts

Must stay unset/false in production:

- `API_DEBUG_ENABLED`
- `PRODUCT_DISCOVERY_LUNA_PRIMARY` (forced off in production code)
- `PRODUCT_DISCOVERY_SERP_FALLBACK` (forced off in production code)
- `PRODUCT_DISCOVERY_PRIMARY_PROMPT_VARIANT` (forced control in production)

Local only / legacy:

- `SERPAPI_KEY`, `REPLICATE_API_TOKEN`, `SERP_DAILY_CAP`
- `PLAYWRIGHT_TEST_EMAIL`, `PLAYWRIGHT_TEST_PASSWORD`
- `ENRICH_PRODUCT_PAGE`

## 5. Deploy preview, then production

Do not run a live smoke project in this hardening pass.

## 6. Observability

Set Sentry DSN after creating a Sentry project. Events are scrubbed (no cookies, auth headers, HTML, evidence dumps). Correlation tags: `projectId`, `attemptId`, `stage`, `errorCode`.

## 7. Billing

Not implemented. Sidebar Billing is a stub. Do not enable paying users until checkout, webhooks, and server entitlement exist.

## 8. One production smoke project (later)

After env, auth email, and Sentry are live: one authenticated room-renovation project. Do not do it in this task.

## 9. Signup verification (later)

New user → confirm email → `/auth/callback` → `/app` empty workspace.

## 10. Paying users (later)

Only after billing implementation.
