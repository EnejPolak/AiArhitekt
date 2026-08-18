-- P1.5: one current AI room analysis + design requirements per project.
-- Does not change public.projects or public.project_uploads RLS.
-- Does not search products or generate a renovation render.

create table public.project_room_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  source_upload_id uuid not null references public.project_uploads (id) on delete cascade,
  source_storage_path text not null,
  schema_version integer not null,
  provider text not null,
  model text not null,
  analysis jsonb not null,
  design_requirements jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_room_analyses_schema_version_ok
    check (schema_version >= 1),
  constraint project_room_analyses_provider_len
    check (char_length(btrim(provider)) between 1 and 64),
  constraint project_room_analyses_model_len
    check (char_length(btrim(model)) between 1 and 128),
  constraint project_room_analyses_path_shape
    check (
      source_storage_path ~ '^projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    )
);

comment on table public.project_room_analyses is
  'Current structured room analysis + design requirements. One row per project. Source photo is project_uploads room_photo; stale when source_storage_path no longer matches. No product URLs, prices, or renders.';
comment on column public.project_room_analyses.schema_version is
  'Application analysis JSON schema version. Independent of projects.flow_version.';
comment on column public.project_room_analyses.analysis is
  'Validated observation JSONB (existing room). Not user style/budget preferences.';
comment on column public.project_room_analyses.design_requirements is
  'Validated requirement JSONB for later product discovery (furnitureNeeds, materialNeeds, preserve, replaceOrRemove, constraints).';
comment on column public.project_room_analyses.source_storage_path is
  'Exact private Storage key used for this analysis. Compare to the current room_photo path before treating the row as current.';

create index project_room_analyses_source_upload_id_idx
  on public.project_room_analyses (source_upload_id);

create or replace function public.set_project_room_analyses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_room_analyses_set_updated_at
before update on public.project_room_analyses
for each row
execute function public.set_project_room_analyses_updated_at();

create or replace function public.project_room_analyses_source_matches_project()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.project_uploads u
    where u.id = new.source_upload_id
      and u.project_id = new.project_id
      and u.kind = 'room_photo'
      and u.storage_path = new.source_storage_path
  ) then
    raise exception 'source upload must be the current room photo for this project'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger project_room_analyses_source_matches_project
before insert or update on public.project_room_analyses
for each row
execute function public.project_room_analyses_source_matches_project();

alter table public.project_room_analyses enable row level security;
alter table public.project_room_analyses force row level security;

revoke all on table public.project_room_analyses from public;
revoke all on table public.project_room_analyses from anon;
grant select, insert, update, delete on table public.project_room_analyses to authenticated;

create policy project_room_analyses_select_own
on public.project_room_analyses
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);

create policy project_room_analyses_insert_own
on public.project_room_analyses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);

create policy project_room_analyses_update_own
on public.project_room_analyses
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);

create policy project_room_analyses_delete_own
on public.project_room_analyses
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);
