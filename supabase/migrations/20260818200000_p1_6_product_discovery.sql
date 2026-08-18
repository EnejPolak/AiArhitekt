-- P1.6: persisted product discovery + selections, plus product_discovery cooldown.
-- Does not rewrite P1.1–P1.5.1 history.
-- Does not generate a renovation render or copy product images into Storage.

alter table public.project_ai_request_guards
  drop constraint project_ai_request_guards_operation_allowed;

alter table public.project_ai_request_guards
  add constraint project_ai_request_guards_operation_allowed
  check (operation in ('room_analysis', 'product_discovery'));

comment on column public.project_ai_request_guards.operation is
  'Constrained text. Allowed: room_analysis, product_discovery. Interval is enforced in claim RPCs, not by the client.';

drop policy if exists project_ai_request_guards_insert_own on public.project_ai_request_guards;
drop policy if exists project_ai_request_guards_update_own on public.project_ai_request_guards;

create policy project_ai_request_guards_insert_own
on public.project_ai_request_guards
for insert
to authenticated
with check (
  operation in ('room_analysis', 'product_discovery')
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
  operation in ('room_analysis', 'product_discovery')
  and last_started_at >= now() - interval '2 seconds'
  and last_started_at <= now() + interval '2 seconds'
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);

create or replace function public.claim_product_discovery_slot(p_project_id uuid)
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
    'product_discovery',
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
    and g.operation = 'product_discovery';

  return jsonb_build_object(
    'claimed', false,
    'retry_after_seconds', coalesce(v_retry, 60)
  );
end;
$$;

comment on function public.claim_product_discovery_slot(uuid) is
  'Atomic 60s product_discovery cooldown claim. SECURITY INVOKER. Interval is not client-supplied. Independent of room_analysis.';

revoke all on function public.claim_product_discovery_slot(uuid) from public;
revoke all on function public.claim_product_discovery_slot(uuid) from anon;
grant execute on function public.claim_product_discovery_slot(uuid) to authenticated;

create table public.project_product_discoveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  source_analysis_id uuid not null references public.project_room_analyses (id) on delete cascade,
  source_analysis_updated_at timestamptz not null,
  location_input text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_km integer not null,
  searched_item_count integer not null,
  not_searched_count integer not null,
  allowlist_domains jsonb not null default '[]'::jsonb,
  unmatched_requirements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_product_discoveries_location_len
    check (char_length(btrim(location_input)) between 3 and 500),
  constraint project_product_discoveries_lat
    check (latitude >= -90 and latitude <= 90),
  constraint project_product_discoveries_lng
    check (longitude >= -180 and longitude <= 180),
  constraint project_product_discoveries_radius
    check (radius_km between 1 and 50),
  constraint project_product_discoveries_searched_count
    check (searched_item_count >= 0 and searched_item_count <= 10),
  constraint project_product_discoveries_not_searched_count
    check (not_searched_count >= 0),
  constraint project_product_discoveries_allowlist_is_array
    check (jsonb_typeof(allowlist_domains) = 'array'),
  constraint project_product_discoveries_unmatched_is_array
    check (jsonb_typeof(unmatched_requirements) = 'array')
);

comment on table public.project_product_discoveries is
  'One current product discovery run per project. Built from persisted room analysis + Geocode + Places (once) + canonical SERP. No raw provider dumps. Stale when source_analysis_id or source_analysis_updated_at no longer match the current analysis. MAX_PRODUCT_DISCOVERY_ITEMS = 10.';
comment on column public.project_product_discoveries.source_analysis_id is
  'Analysis row used for this discovery. ON DELETE CASCADE when the analysis is removed (photo replace/remove).';
comment on column public.project_product_discoveries.source_analysis_updated_at is
  'Analysis updated_at at discovery time. Re-analysis with the same id still invalidates products.';
comment on column public.project_product_discoveries.location_input is
  'User-supplied address string. Server geocodes this; client lat/lng are not authoritative.';
comment on column public.project_product_discoveries.allowlist_domains is
  'Store domains from Places for this run. Never a hardcoded retailer list.';
comment on column public.project_product_discoveries.unmatched_requirements is
  'Requirements with no persisted product: not_searched or no_valid_product. No placeholder products.';

create index project_product_discoveries_source_analysis_id_idx
  on public.project_product_discoveries (source_analysis_id);

create or replace function public.set_project_product_discoveries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_product_discoveries_set_updated_at
before update on public.project_product_discoveries
for each row
execute function public.set_project_product_discoveries_updated_at();

