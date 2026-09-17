-- Hickey cloud mirror — run once in the Supabase SQL editor (free tier is enough).
-- Mirrors the POS SQLite tables 1:1 (same names, snake_case columns) plus org scoping.
-- Security model:
--   * The POS never holds a service key. It calls sync_push() with a per-device token;
--     the function is SECURITY DEFINER and validates the token before writing.
--   * The owner dashboard signs in with Supabase Auth; RLS lets members read their org only.

create extension if not exists pgcrypto;

-- ---------- tenancy ----------
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'manager', 'viewer')),
  primary key (org_id, user_id)
);

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  label text not null,
  token_hash text not null,               -- sha256 of the device token
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- mirrored tables ----------
create table if not exists users (
  id text primary key, org_id uuid not null references orgs(id),
  name text not null, pin_hash text not null, role text not null, is_active boolean not null default true,
  created_at text not null, updated_at text not null, deleted_at text
);
create table if not exists categories (
  id text primary key, org_id uuid not null references orgs(id),
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at text not null, updated_at text not null, deleted_at text
);
create table if not exists items (
  id text primary key, org_id uuid not null references orgs(id),
  category_id text not null, name text not null, short_code text, price bigint not null default 0,
  food_type text not null default 'veg', is_active boolean not null default true, sort_order int not null default 0,
  addon_group_ids jsonb not null default '[]', created_at text not null, updated_at text not null, deleted_at text
);
create table if not exists item_variants (
  id text primary key, org_id uuid not null references orgs(id),
  item_id text not null, name text not null, price bigint not null, sort_order int not null default 0,
  is_active boolean not null default true, created_at text not null, updated_at text not null, deleted_at text
);
create table if not exists addon_groups (
  id text primary key, org_id uuid not null references orgs(id),
  name text not null, min_select int not null default 0, max_select int not null default 10, sort_order int not null default 0,
  created_at text not null, updated_at text not null, deleted_at text
);
create table if not exists addons (
  id text primary key, org_id uuid not null references orgs(id),
  group_id text not null, name text not null, price bigint not null default 0, is_active boolean not null default true,
  created_at text not null, updated_at text not null, deleted_at text
);
create table if not exists dining_tables (
  id text primary key, org_id uuid not null references orgs(id),
  name text not null, area text not null default 'Main', seats int not null default 4, sort_order int not null default 0,
  is_active boolean not null default true, created_at text not null, updated_at text not null, deleted_at text
);
create table if not exists orders (
  id text primary key, org_id uuid not null references orgs(id),
  device_id text not null, bill_no text, business_date text not null, order_type text not null, table_id text,
  status text not null, kot_no int, customer_name text, customer_phone text, customer_id text, notes text,
  discount_type text, discount_value bigint not null default 0, discount_reason text, charges bigint not null default 0,
  tax_percent int not null default 0, subtotal bigint not null default 0, discount bigint not null default 0,
  tax bigint not null default 0, round_off bigint not null default 0, total bigint not null default 0,
  cancel_reason text, print_count int not null default 0, created_by text,
  created_at text not null, updated_at text not null, printed_at text, settled_at text, ready_at text
);
create index if not exists orders_org_date_idx on orders (org_id, business_date);
create table if not exists order_items (
  id text primary key, org_id uuid not null references orgs(id),
  order_id text not null, item_id text, name text not null, variant_name text, unit_price bigint not null, qty int not null,
  addons jsonb not null default '[]', addons_total bigint not null default 0, line_total bigint not null, notes text,
  kot_no int, is_cancelled boolean not null default false, created_at text not null, updated_at text not null
);
create index if not exists order_items_org_order_idx on order_items (org_id, order_id);
create table if not exists kots (
  id text primary key, org_id uuid not null references orgs(id),
  device_id text not null, order_id text not null, kot_no int not null, business_date text not null,
  lines jsonb not null, created_at text not null, printed_at text
);
create table if not exists payments (
  id text primary key, org_id uuid not null references orgs(id),
  device_id text not null, order_id text not null, mode text not null, amount bigint not null, tendered bigint,
  reference text, created_at text not null
);
create index if not exists payments_org_order_idx on payments (org_id, order_id);
create table if not exists cash_register_sessions (
  id text primary key, org_id uuid not null references orgs(id),
  device_id text not null, business_date text not null, opened_by text, opened_at text not null,
  opening_cash bigint not null default 0, closed_by text, closed_at text, closing_cash bigint, expected_cash bigint,
  difference bigint, notes text, created_at text not null, updated_at text not null
);
create table if not exists customers (
  id text primary key, org_id uuid not null references orgs(id),
  name text not null, phone text, created_at text not null, updated_at text not null, deleted_at text
);
create table if not exists item_notes (
  id text primary key, org_id uuid not null references orgs(id),
  text text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at text not null, updated_at text not null, deleted_at text
);
create table if not exists cash_movements (
  id text primary key, org_id uuid not null references orgs(id),
  device_id text not null, business_date text not null, kind text not null, amount bigint not null, reason text,
  user_id text, created_at text not null, updated_at text not null, deleted_at text
);
create table if not exists audit_log (
  id text primary key, org_id uuid not null references orgs(id),
  device_id text not null, user_id text, action text not null, entity text not null, entity_id text,
  details jsonb, created_at text not null
);

