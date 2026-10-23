-- Adjust identity columns for mixed legacy (Firestore uid) and new
-- (Supabase Auth uuid) identifiers. All user references become TEXT.

drop policy if exists tenant_members_self on tenant_members;
drop policy if exists users_self on users_profiles;

alter table tenants alter column owner_user_id type text;
alter table tenant_members alter column invited_by type text;
alter table tenant_members alter column user_id type text;
create unique index if not exists tenant_members_position on tenant_members (tenant_id, user_id);

alter table users_profiles drop constraint users_profiles_pkey;
alter table users_profiles alter column id type text;
alter table users_profiles add primary key (id);

create policy tenant_members_self on tenant_members for all
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

create policy users_self on users_profiles for all
  using (id = auth.uid()::text)
  with check (id = auth.uid()::text);
