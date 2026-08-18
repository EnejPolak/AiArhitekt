-- P1.3: user-owned projects + RLS.
-- Feature-phased: this is the first application table. No uploads, jobs, or assets.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  project_type text not null,
  current_step_key text not null default 'greeting',
  flow_version integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_len
    check (char_length(btrim(name)) between 1 and 120),
  constraint projects_type_allowed
    check (
      project_type in (
        'room-renovation',
        'home-renovation',
        'new-construction'
      )
    ),
  constraint projects_step_key_len
    check (char_length(btrim(current_step_key)) between 1 and 64),
  constraint projects_flow_version_positive
    check (flow_version >= 1)
);

comment on schema public is
  'AI Architect application schema. P1.3: user-owned projects with RLS.';

comment on table public.projects is
  'User-owned renovation projects. P1.3: metadata and wizard position only. Future hard delete must also remove uploads, generated assets, reports, storage objects, and jobs.';
comment on column public.projects.user_id is
  'Owner from auth.users. ON DELETE CASCADE: deleting the auth user deletes their projects.';
comment on column public.projects.project_type is
  'Constrained text matching the /app type picker. Not a Postgres enum so values can be added without an enum migration.';
comment on column public.projects.current_step_key is
  'Semantic wizard position (e.g. greeting, room-type). Never persist flow_step int.';
comment on column public.projects.flow_version is
  'Wizard schema version. Default 1. Lets steps be inserted/reordered later.';
comment on column public.projects.archived_at is
  'NULL = active. Set to now() to archive (reversible). Hard delete is a separate action.';

create index projects_user_archived_updated_idx
  on public.projects (user_id, archived_at, updated_at desc);

-- updated_at is maintained in one place; not SECURITY DEFINER.
create or replace function public.set_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
before update on public.projects
for each row
execute function public.set_projects_updated_at();

-- Ownership is immutable through normal updates.
create or replace function public.prevent_project_ownership_change()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'project ownership cannot be changed';
  end if;
  return new;
end;
$$;

create trigger projects_prevent_ownership_change
before update on public.projects
for each row
execute function public.prevent_project_ownership_change();

alter table public.projects enable row level security;
alter table public.projects force row level security;

revoke all on table public.projects from public;
revoke all on table public.projects from anon;
grant select, insert, update, delete on table public.projects to authenticated;

create policy projects_select_own
on public.projects
for select
to authenticated
using (auth.uid() = user_id);

create policy projects_insert_own
on public.projects
for insert
to authenticated
with check (auth.uid() = user_id);

create policy projects_update_own
on public.projects
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy projects_delete_own
on public.projects
for delete
to authenticated
using (auth.uid() = user_id);
