-- Row Level Security: the server always talks with the service-role key
-- (mirroring the old Firebase Admin SDK). RLS below is the seatbelt for
-- anything speaking with the anon key directly (browser).
-- Server routes enforce scoping explicitly via tenant_members checks.

alter table tenants enable row level security;
alter table tenant_members enable row level security;
alter table users_profiles enable row level security;
alter table tenant_profiles enable row level security;
alter table tenant_settings enable row level security;
alter table orders enable row level security;
alter table order_numbers enable row level security;
alter table carts enable row level security;
alter table conversations enable row level security;
alter table conversation_messages enable row level security;
alter table customers enable row level security;
alter table customer_identities enable row level security;
alter table memory_jobs enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table offers enable row level security;
alter table knowledge_base enable row level security;
alter table bookings enable row level security;
alter table whatsapp_inbox enable row level security;
alter table whatsapp_event_log enable row level security;
alter table whatsapp_settings enable row level security;
alter table qr_webhook_tokens enable row level security;
alter table widget_configs enable row level security;
alter table widget_events enable row level security;
alter table api_keys enable row level security;
alter table rate_limits enable row level security;

-- helper: is the caller an active member of the tenant?
create or replace function is_tenant_member(tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members m
    where m.tenant_id = tenant
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- tenants: readable by members; members rows only by their user
create policy tenants_member_read on tenants for select
  using (is_tenant_member(id));

create policy tenant_members_self on tenant_members for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy users_self on users_profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- per-tenant tables: full member access (role checks stay server-side, like requireTenantScope)
do $$
declare t text;
begin
  foreach t in array array[
    'tenant_profiles','tenant_settings','orders','order_numbers','carts',
    'conversations','conversation_messages','customers','customer_identities',
    'memory_jobs','menu_categories','menu_items','offers','knowledge_base',
    'bookings','whatsapp_inbox','whatsapp_settings','qr_webhook_tokens',
    'widget_configs','widget_events','api_keys'
  ] loop
    execute format('create policy %I_member_all on %I for all using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));', t, t);
  end loop;
end $$;

-- append-only logs: members may read
create policy whatsapp_event_log_member_read on whatsapp_event_log for select
  using (tenant_id is null or is_tenant_member(tenant_id));
create policy rate_limits_no_direct on rate_limits for select using (false);
