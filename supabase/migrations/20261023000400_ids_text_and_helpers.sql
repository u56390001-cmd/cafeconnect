-- Firestore used opaque string document ids everywhere (ids like
-- o_<idempotencyKey>, а-я gen ids, legacy uids) so every id/PK/FK column
-- becomes TEXT. Policies are dropped first (they pin column types),
-- FKs are dropped and re-added after the type sweep.

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
    execute format('drop policy if exists %I_member_all on %I', t, t);
  end loop;
end $$;

drop policy if exists tenants_member_read on tenants;
drop policy if exists whatsapp_event_log_member_read on whatsapp_event_log;

do $$
declare r record;
begin
  for r in
    select constraint_name, table_name
    from information_schema.table_constraints
    where constraint_type = 'FOREIGN KEY' and table_schema = 'public'
  loop
    execute format('alter table %I drop constraint %I', r.table_name, r.constraint_name);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and data_type = 'uuid'
      and (column_name = 'id'
           or column_name like '%\_id'
           or column_name like '%\_by')
  loop
    execute format(
      'alter table %I.%I alter column %I type text',
      'public', r.table_name, r.column_name
    );
  end loop;
end $$;

do $$
declare r record;
begin
  for r in
    select table_name, column_name, column_default
    from information_schema.columns
    where table_schema = 'public'
      and column_default like 'gen_random_uuid()'
  loop
    execute format(
      'alter table %I.%I alter column %I set default gen_random_uuid()::text',
      'public', r.table_name, r.column_name
    );
  end loop;
end $$;

-- restore the core relational edges
alter table orders add constraint orders_tenant_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

alter table order_numbers add constraint order_numbers_tenant_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

alter table tenant_members add constraint tenant_members_tenant_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

alter table tenant_profiles add constraint tenant_profiles_tenant_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

alter table tenant_settings add constraint tenant_settings_tenant_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

alter table carts add constraint carts_tenant_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

alter table conversations add constraint conversations_tenant_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

alter table conversation_messages add constraint conversation_messages_convo_fk
  foreign key (conversation_id) references conversations(id) on delete cascade;

alter table conversation_messages add constraint conversation_messages_tenant_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

alter table customers add constraint customers_tenant_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

alter table menu_categories add constraint menu_categories_tenant_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

alter table menu_items add constraint menu_items_tenant_fk
  foreign key (tenant_id) references tenants(id) on delete cascade;

alter table menu_items add constraint menu_items_category_fk
  foreign key (category_id) references menu_categories(id) on delete set null;

alter table carts add constraint carts_conversation_fk
  foreign key (conversation_id) references conversations(id) on delete set null;

-- is_tenant_member must match the new TEXT ids (auth.uid() is a uuid).
create or replace function is_tenant_member(tenant text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members m
    where m.tenant_id = tenant
      and m.user_id = auth.uid()::text
      and m.status = 'active'
  );
$$;

-- restore RLS policies on the converted id columns
create policy tenants_member_read on tenants for select
  using (is_tenant_member(id));

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

create policy whatsapp_event_log_member_read on whatsapp_event_log for select
  using (tenant_id is null or is_tenant_member(tenant_id));

-- ============ atomic helpers ============

-- Collision-free order-number reservation (replaces the Firestore
-- runTransaction in services/orders.ts).
create or replace function reserve_order_number(p_tenant text, p_currency text)
returns text language plpgsql as $$
declare
  v_candidate text;
  v_date text;
  v_attempt int;
begin
  v_date := to_char(now() at time zone 'utc', 'YYMMDD');
  for v_attempt in 1..6 loop
    v_candidate := 'TC-' || v_date || '-' || upper(encode(gen_random_bytes(4), 'hex'));
    insert into order_numbers (order_number, tenant_id, order_id, phone_hash, data)
    values (v_candidate, p_tenant, null, null,
            jsonb_build_object('currency', p_currency, 'orderNumber', v_candidate))
    on conflict (order_number) do nothing;
    if found then
      return v_candidate;
    end if;
  end loop;
  -- extremely unlikely fallback: longer random suffix
  return 'TC-' || v_date || '-' || upper(encode(gen_random_bytes(8), 'hex'));
end;
$$;

-- Atomic sliding-window rate limiter (replaces rate-limit transaction).
-- Returns {allowed, remaining, retryAfterMs}.
create or replace function take_rate_limit(p_key text, p_limit int, p_window_ms bigint)
returns jsonb language plpgsql as $$
declare
  v_hits jsonb;
  v_cutoff bigint;
  v_now_ms bigint;
  v_filtered jsonb;
  v_count int;
  v_reset_ms bigint;
begin
  v_now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_cutoff := v_now_ms - p_window_ms;

  select data -> 'hits' into v_hits
  from rate_limits where bucket_key = p_key for update;

  if v_hits is null then
    insert into rate_limits (bucket_key, data)
    values (p_key, jsonb_build_object('hits', '[]'::jsonb))
    on conflict (bucket_key) do nothing;
    v_hits := '[]'::jsonb;
  end if;

  v_filtered := jsonb_path_query_array(
    coalesce(v_hits, '[]'::jsonb),
    '$[*] ? (@.numeric() >= $cutoff)',
    jsonb_build_object('cutoff', to_jsonb(v_cutoff::numeric))
  );
  v_count := jsonb_array_length(v_filtered);

  if v_count >= p_limit then
    v_reset_ms := ((v_filtered -> 0)::text)::bigint + p_window_ms;
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retryAfterMs', greatest(v_reset_ms - v_now_ms, 1000)
    );
  end if;

  update rate_limits
  set data = jsonb_build_object('hits', v_filtered || jsonb_build_array(v_now_ms)),
      updated_at = now()
  where bucket_key = p_key;

  return jsonb_build_object('allowed', true, 'remaining', p_limit - v_count - 1);
end;
$$;
