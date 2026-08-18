# Local Supabase

Local Auth, Postgres, and Storage for AI Architect.

Requires [Docker](https://docs.docker.com/get-docker/) and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

Ports are offset from CLI defaults so this stack can run next to another local Supabase project:

| Service | URL |
| --- | --- |
| API | `http://127.0.0.1:54421` |
| Postgres | `127.0.0.1:54422` |
| Studio | `http://127.0.0.1:54423` |
| Inbucket / Mailpit | `http://127.0.0.1:54424` |

## Commands

From the repo root (scripts call `npx supabase`):

```bash
npm run db:start    # start local stack
npm run db:status   # print URL + keys
npm run db:reset    # replay migrations from supabase/migrations
npm run db:types    # regenerate lib/database.types.ts from the local DB
npm run db:stop
```

Env names (new API key model — see `docs/BACKEND.md` / `env.example`):

| App env | CLI `db:status` label |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key (or legacy `anon key`) |
| `SUPABASE_SECRET_KEY` | secret key (or legacy `service_role`; server only; **not** for project CRUD) |

Do **not** add `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never put the secret / service_role value in `NEXT_PUBLIC_*`.

Copy values into `.env.local` for local app runs. Never use production keys with local, and never commit `.env.local`.

This directory **is** CLI-linked to the hosted project (`pvzecooaaeotvwbajmty`). Linking is not the same as pushing schema. Never `db reset --linked`.

## Schema

`public.projects` — user-owned projects, RLS forced.

`public.project_uploads` — current `room_photo` metadata. Private bucket `project-uploads`. Object keys:

```text
projects/{projectId}/uploads/{uploadId}.jpg|png|webp
```

Hard delete of a project must remove Storage objects via the Storage API (cascade only deletes Postgres rows).

## Later phases

- AI room analysis (P1.5)
- Jobs / Replicate persistence (P1.6)

See `docs/BACKEND.md`.
