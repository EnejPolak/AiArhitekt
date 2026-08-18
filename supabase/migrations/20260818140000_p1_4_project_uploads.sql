-- P1.4: private room-photo Storage + project_uploads metadata.
-- Does not change public.projects RLS or ownership.
-- Storage objects are not removed by ON DELETE CASCADE; app hard-delete must use the Storage API.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-uploads',
  'project-uploads',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.project_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null default 'room_photo',
  storage_bucket text not null default 'project-uploads',
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_uploads_kind_allowed
    check (kind = 'room_photo'),
  constraint project_uploads_bucket_allowed
    check (storage_bucket = 'project-uploads'),
  constraint project_uploads_mime_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint project_uploads_size_ok
    check (size_bytes > 0 and size_bytes <= 6291456),
  constraint project_uploads_filename_len
    check (char_length(btrim(original_filename)) between 1 and 255),
  constraint project_uploads_path_shape
    check (
      storage_path ~ '^projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    )
);

comment on table public.project_uploads is
  'Current uploaded input files per project. P1.4: one room_photo. Does not store signed URLs or image bytes. Future AI analysis reads via temporary server-controlled access.';
comment on column public.project_uploads.kind is
  'Constrained text. MVP: room_photo only. Later kinds (floor_plan, reference_image) can be added without an enum migration.';
comment on column public.project_uploads.storage_path is
  'Canonical private object key: projects/{projectId}/uploads/{uploadId}.{jpg|png|webp}';

create unique index project_uploads_one_kind_per_project_idx
  on public.project_uploads (project_id, kind);

create index project_uploads_project_id_idx
  on public.project_uploads (project_id);

create or replace function public.set_project_uploads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_uploads_set_updated_at
before update on public.project_uploads
for each row
execute function public.set_project_uploads_updated_at();

alter table public.project_uploads enable row level security;
alter table public.project_uploads force row level security;

revoke all on table public.project_uploads from public;
revoke all on table public.project_uploads from anon;
grant select, insert, update, delete on table public.project_uploads to authenticated;

create policy project_uploads_select_own
on public.project_uploads
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

create policy project_uploads_insert_own
on public.project_uploads
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

create policy project_uploads_update_own
on public.project_uploads
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

create policy project_uploads_delete_own
on public.project_uploads
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

-- Storage object path ownership. SECURITY INVOKER: uses caller JWT, not definer rights.
create or replace function public.is_owned_project_upload_path(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    object_name ~ '^projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and exists (
      select 1
      from public.projects p
      where p.id::text = split_part(object_name, '/', 2)
        and p.user_id = auth.uid()
    );
$$;

revoke all on function public.is_owned_project_upload_path(text) from public;
revoke all on function public.is_owned_project_upload_path(text) from anon;
grant execute on function public.is_owned_project_upload_path(text) to authenticated;

create policy project_uploads_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-uploads'
  and public.is_owned_project_upload_path(name)
);

create policy project_uploads_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-uploads'
  and public.is_owned_project_upload_path(name)
);

create policy project_uploads_objects_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-uploads'
  and public.is_owned_project_upload_path(name)
)
with check (
  bucket_id = 'project-uploads'
  and public.is_owned_project_upload_path(name)
);

create policy project_uploads_objects_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-uploads'
  and public.is_owned_project_upload_path(name)
);
