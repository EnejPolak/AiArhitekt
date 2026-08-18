-- P1.5.1: durable per-project cooldown for paid room-analysis starts.
-- Does not change projects / project_uploads / project_room_analyses RLS.
-- Does not search products or generate a renovation render.

create table public.project_ai_request_guards (
  project_id uuid not null references public.projects (id) on delete cascade,
  operation text not null,
  last_started_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (project_id, operation),
  constraint project_ai_request_guards_operation_allowed
    check (operation = 'room_analysis')
);

comment on table public.project_ai_request_guards is
  'Server-side paid-call cooldown. P1.5.1: room_analysis only. Not billing. last_started_at is not rolled back after provider failure.';
comment on column public.project_ai_request_guards.operation is
  'Constrained text. MVP: room_analysis. Interval is enforced in claim_room_analysis_slot, not by the client.';

create or replace function public.set_project_ai_request_guards_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_ai_request_guards_set_updated_at
before update on public.project_ai_request_guards
for each row
execute function public.set_project_ai_request_guards_updated_at();

alter table public.project_ai_request_guards enable row level security;
alter table public.project_ai_request_guards force row level security;

revoke all on table public.project_ai_request_guards from public;
revoke all on table public.project_ai_request_guards from anon;
grant select, insert, update on table public.project_ai_request_guards to authenticated;

create policy project_ai_request_guards_select_own
on public.project_ai_request_guards
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

create policy project_ai_request_guards_insert_own
on public.project_ai_request_guards
for insert
to authenticated
with check (
  operation = 'room_analysis'
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
  last_started_at <= now() - interval '60 seconds'
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
)
with check (
  operation = 'room_analysis'
  and last_started_at >= now() - interval '2 seconds'
  and last_started_at <= now() + interval '2 seconds'
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);

create or replace function public.claim_room_analysis_slot(p_project_id uuid)
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
    'room_analysis',
    now(),
    now()
  )
  on conflict (project_id, operation)
  do update set
    last_started_at = excluded.last_started_at,
    updated_at = now()
  where g.last_started_at <= now() - interval '60 seconds';

  get diagnostics v_count = ROW_COUNT;
  if v_count > 0 then
    return jsonb_build_object(
      'claimed', true,
      'retry_after_seconds', 0
    );
  end if;

  select greatest(
    1,
    ceil(extract(epoch from (g.last_started_at + interval '60 seconds' - now())))
  )::int
  into v_retry
  from public.project_ai_request_guards g
  where g.project_id = p_project_id
    and g.operation = 'room_analysis';

  return jsonb_build_object(
    'claimed', false,
    'retry_after_seconds', coalesce(v_retry, 60)
  );
end;
$$;

comment on function public.claim_room_analysis_slot(uuid) is
  'Atomic 60s room_analysis cooldown claim. SECURITY INVOKER. Interval is not client-supplied.';

revoke all on function public.claim_room_analysis_slot(uuid) from public;
revoke all on function public.claim_room_analysis_slot(uuid) from anon;
grant execute on function public.claim_room_analysis_slot(uuid) to authenticated;
