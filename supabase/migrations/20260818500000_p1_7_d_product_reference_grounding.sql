-- P1.7d exact-product reference grounding
-- Additive provenance on existing 1:1 project_product_reference_assets.
-- Renderer still uses one primary stored image per selection.

alter table public.project_product_reference_assets
  add column if not exists source_page_url text,
  add column if not exists is_primary boolean not null default true,
  add column if not exists sort_order integer not null default 0;

alter table public.project_product_reference_assets
  drop constraint if exists project_product_reference_assets_page_url_http;

alter table public.project_product_reference_assets
  add constraint project_product_reference_assets_page_url_http
  check (source_page_url is null or source_page_url ~ '^https?://');

alter table public.project_product_reference_assets
  drop constraint if exists project_product_reference_assets_sort_ok;

alter table public.project_product_reference_assets
  add constraint project_product_reference_assets_sort_ok
  check (sort_order >= 0 and sort_order <= 10);

comment on column public.project_product_reference_assets.source_page_url is
  'Merchant product page that authored the source_image_url. Provenance only; not a render input.';
comment on column public.project_product_reference_assets.is_primary is
  'Primary visual-reference image for this selection. Renderer sends at most one image per product.';
comment on column public.project_product_reference_assets.sort_order is
  'Stable gallery order. 0 is the primary image.';

drop function if exists public.upsert_project_product_reference_asset(uuid, uuid, uuid, text, text, text, integer, text, integer, integer);

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
  p_height integer,
  p_source_page_url text default null,
  p_is_primary boolean default true,
  p_sort_order integer default 0
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
  ) then
    raise exception 'not found' using errcode = '42501';
  end if;

  insert into public.project_product_reference_assets (
    project_id,
    selection_id,
    source_image_url,
    source_page_url,
    is_primary,
    sort_order,
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
    p_source_page_url,
    coalesce(p_is_primary, true),
    coalesce(p_sort_order, 0),
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
    source_page_url = excluded.source_page_url,
    is_primary = excluded.is_primary,
    sort_order = excluded.sort_order,
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

comment on function public.upsert_project_product_reference_asset(uuid, uuid, uuid, text, text, text, integer, text, integer, integer, text, boolean, integer) is
  'Trusted reference-asset metadata write after server-side validated fetch. service_role only. One row per selection; retries upsert in place.';

revoke all on function public.upsert_project_product_reference_asset(uuid, uuid, uuid, text, text, text, integer, text, integer, integer, text, boolean, integer) from public;
revoke all on function public.upsert_project_product_reference_asset(uuid, uuid, uuid, text, text, text, integer, text, integer, integer, text, boolean, integer) from anon;
revoke all on function public.upsert_project_product_reference_asset(uuid, uuid, uuid, text, text, text, integer, text, integer, integer, text, boolean, integer) from authenticated;
grant execute on function public.upsert_project_product_reference_asset(uuid, uuid, uuid, text, text, text, integer, text, integer, integer, text, boolean, integer) to service_role;
