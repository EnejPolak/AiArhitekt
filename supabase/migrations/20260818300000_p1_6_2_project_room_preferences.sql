-- P1.6.2: canonical per-project room wizard preferences.
-- Does not rewrite P1.1–P1.6.1 history.
-- Discovery source_preferences remains an audit snapshot, not the live source of truth.

create or replace function public.project_room_preference_styles_valid(styles jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(styles) = 'array'
    and jsonb_array_length(styles) <= 8
    and not exists (
      select 1
      from jsonb_array_elements(styles) as elem(value)
      where jsonb_typeof(elem.value) is distinct from 'string'
         or char_length(btrim(elem.value #>> '{}')) not between 1 and 80
    );
$$;

comment on function public.project_room_preference_styles_valid(jsonb) is
  'selected_styles must be a JSON array of at most 8 non-empty strings (1–80 chars).';

create table public.project_room_preferences (
  project_id uuid primary key references public.projects (id) on delete cascade,
  room_type text null,
  selected_styles jsonb not null default '[]'::jsonb,
  budget_level text null,
  wall_main_color text not null default '',
  wall_accent_color text not null default '',
  flooring text not null default 'keep',
  underfloor_heating boolean not null default false,
  bed_type text not null default 'none',
  notes text not null default '',
  keep_existing_walls boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_room_preferences_room_type_ok
    check (
      room_type is null
      or room_type in ('kitchen', 'bathroom', 'bedroom', 'living-room', 'other')
    ),
  constraint project_room_preferences_budget_level_ok
    check (
      budget_level is null
      or budget_level in ('budget-friendly', 'balanced', 'premium', 'not-sure')
    ),
  constraint project_room_preferences_flooring_ok
    check (flooring in ('keep', 'hardwood', 'laminate', 'tiles', 'marble')),
  constraint project_room_preferences_bed_type_ok
    check (bed_type in ('none', 'king', 'queen', 'bunk', 'single')),
  constraint project_room_preferences_styles_ok
    check (public.project_room_preference_styles_valid(selected_styles)),
  constraint project_room_preferences_wall_main_color_len
    check (char_length(wall_main_color) <= 80),
  constraint project_room_preferences_wall_accent_color_len
    check (char_length(wall_accent_color) <= 80),
  constraint project_room_preferences_notes_len
    check (char_length(notes) <= 400)
);

comment on table public.project_room_preferences is
  'Canonical current room-renovation wizard preferences. One row per project. Product discovery and render derive subsets from this row. project_product_discoveries.source_preferences is an audit snapshot of the shopping subset used for that run.';
comment on column public.project_room_preferences.selected_styles is
  'User-selected style ids as a JSON string array. Order may match the wizard; shopping identity sorts and lowercases separately.';
comment on column public.project_room_preferences.notes is
  'Free-text render notes. Not part of the shopping discovery hash.';
comment on column public.project_room_preferences.budget_level is
  'Budget signal for render. Not part of the shopping discovery hash.';

create or replace function public.set_project_room_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_room_preferences_set_updated_at
before update on public.project_room_preferences
for each row
execute function public.set_project_room_preferences_updated_at();

-- One-time recovery: copy validated shopping fields from discovery audit snapshots.
-- Does not overwrite an existing preferences row. Does not treat discovery as ongoing source of truth.
insert into public.project_room_preferences (
  project_id,
  selected_styles,
  wall_main_color,
  wall_accent_color,
  flooring,
  underfloor_heating,
  bed_type,
  keep_existing_walls
)
select
  d.project_id,
  case
    when public.project_room_preference_styles_valid(d.source_preferences -> 'selectedStyles')
      then d.source_preferences -> 'selectedStyles'
    else '[]'::jsonb
  end,
  left(btrim(coalesce(d.source_preferences ->> 'wallMainColor', '')), 80),
  left(btrim(coalesce(d.source_preferences ->> 'wallAccentColor', '')), 80),
  case
    when d.source_preferences ->> 'flooring' in ('keep', 'hardwood', 'laminate', 'tiles', 'marble')
      then d.source_preferences ->> 'flooring'
    else 'keep'
  end,
  case
    when jsonb_typeof(d.source_preferences -> 'underfloorHeating') = 'boolean'
      then (d.source_preferences ->> 'underfloorHeating')::boolean
    else false
  end,
  case
    when d.source_preferences ->> 'bedType' in ('none', 'king', 'queen', 'bunk', 'single')
      then d.source_preferences ->> 'bedType'
    else 'none'
  end,
  case
    when jsonb_typeof(d.source_preferences -> 'keepExistingWalls') = 'boolean'
      then (d.source_preferences ->> 'keepExistingWalls')::boolean
    else false
  end
from public.project_product_discoveries d
inner join public.projects p
  on p.id = d.project_id
where p.project_type = 'room-renovation'
  and not exists (
    select 1
    from public.project_room_preferences existing
    where existing.project_id = d.project_id
  );

alter table public.project_room_preferences enable row level security;
alter table public.project_room_preferences force row level security;

revoke all on table public.project_room_preferences from public;
revoke all on table public.project_room_preferences from anon;
grant select, insert, update, delete on table public.project_room_preferences to authenticated;
grant select, insert, update, delete on table public.project_room_preferences to service_role;

create policy project_room_preferences_select_own
on public.project_room_preferences
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

create policy project_room_preferences_insert_own
on public.project_room_preferences
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

create policy project_room_preferences_update_own
on public.project_room_preferences
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

create policy project_room_preferences_delete_own
on public.project_room_preferences
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
