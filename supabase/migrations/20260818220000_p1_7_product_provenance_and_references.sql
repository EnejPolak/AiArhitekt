-- P1.7a: lock canonical product writes + private product reference assets.
-- Does not rewrite P1.1–P1.6 history.
-- Does not generate a renovation render or change the Replicate model.

-- ---------------------------------------------------------------------------
-- 1. Canonical product provenance
-- Browser/PostgREST must not insert or mutate product commerce fields.
-- Trusted persist is replace_project_product_discovery_result (service_role only).
-- ---------------------------------------------------------------------------

revoke insert, update, delete on table public.project_product_discoveries from authenticated;
grant select, delete on table public.project_product_discoveries to authenticated;

revoke insert, delete on table public.project_product_selections from authenticated;
-- is_confirmed remains the only updatable column (granted in P1.6).
grant select on table public.project_product_selections to authenticated;
grant update (is_confirmed) on table public.project_product_selections to authenticated;

drop policy if exists project_product_discoveries_insert_own on public.project_product_discoveries;
drop policy if exists project_product_discoveries_update_own on public.project_product_discoveries;
drop policy if exists project_product_selections_insert_own on public.project_product_selections;
drop policy if exists project_product_selections_delete_own on public.project_product_selections;

create or replace function public.replace_project_product_discovery_result(
  p_owner_user_id uuid,
  p_project_id uuid,
  p_discovery jsonb,
  p_selections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_discovery_id uuid;
  v_item jsonb;
  v_url text;
  v_image text;
  v_currency text;
  v_price numeric;
begin
  v_role = coalesce(auth.role(), '');
  if v_role is distinct from 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_owner_user_id is null or p_project_id is null or p_discovery is null then
    raise exception 'invalid input' using errcode = '22023';
  end if;

  if jsonb_typeof(p_selections) is distinct from 'array' then
    raise exception 'invalid input' using errcode = '22023';
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

  if jsonb_typeof(p_discovery -> 'allowlist_domains') is distinct from 'array' then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  if jsonb_typeof(p_discovery -> 'unmatched_requirements') is distinct from 'array' then
    raise exception 'invalid input' using errcode = '22023';
  end if;

  select d.id
  into v_discovery_id
  from public.project_product_discoveries d
  where d.project_id = p_project_id;

  if v_discovery_id is null then
    insert into public.project_product_discoveries (
      project_id,
      source_analysis_id,
      source_analysis_updated_at,
      location_input,
      latitude,
      longitude,
      radius_km,
      searched_item_count,
      not_searched_count,
      allowlist_domains,
      unmatched_requirements
    )
    values (
      p_project_id,
      (p_discovery ->> 'source_analysis_id')::uuid,
      (p_discovery ->> 'source_analysis_updated_at')::timestamptz,
      btrim(p_discovery ->> 'location_input'),
      (p_discovery ->> 'latitude')::double precision,
      (p_discovery ->> 'longitude')::double precision,
      (p_discovery ->> 'radius_km')::integer,
      (p_discovery ->> 'searched_item_count')::integer,
      (p_discovery ->> 'not_searched_count')::integer,
      coalesce(p_discovery -> 'allowlist_domains', '[]'::jsonb),
      coalesce(p_discovery -> 'unmatched_requirements', '[]'::jsonb)
    )
    returning id into v_discovery_id;
  else
    update public.project_product_discoveries
    set
      source_analysis_id = (p_discovery ->> 'source_analysis_id')::uuid,
      source_analysis_updated_at = (p_discovery ->> 'source_analysis_updated_at')::timestamptz,
      location_input = btrim(p_discovery ->> 'location_input'),
      latitude = (p_discovery ->> 'latitude')::double precision,
      longitude = (p_discovery ->> 'longitude')::double precision,
      radius_km = (p_discovery ->> 'radius_km')::integer,
      searched_item_count = (p_discovery ->> 'searched_item_count')::integer,
      not_searched_count = (p_discovery ->> 'not_searched_count')::integer,
      allowlist_domains = coalesce(p_discovery -> 'allowlist_domains', '[]'::jsonb),
      unmatched_requirements = coalesce(p_discovery -> 'unmatched_requirements', '[]'::jsonb)
    where id = v_discovery_id;

    delete from public.project_product_selections
    where discovery_id = v_discovery_id;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_selections)
  loop
    v_url = v_item ->> 'product_url';
    v_image = v_item ->> 'product_image_url';
    v_currency = v_item ->> 'currency';
    v_price = nullif(v_item ->> 'price', '')::numeric;

    if v_url is null or v_url !~ '^https?://' then
      raise exception 'invalid input' using errcode = '22023';
    end if;
    if v_image is not null and v_image !~ '^https?://' then
      raise exception 'invalid input' using errcode = '22023';
    end if;
    if v_currency is not null and v_currency is distinct from 'EUR' then
      raise exception 'invalid input' using errcode = '22023';
    end if;

    insert into public.project_product_selections (
      project_id,
      discovery_id,
      requirement_type,
      requirement_key,
      requirement_snapshot,
      item_spec,
      product_title,
      product_url,
      product_image_url,
      price,
      currency,
      retailer_domain,
      retailer_name,
      has_reference_image,
      is_confirmed
    )
    values (
      p_project_id,
      v_discovery_id,
      v_item ->> 'requirement_type',
      v_item ->> 'requirement_key',
      coalesce(v_item -> 'requirement_snapshot', '{}'::jsonb),
      v_item ->> 'item_spec',
      v_item ->> 'product_title',
      v_url,
      v_image,
      v_price,
      v_currency,
      v_item ->> 'retailer_domain',
      nullif(btrim(coalesce(v_item ->> 'retailer_name', '')), ''),
      coalesce((v_item ->> 'has_reference_image')::boolean, false),
      false
    );
  end loop;

  return v_discovery_id;
