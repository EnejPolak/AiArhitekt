-- P1.7b: product-conditioned room render persistence + 120s cooldown.
-- Does not rewrite P1.1–P1.7a history.
-- Canonical MVP renderer is OpenAI gpt-image-1.5 image edits (application layer).

-- ---------------------------------------------------------------------------
-- 1. Guard operation: room_render (120s in claim RPC)
-- ---------------------------------------------------------------------------

alter table public.project_ai_request_guards
  drop constraint project_ai_request_guards_operation_allowed;

alter table public.project_ai_request_guards
  add constraint project_ai_request_guards_operation_allowed
    check (operation in ('room_analysis', 'product_discovery', 'room_render'));

comment on column public.project_ai_request_guards.operation is
  'Constrained text. Allowed: room_analysis, product_discovery, room_render. Interval is enforced in claim RPCs, not by the client.';

drop policy if exists project_ai_request_guards_insert_own on public.project_ai_request_guards;
drop policy if exists project_ai_request_guards_update_own on public.project_ai_request_guards;

create policy project_ai_request_guards_insert_own
on public.project_ai_request_guards
for insert
to authenticated
with check (
  operation in ('room_analysis', 'product_discovery', 'room_render')
  and last_started_at >= now() - interval '2 seconds'
  and last_started_at <= now() + interval '2 seconds'
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);

create policy project_ai_request_guards_update_own
on public.project_ai_request_guards
for update
to authenticated
using (
  (
    (operation in ('room_analysis', 'product_discovery') and last_started_at <= now() - interval '60 seconds')
    or
    (operation = 'room_render' and last_started_at <= now() - interval '120 seconds')
  )
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
)
with check (
  operation in ('room_analysis', 'product_discovery', 'room_render')
  and last_started_at >= now() - interval '2 seconds'
  and last_started_at <= now() + interval '2 seconds'
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);

create or replace function public.claim_room_render_slot(p_project_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_retry integer;
  v_count integer;
begin
  if auth.uid() is null or p_project_id is null then
    raise exception 'not found' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.user_id = auth.uid()
      and p.project_type = 'room-renovation'
  ) then
    raise exception 'not found' using errcode = '42501';
  end if;

  insert into public.project_ai_request_guards as g (
    project_id,
    operation,
    last_started_at,
    updated_at
  )
  values (
    p_project_id,
    'room_render',
    now(),
    now()
  )
  on conflict (project_id, operation)
  do update set
    last_started_at = excluded.last_started_at,
    updated_at = now()
  where g.last_started_at <= now() - interval '120 seconds';

  get diagnostics v_count = ROW_COUNT;
  if v_count > 0 then
    return jsonb_build_object(
      'claimed', true,
      'retry_after_seconds', 0
    );
  end if;

  select greatest(
    1,
    ceil(extract(epoch from (g.last_started_at + interval '120 seconds' - now())))
  )::int
  into v_retry
  from public.project_ai_request_guards g
  where g.project_id = p_project_id
    and g.operation = 'room_render';

  return jsonb_build_object(
    'claimed', false,
    'retry_after_seconds', coalesce(v_retry, 120)
  );
end;
$$;

comment on function public.claim_room_render_slot(uuid) is
  'Atomic 120s room_render cooldown claim. SECURITY INVOKER. Interval is not client-supplied. Independent of room_analysis and product_discovery.';

revoke all on function public.claim_room_render_slot(uuid) from public;
revoke all on function public.claim_room_render_slot(uuid) from anon;
grant execute on function public.claim_room_render_slot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. project_room_renders
-- ---------------------------------------------------------------------------

