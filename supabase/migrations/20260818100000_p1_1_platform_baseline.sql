-- P1.1 platform baseline.
--
-- Feature-phased schema: do not create unused tables before the feature that
-- needs them.
--
-- Deferred (not this migration):
--   P1.2  profiles (and auth wiring)
--   P1.3  projects — persist current_step_key text + flow_version int default 1
--         (never a brittle flow_step int)
--   P1.4  storage buckets; object paths projects/{projectId}/... (no userId in path)
--   P1.5  generated assets — asset_kind = render | mask + is_selected boolean
--         (one canonical selection state; do not also use variant = selected)
--   P1.6  jobs (polling-first Replicate); optional signed webhooks
--
-- Auth schema is managed by Supabase, not this file.
-- Storage ownership is database/RLS-driven, not encoded in object paths.

comment on schema public is
  'AI Architect application schema. P1.1: no application tables yet.';