end;
$$;

comment on function public.replace_project_product_discovery_result(uuid, uuid, jsonb, jsonb) is
  'Trusted SERP persist for one project. SECURITY DEFINER, search_path empty. Executable by service_role only. Does not accept browser JWTs. Canonical product rows start unconfirmed.';

revoke all on function public.replace_project_product_discovery_result(uuid, uuid, jsonb, jsonb) from public;
revoke all on function public.replace_project_product_discovery_result(uuid, uuid, jsonb, jsonb) from anon;
revoke all on function public.replace_project_product_discovery_result(uuid, uuid, jsonb, jsonb) from authenticated;
grant execute on function public.replace_project_product_discovery_result(uuid, uuid, jsonb, jsonb) to service_role;

grant select, insert, update, delete on table public.project_product_discoveries to service_role;
grant select, insert, update, delete on table public.project_product_selections to service_role;

-- ---------------------------------------------------------------------------
-- 2. Private product reference assets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-assets',
  'project-assets',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.project_product_reference_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  selection_id uuid not null unique references public.project_product_selections (id) on delete cascade,
  source_image_url text not null,
  storage_bucket text not null default 'project-assets',
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null,
  source_hash text not null,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_product_reference_assets_bucket_ok
    check (storage_bucket = 'project-assets'),
  constraint project_product_reference_assets_mime_ok
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint project_product_reference_assets_size_ok
    check (size_bytes > 0 and size_bytes <= 10485760),
  constraint project_product_reference_assets_hash_len
    check (char_length(source_hash) = 64 and source_hash ~ '^[a-f0-9]{64}$'),
  constraint project_product_reference_assets_url_http
    check (source_image_url ~ '^https?://'),
  constraint project_product_reference_assets_path_shape
    check (
      storage_path ~ '^projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/product-references/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    ),
  constraint project_product_reference_assets_dims_ok
    check (
      (width is null and height is null)
      or (width >= 1 and height >= 1)
    )
);

comment on table public.project_product_reference_assets is
  'Server-acquired private copies of confirmed product images. One current asset per selection. Bytes live in private bucket project-assets. Not a render. SHA-256 source_hash identifies the exact bytes used.';
comment on column public.project_product_reference_assets.source_hash is
  'SHA-256 hex of acquired image bytes. URL is not identity.';
comment on column public.project_product_reference_assets.storage_path is
  'projects/{projectId}/product-references/{selectionId}.{jpg|png|webp}';