-- ---------- RLS: members read their org; nobody writes directly ----------
do $$
declare t text;
begin
  foreach t in array array['orgs','org_members','devices','users','categories','items','item_variants','addon_groups','addons',
    'dining_tables','orders','order_items','kots','payments','cash_register_sessions','customers','item_notes','cash_movements','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_member_read', t);
  end loop;
end $$;

-- Membership lookup for policies. SECURITY DEFINER so it bypasses RLS: a policy on org_members that selected
-- from org_members would recurse ("infinite recursion detected in policy").
create or replace function my_org_ids()
returns setof uuid language sql security definer stable
set search_path = public as $$
  select org_id from org_members where user_id = auth.uid()
$$;
revoke all on function my_org_ids() from public, anon;
grant execute on function my_org_ids() to authenticated;

create policy orgs_member_read on orgs for select to authenticated
  using (id in (select my_org_ids()));
create policy org_members_member_read on org_members for select to authenticated
  using (user_id = auth.uid() or org_id in (select my_org_ids()));
create policy devices_member_read on devices for select to authenticated
  using (org_id in (select my_org_ids()));

do $$
declare t text;
begin
  foreach t in array array['users','categories','items','item_variants','addon_groups','addons','dining_tables','orders','order_items',
    'kots','payments','cash_register_sessions','customers','item_notes','cash_movements','audit_log']
  loop
    execute format(
      'create policy %I on %I for select to authenticated using (org_id in (select my_org_ids()))',
      t || '_member_read', t);
  end loop;
end $$;

-- ---------- device token helpers ----------
create or replace function device_for_token(p_token text)
returns devices language sql security definer stable as $$
  select * from devices where token_hash = encode(digest(p_token, 'sha256'), 'hex') limit 1;
$$;

-- Register a device and return its token ONCE. Run this from the SQL editor when setting up a counter.
create or replace function register_device(p_org_id uuid, p_label text)
returns text language plpgsql security definer as $$
declare tok text := encode(gen_random_bytes(24), 'hex');
begin
  insert into devices (org_id, label, token_hash) values (p_org_id, p_label, encode(digest(tok, 'sha256'), 'hex'));
  return tok;
end $$;
revoke all on function register_device(uuid, text) from public, anon, authenticated;

-- ---------- sync_push: upsert a batch of rows for one table ----------
create or replace function sync_push(p_token text, p_table text, p_rows jsonb)
returns int language plpgsql security definer as $$
declare
  dev devices;
  n int := 0;
  cols text;
  set_clause text;
begin
  select * into dev from device_for_token(p_token);
  if dev.id is null then raise exception 'invalid device token' using errcode = '28000'; end if;
  if p_table not in ('users','categories','items','item_variants','addon_groups','addons','dining_tables','orders','order_items',
    'kots','payments','cash_register_sessions','customers','item_notes','cash_movements','audit_log') then
    raise exception 'table % is not syncable', p_table;
  end if;

  -- Column list of the target table minus org_id (stamped from the device).
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(quote_ident(column_name) || ' = excluded.' || quote_ident(column_name), ', ' order by ordinal_position)
    into cols, set_clause
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table and column_name <> 'org_id';

  execute format(
    'insert into %I (org_id, %s) select $1, %s from jsonb_populate_recordset(null::%I, $2) as r on conflict (id) do update set %s',
    p_table, cols, cols, p_table, set_clause)
  using dev.org_id, p_rows;
  get diagnostics n = row_count;

  update devices set last_seen_at = now() where id = dev.id;
  return n;
end $$;
grant execute on function sync_push(text, text, jsonb) to anon, authenticated;

-- ---------- sync_pull_all: everything for the device's org (restore on a new machine) ----------
create or replace function sync_pull_all(p_token text)
returns jsonb language plpgsql security definer as $$
declare
  dev devices;
  out jsonb := '{}'::jsonb;
  t text;
  part jsonb;
begin
  select * into dev from device_for_token(p_token);
  if dev.id is null then raise exception 'invalid device token' using errcode = '28000'; end if;
  foreach t in array array['users','categories','items','item_variants','addon_groups','addons','dining_tables','orders','order_items',
    'kots','payments','cash_register_sessions','customers','item_notes','cash_movements','audit_log']
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''org_id''), ''[]''::jsonb) from %I x where org_id = $1', t) into part using dev.org_id;
    out := out || jsonb_build_object(t, part);
  end loop;
  return out;
end $$;
grant execute on function sync_pull_all(text) to anon, authenticated;

-- ---------- ping (keep-alive + connectivity test) ----------
create or replace function sync_ping(p_token text)
returns jsonb language plpgsql security definer as $$
declare dev devices;
begin
  select * into dev from device_for_token(p_token);
  if dev.id is null then raise exception 'invalid device token' using errcode = '28000'; end if;
  update devices set last_seen_at = now() where id = dev.id;
  return jsonb_build_object('org_id', dev.org_id, 'device', dev.label, 'server_time', now());
end $$;
grant execute on function sync_ping(text) to anon, authenticated;
