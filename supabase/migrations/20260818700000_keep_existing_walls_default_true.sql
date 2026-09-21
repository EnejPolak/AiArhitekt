-- Align keep_existing_walls DEFAULT with application behavior (true for new projects).
-- Does not rewrite existing project_room_preferences.keep_existing_walls values.
-- Does not change RLS, grants, other columns, or existing row data.

alter table public.project_room_preferences
  alter column keep_existing_walls set default true;
