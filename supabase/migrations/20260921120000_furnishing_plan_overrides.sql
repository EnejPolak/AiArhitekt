-- User-approved furnishing plan overrides. Generated analysis remains observational.
-- Empty object is a no-op so existing projects keep current discovery identity.

alter table public.project_room_preferences
  add column if not exists furnishing_plan jsonb not null default '{}'::jsonb;

alter table public.project_room_preferences
  drop constraint if exists project_room_preferences_furnishing_plan_object;

alter table public.project_room_preferences
  add constraint project_room_preferences_furnishing_plan_object
  check (jsonb_typeof(furnishing_plan) = 'object');

comment on column public.project_room_preferences.furnishing_plan is
  'Schema-versioned user overrides for the AI furnishing plan (removed/added/accepted/edited requirement keys). Does not store product selections.';
