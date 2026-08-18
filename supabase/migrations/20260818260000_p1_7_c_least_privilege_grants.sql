-- P1.7c: least-privilege table GRANTs for trusted commerce/render tables.
-- Does not rewrite P1.1–P1.7b history.
-- Default privileges grant authenticated ALL on new public tables; P1.7b
-- granted SELECT without first revoking those extras.

-- ---------------------------------------------------------------------------
-- project_room_renders: authenticated SELECT only
-- ---------------------------------------------------------------------------

revoke all on table public.project_room_renders from public;
revoke all on table public.project_room_renders from anon;
revoke all on table public.project_room_renders from authenticated;
grant select on table public.project_room_renders to authenticated;
grant select, insert, update, delete on table public.project_room_renders to service_role;

-- ---------------------------------------------------------------------------
-- project_product_discoveries: authenticated SELECT + DELETE (cascade cleanup)
-- Canonical inserts remain service_role persist RPC only.
-- ---------------------------------------------------------------------------

revoke all on table public.project_product_discoveries from public;
revoke all on table public.project_product_discoveries from anon;
revoke all on table public.project_product_discoveries from authenticated;
grant select, delete on table public.project_product_discoveries to authenticated;
grant select, insert, update, delete on table public.project_product_discoveries to service_role;

-- ---------------------------------------------------------------------------
-- project_product_selections: authenticated SELECT + UPDATE(is_confirmed)
-- ---------------------------------------------------------------------------

revoke all on table public.project_product_selections from public;
revoke all on table public.project_product_selections from anon;
revoke all on table public.project_product_selections from authenticated;
grant select on table public.project_product_selections to authenticated;
grant update (is_confirmed) on table public.project_product_selections to authenticated;
grant select, insert, update, delete on table public.project_product_selections to service_role;

-- ---------------------------------------------------------------------------
-- project_product_reference_assets: authenticated SELECT + DELETE
-- Canonical upserts remain service_role persist RPC only.
-- ---------------------------------------------------------------------------

revoke all on table public.project_product_reference_assets from public;
revoke all on table public.project_product_reference_assets from anon;
revoke all on table public.project_product_reference_assets from authenticated;
grant select, delete on table public.project_product_reference_assets to authenticated;
grant select, insert, update, delete on table public.project_product_reference_assets to service_role;
