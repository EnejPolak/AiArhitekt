-- P1.6.3: canonical project search location on room preferences.
-- Discovery rows keep a snapshot of the run; this is the live source of truth.

alter table public.project_room_preferences
  add column if not exists location_input text,
  add column if not exists formatted_address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists radius_km integer,
  add column if not exists country_code text;

alter table public.project_room_preferences
  drop constraint if exists project_room_preferences_location_input_len,
  drop constraint if exists project_room_preferences_formatted_address_len,
  drop constraint if exists project_room_preferences_latitude_range,
  drop constraint if exists project_room_preferences_longitude_range,
  drop constraint if exists project_room_preferences_radius_km_range,
  drop constraint if exists project_room_preferences_country_code_ok,
  drop constraint if exists project_room_preferences_location_coords_together;

alter table public.project_room_preferences
  add constraint project_room_preferences_location_input_len
    check (location_input is null or char_length(btrim(location_input)) between 3 and 500),
  add constraint project_room_preferences_formatted_address_len
    check (formatted_address is null or char_length(formatted_address) <= 500),
  add constraint project_room_preferences_latitude_range
    check (latitude is null or (latitude >= -90 and latitude <= 90)),
  add constraint project_room_preferences_longitude_range
    check (longitude is null or (longitude >= -180 and longitude <= 180)),
  add constraint project_room_preferences_radius_km_range
    check (radius_km is null or (radius_km between 1 and 50)),
  add constraint project_room_preferences_country_code_ok
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add constraint project_room_preferences_location_coords_together
    check (
      (latitude is null and longitude is null)
      or (
        latitude is not null
        and longitude is not null
        and location_input is not null
        and radius_km is not null
      )
    );

comment on column public.project_room_preferences.location_input is
  'User-entered search location. Live source of truth for discovery and contractors.';
comment on column public.project_room_preferences.formatted_address is
  'Geocoder formatted address when available.';
comment on column public.project_room_preferences.latitude is
  'Persisted search latitude. Discovery must not re-geocode when this is valid.';
comment on column public.project_room_preferences.longitude is
  'Persisted search longitude.';
comment on column public.project_room_preferences.radius_km is
  'Search radius in km. Authoritative range is 1–50, matching Places.';

-- Recover location from the latest discovery snapshot when the live row is empty.
update public.project_room_preferences p
set
  location_input = btrim(d.location_input),
  formatted_address = btrim(d.location_input),
  latitude = d.latitude,
  longitude = d.longitude,
  radius_km = least(50, greatest(1, d.radius_km))
from public.project_product_discoveries d
where d.project_id = p.project_id
  and p.latitude is null
  and d.latitude is not null
  and d.longitude is not null
  and char_length(btrim(d.location_input)) between 3 and 500;
