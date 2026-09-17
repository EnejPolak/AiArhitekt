-- P1.7e reference acquisition status on existing selections.
-- Additive metadata only. Does not change FOUND/NOT_FOUND acceptance.

alter table public.project_product_selections
  add column if not exists reference_status text not null default 'pending',
  add column if not exists reference_failure_code text,
  add column if not exists reference_rescue_attempted boolean not null default false,
  add column if not exists image_evidence jsonb not null default '[]'::jsonb;

alter table public.project_product_selections
  drop constraint if exists project_product_selections_reference_status_ok;

alter table public.project_product_selections
  add constraint project_product_selections_reference_status_ok
  check (reference_status in ('pending', 'ready', 'unavailable'));

alter table public.project_product_selections
  drop constraint if exists project_product_selections_reference_failure_ok;

alter table public.project_product_selections
  add constraint project_product_selections_reference_failure_ok
  check (
    reference_failure_code is null
    or reference_failure_code in (
      'no_image',
      'merchant_blocked',
      'invalid_image',
      'association_unverified',
      'fetch_failed'
    )
  );

comment on column public.project_product_selections.reference_status is
  'Cache-first visual reference: pending until acquire, ready when bytes are stored, unavailable after a failed attempt. Does not change FOUND.';
comment on column public.project_product_selections.reference_failure_code is
  'Structured reason when reference_status is unavailable. Never a raw provider message.';
comment on column public.project_product_selections.reference_rescue_attempted is
  'True after the single bounded image-rescue operation for this selection.';
comment on column public.project_product_selections.image_evidence is
  'Verified-association image URL candidates captured during discovery. Not model-only.';

-- Persist associated image evidence with the FOUND selection so later acquire
-- does not depend on a second merchant HTML fetch.
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
  v_prefs jsonb;
  v_hash text;
  v_image_evidence jsonb;
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

  v_prefs = coalesce(
    p_discovery -> 'source_preferences',
    '{
      "bedType":"none",
      "flooring":"keep",
      "keepExistingWalls":false,
      "schemaVersion":1,
      "selectedStyles":[],
      "underfloorHeating":false,
      "wallAccentColor":"",
      "wallMainColor":""
    }'::jsonb
  );
  if jsonb_typeof(v_prefs) is distinct from 'object' then
    raise exception 'invalid input' using errcode = '22023';
  end if;

  v_hash = coalesce(
    nullif(btrim(p_discovery ->> 'source_preferences_hash'), ''),
    'e4c7458abb77f59d62720fa17e2e3a041739c6c6a884f9938447753345f4122f'
  );
  if char_length(v_hash) is distinct from 64 then
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
      unmatched_requirements,
      source_preferences,
      source_preferences_hash
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
      coalesce(p_discovery -> 'unmatched_requirements', '[]'::jsonb),
      v_prefs,
      v_hash
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
      unmatched_requirements = coalesce(p_discovery -> 'unmatched_requirements', '[]'::jsonb),
      source_preferences = v_prefs,
      source_preferences_hash = v_hash
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
    v_image_evidence = case
      when jsonb_typeof(v_item -> 'image_evidence') = 'array' then v_item -> 'image_evidence'
      else '[]'::jsonb
    end;

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
      is_confirmed,
      image_evidence,
      reference_status
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
      false,
      v_image_evidence,
      'pending'
    );
  end loop;

  return v_discovery_id;
end;
$$;
