-- Level-3 Firestore subcollections that live under a parent doc:
--   conversations/{id}/turnMetrics  -> turn_metrics
--   customers/{id}/memories         -> customer_memories
-- plus the root-level session/mapping stores Firebase used.

create table turn_metrics (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  conversation_id text not null references conversations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index turn_metrics_convo on turn_metrics (conversation_id, created_at desc);

create table customer_memories (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  customer_id text not null references customers(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_memories_customer on customer_memories (customer_id);

create table meta_phone_numbers (
  id text primary key,
  tenant_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table whatsapp_sessions (
  id text primary key,
  tenant_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- new tables need RLS
alter table turn_metrics enable row level security;
alter table customer_memories enable row level security;
alter table meta_phone_numbers enable row level security;
alter table whatsapp_sessions enable row level security;

create policy turn_metrics_member_all on turn_metrics
  for all using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));
create policy customer_memories_member_all on customer_memories
  for all using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));
create policy meta_phone_numbers_member_all on meta_phone_numbers
  for all using (tenant_id is null or is_tenant_member(tenant_id))
  with check (tenant_id is null or is_tenant_member(tenant_id));
create policy whatsapp_sessions_member_all on whatsapp_sessions
  for all using (tenant_id is null or is_tenant_member(tenant_id))
  with check (tenant_id is null or is_tenant_member(tenant_id));