create table public.project_room_renders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_upload_id uuid references public.project_uploads (id) on delete set null,
  source_analysis_id uuid references public.project_room_analyses (id) on delete set null,
  source_analysis_updated_at timestamptz,
  source_discovery_id uuid references public.project_product_discoveries (id) on delete set null,
  source_fingerprint text not null,
  provider text not null,
  model text not null,
  schema_version integer not null,
  status text not null,
  prompt_snapshot jsonb not null default '{}'::jsonb,
  reference_snapshot jsonb not null default '[]'::jsonb,
  output_storage_bucket text,
  output_storage_path text,
  output_mime_type text,
  output_size_bytes bigint,
  output_hash text,
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint project_room_renders_status_ok
    check (status in ('processing', 'succeeded', 'failed')),
  constraint project_room_renders_schema_ok
    check (schema_version >= 1),
  constraint project_room_renders_fingerprint_len
    check (char_length(source_fingerprint) = 64 and source_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint project_room_renders_output_bucket_ok
    check (output_storage_bucket is null or output_storage_bucket = 'project-assets'),
  constraint project_room_renders_output_mime_ok
    check (
      output_mime_type is null
      or output_mime_type in ('image/jpeg', 'image/png', 'image/webp')
    ),
  constraint project_room_renders_output_size_ok
    check (output_size_bytes is null or (output_size_bytes > 0 and output_size_bytes <= 15728640)),
  constraint project_room_renders_output_hash_ok
    check (
      output_hash is null
      or (char_length(output_hash) = 64 and output_hash ~ '^[a-f0-9]{64}$')
    ),
  constraint project_room_renders_output_path_ok
    check (
      output_storage_path is null
      or output_storage_path ~ '^projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/renders/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    ),
  constraint project_room_renders_succeeded_has_output
    check (
      status is distinct from 'succeeded'
      or (
        output_storage_path is not null
        and output_storage_bucket = 'project-assets'
        and output_mime_type is not null
        and output_size_bytes is not null
        and output_hash is not null
      )
    )
);

comment on table public.project_room_renders is
  'Product-conditioned room visualizations. Historical rows are kept. Current = source_fingerprint matches the live project design state. Output bytes live in private project-assets. Not a shopping result.';
comment on column public.project_room_renders.source_fingerprint is
  'SHA-256 hex of canonical render inputs. Defines this exact design state.';
comment on column public.project_room_renders.reference_snapshot is
  'Immutable generation-time mapping of image N to confirmed selection + reference hash. No signed URLs or secrets.';
comment on column public.project_room_renders.prompt_snapshot is
  'Validated generation instructions. No credentials or temporary URLs.';

create index project_room_renders_project_id_created_at_idx
  on public.project_room_renders (project_id, created_at desc);

create unique index project_room_renders_inflight_fingerprint_idx
  on public.project_room_renders (project_id, source_fingerprint)
  where status = 'processing';

create unique index project_room_renders_output_path_idx
  on public.project_room_renders (output_storage_path)
  where output_storage_path is not null;

create or replace function public.set_project_room_renders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_room_renders_set_updated_at
before update on public.project_room_renders
for each row
execute function public.set_project_room_renders_updated_at();

alter table public.project_room_renders enable row level security;
alter table public.project_room_renders force row level security;

revoke all on table public.project_room_renders from public;
revoke all on table public.project_room_renders from anon;
grant select on table public.project_room_renders to authenticated;
grant select, insert, update, delete on table public.project_room_renders to service_role;

create policy project_room_renders_select_own
on public.project_room_renders
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

create or replace function public.insert_project_room_render_processing(
  p_owner_user_id uuid,
  p_project_id uuid,
  p_source_upload_id uuid,
  p_source_analysis_id uuid,
  p_source_analysis_updated_at timestamptz,
  p_source_discovery_id uuid,
  p_source_fingerprint text,
  p_provider text,
  p_model text,
  p_schema_version integer,
  p_prompt_snapshot jsonb,
  p_reference_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.user_id = p_owner_user_id
      and p.project_type = 'room-renovation'
  ) then
    raise exception 'not found' using errcode = '42501';
  end if;

  begin
    insert into public.project_room_renders (
      project_id,
      source_upload_id,
      source_analysis_id,
      source_analysis_updated_at,
      source_discovery_id,
      source_fingerprint,
      provider,
      model,
      schema_version,
      status,
      prompt_snapshot,
      reference_snapshot,
      started_at
    )
    values (
      p_project_id,
      p_source_upload_id,
      p_source_analysis_id,
      p_source_analysis_updated_at,
      p_source_discovery_id,
      p_source_fingerprint,
      p_provider,
      p_model,
      p_schema_version,
      'processing',
      coalesce(p_prompt_snapshot, '{}'::jsonb),
      coalesce(p_reference_snapshot, '[]'::jsonb),
      now()
    )
    returning id into v_id;

    return jsonb_build_object('id', v_id, 'created', true);
  exception
    when unique_violation then
      select r.id
      into v_id
      from public.project_room_renders r
      where r.project_id = p_project_id
        and r.source_fingerprint = p_source_fingerprint
        and r.status = 'processing'
      limit 1;

      if v_id is null then
        raise;
      end if;
      return jsonb_build_object('id', v_id, 'created', false);
  end;
end;
$$;

comment on function public.insert_project_room_render_processing(uuid, uuid, uuid, uuid, timestamptz, uuid, text, text, text, integer, jsonb, jsonb) is
  'Trusted processing-row insert after ownership check. service_role only. Concurrent same-fingerprint processing is deduped.';

revoke all on function public.insert_project_room_render_processing(uuid, uuid, uuid, uuid, timestamptz, uuid, text, text, text, integer, jsonb, jsonb) from public;
revoke all on function public.insert_project_room_render_processing(uuid, uuid, uuid, uuid, timestamptz, uuid, text, text, text, integer, jsonb, jsonb) from anon;
revoke all on function public.insert_project_room_render_processing(uuid, uuid, uuid, uuid, timestamptz, uuid, text, text, text, integer, jsonb, jsonb) from authenticated;
grant execute on function public.insert_project_room_render_processing(uuid, uuid, uuid, uuid, timestamptz, uuid, text, text, text, integer, jsonb, jsonb) to service_role;

create or replace function public.complete_project_room_render(
  p_owner_user_id uuid,
  p_project_id uuid,
  p_render_id uuid,
  p_output_storage_path text,
  p_output_mime_type text,
  p_output_size_bytes bigint,
  p_output_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.user_id = p_owner_user_id
      and p.project_type = 'room-renovation'
  ) then
    raise exception 'not found' using errcode = '42501';
  end if;

  update public.project_room_renders
  set
    status = 'succeeded',
    output_storage_bucket = 'project-assets',
    output_storage_path = p_output_storage_path,
    output_mime_type = p_output_mime_type,
    output_size_bytes = p_output_size_bytes,
    output_hash = p_output_hash,
    error_code = null,
    completed_at = now()
  where id = p_render_id
    and project_id = p_project_id
    and status = 'processing'
  returning id into v_id;

  if v_id is null then
    raise exception 'not found' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

revoke all on function public.complete_project_room_render(uuid, uuid, uuid, text, text, bigint, text) from public;
revoke all on function public.complete_project_room_render(uuid, uuid, uuid, text, text, bigint, text) from anon;
revoke all on function public.complete_project_room_render(uuid, uuid, uuid, text, text, bigint, text) from authenticated;
grant execute on function public.complete_project_room_render(uuid, uuid, uuid, text, text, bigint, text) to service_role;

create or replace function public.fail_project_room_render(
  p_owner_user_id uuid,
  p_project_id uuid,
  p_render_id uuid,
  p_error_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.user_id = p_owner_user_id
      and p.project_type = 'room-renovation'
  ) then
    raise exception 'not found' using errcode = '42501';
  end if;

  update public.project_room_renders
  set
    status = 'failed',
    error_code = left(coalesce(p_error_code, 'failed'), 64),
    completed_at = now()
  where id = p_render_id
    and project_id = p_project_id
    and status = 'processing'
  returning id into v_id;

  if v_id is null then
    raise exception 'not found' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

revoke all on function public.fail_project_room_render(uuid, uuid, uuid, text) from public;
revoke all on function public.fail_project_room_render(uuid, uuid, uuid, text) from anon;
revoke all on function public.fail_project_room_render(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.fail_project_room_render(uuid, uuid, uuid, text) to service_role;
