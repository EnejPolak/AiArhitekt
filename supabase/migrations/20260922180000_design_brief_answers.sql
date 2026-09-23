-- Additive Design Brief answers. Empty object is a no-op so existing projects
-- keep current discovery identity and product selections.

alter table public.project_room_preferences
  add column if not exists design_brief_answers jsonb not null default '{}'::jsonb;

alter table public.project_room_preferences
  drop constraint if exists project_room_preferences_design_brief_answers_object;

alter table public.project_room_preferences
  add constraint project_room_preferences_design_brief_answers_object
  check (jsonb_typeof(design_brief_answers) = 'object');

comment on column public.project_room_preferences.design_brief_answers is
  'Schema-versioned adaptive Design Brief answers. Does not store product selections or cached references.';
