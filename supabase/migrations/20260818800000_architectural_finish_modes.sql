-- Explicit architectural finish modes for project_room_preferences.
-- Defaults apply to NEW rows only. Existing rows stay NULL (not rewritten).
-- Does not change RLS, grants, other columns, or existing row data.

alter table public.project_room_preferences
  add column if not exists wall_finish_mode text,
  add column if not exists floor_finish_mode text;

alter table public.project_room_preferences
  alter column wall_finish_mode set default 'keep_existing',
  alter column floor_finish_mode set default 'keep_existing';

alter table public.project_room_preferences
  drop constraint if exists project_room_preferences_wall_finish_mode_ok;

alter table public.project_room_preferences
  drop constraint if exists project_room_preferences_floor_finish_mode_ok;

alter table public.project_room_preferences
  add constraint project_room_preferences_wall_finish_mode_ok
    check (
      wall_finish_mode is null
      or wall_finish_mode in ('keep_existing', 'concept_color', 'exact_product')
    );

alter table public.project_room_preferences
  add constraint project_room_preferences_floor_finish_mode_ok
    check (
      floor_finish_mode is null
      or floor_finish_mode in ('keep_existing', 'exact_product')
    );

comment on column public.project_room_preferences.wall_finish_mode is
  'Requested wall finish: keep_existing | concept_color | exact_product. NULL on legacy rows; inferred in application, not backfilled.';

comment on column public.project_room_preferences.floor_finish_mode is
  'Requested floor finish: keep_existing | exact_product. NULL on legacy rows; inferred in application, not backfilled.';
