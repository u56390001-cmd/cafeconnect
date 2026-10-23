-- Media delivery needs to resolve an image asset id back to the menu item
-- that carries it. PostgREST cannot filter data jsonb array-of-object
-- fields from query params, so expose a small security-definer RPC for the
-- media route (service-role restricted).
create or replace function public.find_menu_item_by_asset(p_asset_id text)
returns table (out_item_id text, out_tenant_id text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    data ->> 'itemId' as out_item_id,
    tenant_id as out_tenant_id
  from menu_items
  where data @> jsonb_build_object(
    'imageReferences',
    jsonb_build_array(jsonb_build_object('assetId', p_asset_id))
  )
  limit 1;
$$;

revoke execute on function public.find_menu_item_by_asset(text) from public, anon, authenticated;
grant execute on function public.find_menu_item_by_asset(text) to service_role;