create table public.project_product_selections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  discovery_id uuid not null references public.project_product_discoveries (id) on delete cascade,
  requirement_type text not null,
  requirement_key text not null,
  requirement_snapshot jsonb not null,
  item_spec text not null,
  product_title text not null,
  product_url text not null,
  product_image_url text,
  price numeric(12, 2),
  currency text,
  retailer_domain text not null,
  retailer_name text,
  has_reference_image boolean not null default false,
  is_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_product_selections_requirement_type_ok
    check (requirement_type in ('furniture', 'material')),
  constraint project_product_selections_requirement_key_len
    check (char_length(btrim(requirement_key)) between 1 and 160),
  constraint project_product_selections_item_spec_len
    check (char_length(btrim(item_spec)) between 1 and 120),
  constraint project_product_selections_title_len
    check (char_length(btrim(product_title)) between 1 and 500),
  constraint project_product_selections_url_http
    check (product_url ~ '^https?://'),
  constraint project_product_selections_image_http
    check (product_image_url is null or product_image_url ~ '^https?://'),
  constraint project_product_selections_price_ok
    check (price is null or price >= 0),
  constraint project_product_selections_currency_ok
    check (currency is null or currency = 'EUR'),
  constraint project_product_selections_domain_len
    check (char_length(btrim(retailer_domain)) between 1 and 253),
  constraint project_product_selections_name_len
    check (retailer_name is null or char_length(btrim(retailer_name)) between 1 and 200),
  constraint project_product_selections_reference_matches_image
    check (
      (product_image_url is null and has_reference_image = false)
      or (product_image_url is not null and has_reference_image = true)
    ),
  constraint project_product_selections_discovery_key_unique
    unique (discovery_id, requirement_key)
);

comment on table public.project_product_selections is
  'One canonical SERP-picked product per searched requirement. Missing price/image stay null. is_confirmed starts false. Future render consumes confirmed rows; do not query SERP again for the furniture list. Products without has_reference_image are not render-ready.';
comment on column public.project_product_selections.product_url is
  'Canonical SERP url. Provider link is not an application contract.';
comment on column public.project_product_selections.product_image_url is
  'Remote product image from the validated SERP result, or null. Never AI-generated. Not copied to Storage in P1.6.';
comment on column public.project_product_selections.has_reference_image is
  'True only when product_image_url is a real http(s) image from the search result. Future render must treat false as not reference-ready.';
comment on column public.project_product_selections.is_confirmed is
  'User approved this product for the future design. Default false. Confirm action may update only this column.';
comment on column public.project_product_selections.price is
  'Retail price from canonical SERP. numeric(12,2). Null when unavailable. Never invented.';

create index project_product_selections_project_id_idx
  on public.project_product_selections (project_id);

create or replace function public.set_project_product_selections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_product_selections_set_updated_at
before update on public.project_product_selections
for each row
execute function public.set_project_product_selections_updated_at();

create or replace function public.project_product_selections_match_discovery_project()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.project_product_discoveries d
    where d.id = new.discovery_id
      and d.project_id = new.project_id
  ) then
    raise exception 'product selection must belong to the discovery project'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger project_product_selections_match_discovery_project
before insert or update on public.project_product_selections
for each row
execute function public.project_product_selections_match_discovery_project();

alter table public.project_product_discoveries enable row level security;
alter table public.project_product_discoveries force row level security;

revoke all on table public.project_product_discoveries from public;
revoke all on table public.project_product_discoveries from anon;
grant select, insert, update, delete on table public.project_product_discoveries to authenticated;

create policy project_product_discoveries_select_own
on public.project_product_discoveries
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

create policy project_product_discoveries_insert_own
on public.project_product_discoveries
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

create policy project_product_discoveries_update_own
on public.project_product_discoveries
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

create policy project_product_discoveries_delete_own
on public.project_product_discoveries
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

alter table public.project_product_selections enable row level security;
alter table public.project_product_selections force row level security;

revoke all on table public.project_product_selections from public;
revoke all on table public.project_product_selections from anon;
grant select, insert, delete on table public.project_product_selections to authenticated;
grant update (is_confirmed) on table public.project_product_selections to authenticated;

create policy project_product_selections_select_own
on public.project_product_selections
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

create policy project_product_selections_insert_own
on public.project_product_selections
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

create policy project_product_selections_update_own
on public.project_product_selections
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

create policy project_product_selections_delete_own
on public.project_product_selections
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
