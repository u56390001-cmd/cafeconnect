-- CafeConnect schema: Firestore collections -> Postgres (Supabase).
-- Document payloads keep their Firestore shape in `data` jsonb so the
-- server services preserve response formats; scalar columns exist only
-- where the app filters, orders or enforces uniqueness.

create extension if not exists pgcrypto;

-- ============ tenants & access ============

create table tenants (
  id uuid primary key,
  business_name text not null,
  business_type text[] not null default '{}',
  status text not null default 'pending_setup',
  owner_user_id uuid,
  country text not null default 'PK',
  currency text not null default 'PKR',
  timezone text not null default 'Asia/Karachi',
  enabled_modules text[] not null default '{chat}',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_members (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'owner',
  status text not null default 'active',
  invited_by uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user on tenant_members (user_id);

create table users_profiles (
  id uuid primary key,
  email text unique,
  display_name text,
  photo_url text,
  tenant_id uuid references tenants(id) on delete set null,
  role text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- profile/main + settings/{key}
create table tenant_profiles (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  business_name text,
  business_type text[],
  country text,
  timezone text,
  currency text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_settings (
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

-- ============ orders ============

create table orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_number text not null,
  channel text not null default 'web',
  status text not null default 'received',
  payment_status text not null default 'unpaid',
  currency text not null default 'PKR',
  subtotal_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  delivery_fee_minor bigint not null default 0,
  total_minor bigint not null default 0,
  applied_offer text,
  customer jsonb not null default '{}'::jsonb,
  fulfilment jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  notes text,
  status_history jsonb not null default '[]'::jsonb,
  payment_history jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index orders_tenant_number on orders (tenant_id, order_number);
create index orders_tenant_created on orders (tenant_id, created_at desc);
create index orders_tenant_status on orders (tenant_id, status);

-- unique global order-number index (was Firestore orderNumbers docs)
create table order_numbers (
  order_number text primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  phone_hash text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index order_numbers_tenant on order_numbers (tenant_id);

-- ============ carts ============

create table carts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel text not null default 'web',
  status text not null default 'active',
  conversation_id uuid,
  cart_revision bigint not null default 0,
  items jsonb not null default '[]'::jsonb,
  current_quote jsonb,
  fulfilment jsonb,
  customer jsonb,
  last_order_number text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);
create index carts_tenant_updated on carts (tenant_id, updated_at desc);
create index carts_status on carts (tenant_id) where status in ('active', 'awaiting_confirmation');

-- ============ conversations & messages ============

create table conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel text not null default 'web',
  status text not null default 'active',
  language text not null default 'en',
  customer jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_tenant_updated on conversations (tenant_id, updated_at desc);

create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null default 'customer', -- customer | assistant | system
  text text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index conversation_messages_convo on conversation_messages (conversation_id, created_at);
create index conversation_messages_tenant on conversation_messages (tenant_id, created_at desc);

-- ============ customers & identity & memory ============

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  phone_hash text not null,
  phone text,
  name text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_tenant_phone on customers (tenant_id, phone_hash);

create table customer_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_identities_tenant on customer_identities (tenant_id);

create table memory_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  status text not null default 'queued',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memory_jobs_tenant on memory_jobs (tenant_id, status);

-- ============ menu & catalogue ============

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  sort_order bigint not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_categories_tenant on menu_categories (tenant_id, sort_order);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  category_id uuid references menu_categories(id) on delete set null,
  name text not null,
  price_minor bigint not null default 0,
  enabled boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_items_tenant on menu_items (tenant_id);
create index menu_items_category on menu_items (category_id);

create table offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null default '',
  enabled boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index offers_tenant on offers (tenant_id);

-- ============ knowledge & support surface ============

create table knowledge_base (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_base_tenant on knowledge_base (tenant_id);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_name text,
  phone text,
  booking_date timestamptz,
  status text not null default 'pending',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_tenant_date on bookings (tenant_id, booking_date);

-- ============ whatsapp & widget ops ============

create table whatsapp_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index whatsapp_inbox_tenant on whatsapp_inbox (tenant_id, updated_at desc);

create table whatsapp_event_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index whatsapp_event_log_created on whatsapp_event_log (created_at desc);

create table whatsapp_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table qr_webhook_tokens (
  token text primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);
create index qr_webhook_tokens_tenant on qr_webhook_tokens (tenant_id);

create table widget_configs (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table widget_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null default 'event',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index widget_events_tenant on widget_events (tenant_id, created_at desc);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  key_hash text,
  label text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index api_keys_tenant on api_keys (tenant_id);

create table rate_limits (
  bucket_key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============ maintenance ============

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array[
    'tenants','tenant_members','users_profiles','tenant_profiles','tenant_settings',
    'orders','carts','conversations','customers','customer_identities','memory_jobs',
    'menu_categories','menu_items','offers','knowledge_base','bookings',
    'whatsapp_inbox','whatsapp_settings','qr_webhook_tokens','widget_configs','api_keys'
  ] loop
    execute format('create trigger set_updated_at_%s before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;