create index project_product_reference_assets_project_id_idx
  on public.project_product_reference_assets (project_id);

create or replace function public.set_project_product_reference_assets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_product_reference_assets_set_updated_at
before update on public.project_product_reference_assets
for each row
execute function public.set_project_product_reference_assets_updated_at();

create or replace function public.project_product_reference_assets_match_selection_project()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.project_product_selections s
    where s.id = new.selection_id
      and s.project_id = new.project_id
  ) then
    raise exception 'reference asset must belong to the selection project'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger project_product_reference_assets_match_selection_project
before insert or update on public.project_product_reference_assets
for each row
execute function public.project_product_reference_assets_match_selection_project();

alter table public.project_product_reference_assets enable row level security;
alter table public.project_product_reference_assets force row level security;

revoke all on table public.project_product_reference_assets from public;
revoke all on table public.project_product_reference_assets from anon;
grant select, delete on table public.project_product_reference_assets to authenticated;
grant select, insert, update, delete on table public.project_product_reference_assets to service_role;

create policy project_product_reference_assets_select_own
on public.project_product_reference_assets
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

create policy project_product_reference_assets_delete_own
on public.project_product_reference_assets
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

create or replace function public.is_owned_project_asset_path(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    object_name ~ '^projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(product-references|renders)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and exists (
      select 1
      from public.projects p
      where p.id::text = split_part(object_name, '/', 2)
        and p.user_id = auth.uid()
    );
$$;

comment on function public.is_owned_project_asset_path(text) is
  'Storage path ownership for private project-assets. P1.7a: product-references. renders prefix reserved; unused until generation is integrated.';

revoke all on function public.is_owned_project_asset_path(text) from public;
revoke all on function public.is_owned_project_asset_path(text) from anon;
grant execute on function public.is_owned_project_asset_path(text) to authenticated;

-- Authenticated users may read/delete own objects. They cannot insert/update
-- (server persist client / service_role writes after validated fetch).
create policy project_assets_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-assets'
  and public.is_owned_project_asset_path(name)
);

create policy project_assets_objects_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-assets'
  and public.is_owned_project_asset_path(name)
);

create or replace function public.upsert_project_product_reference_asset(
  p_owner_user_id uuid,
  p_project_id uuid,
  p_selection_id uuid,
  p_source_image_url text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes integer,
  p_source_hash text,
  p_width integer,
  p_height integer
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

  if not exists (
    select 1
    from public.project_product_selections s
    where s.id = p_selection_id
      and s.project_id = p_project_id
      and s.is_confirmed = true
      and s.has_reference_image = true
  ) then
    raise exception 'not found' using errcode = '42501';
  end if;

  insert into public.project_product_reference_assets (
    project_id,
    selection_id,
    source_image_url,
    storage_bucket,
    storage_path,
    mime_type,
    size_bytes,
    source_hash,
    width,
    height
  )
  values (
    p_project_id,
    p_selection_id,
    p_source_image_url,
    'project-assets',
    p_storage_path,
    p_mime_type,
    p_size_bytes,
    p_source_hash,
    p_width,
    p_height
  )
  on conflict (selection_id)
  do update set
    source_image_url = excluded.source_image_url,
    storage_path = excluded.storage_path,
    mime_type = excluded.mime_type,
    size_bytes = excluded.size_bytes,
    source_hash = excluded.source_hash,
    width = excluded.width,
    height = excluded.height
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.upsert_project_product_reference_asset(uuid, uuid, uuid, text, text, text, integer, text, integer, integer) is
  'Trusted reference-asset metadata write after server-side validated fetch. service_role only.';

revoke all on function public.upsert_project_product_reference_asset(uuid, uuid, uuid, text, text, text, integer, text, integer, integer) from public;
revoke all on function public.upsert_project_product_reference_asset(uuid, uuid, uuid, text, text, text, integer, text, integer, integer) from anon;
revoke all on function public.upsert_project_product_reference_asset(uuid, uuid, uuid, text, text, text, integer, text, integer, integer) from authenticated;
grant execute on function public.upsert_project_product_reference_asset(uuid, uuid, uuid, text, text, text, integer, text, integer, integer) to service_role;
