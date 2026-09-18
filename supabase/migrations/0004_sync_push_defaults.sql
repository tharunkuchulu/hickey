-- Hotfix 18 Sep 2026: cloud sync at the cafe stalled from 19:39 IST with
--   null value in column "is_favourite" of relation "items" violates not-null constraint
-- jsonb_populate_recordset() yields NULL for every key the payload does not carry, so a NOT NULL column
-- added to the cloud after a terminal's version (0003: is_favourite) or left out of an outbox row
-- (saveItem in v0.2.0/v0.3.0 built the row without isFavourite) poisons that batch — and every bill
-- after it waits behind the retry. Fix: fill missing/null values with the column default. Only NOT NULL
-- columns have defaults in this schema, so no intentional NULL is ever overwritten.
create or replace function sync_push(p_token text, p_table text, p_rows jsonb)
returns int language plpgsql security definer as $$
declare
  dev devices;
  n int := 0;
  cols text;
  vals text;
  set_clause text;
begin
  select * into dev from device_for_token(p_token);
  if dev.id is null then raise exception 'invalid device token' using errcode = '28000'; end if;
  if p_table not in ('users','categories','items','item_variants','addon_groups','addons','dining_tables','orders','order_items',
    'kots','payments','cash_register_sessions','customers','item_notes','cash_movements','audit_log') then
    raise exception 'table % is not syncable', p_table;
  end if;

  -- Column list of the target table minus org_id (stamped from the device); values fall back to the column default.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(case when column_default is not null
                         then format('coalesce(r.%I, %s)', column_name, column_default)
                         else 'r.' || quote_ident(column_name) end, ', ' order by ordinal_position),
         string_agg(quote_ident(column_name) || ' = excluded.' || quote_ident(column_name), ', ' order by ordinal_position)
    into cols, vals, set_clause
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table and column_name <> 'org_id';

  execute format(
    'insert into %I (org_id, %s) select $1, %s from jsonb_populate_recordset(null::%I, $2) as r on conflict (id) do update set %s',
    p_table, cols, vals, p_table, set_clause)
  using dev.org_id, p_rows;
  get diagnostics n = row_count;

  update devices set last_seen_at = now() where id = dev.id;
  return n;
end $$;
grant execute on function sync_push(text, text, jsonb) to anon, authenticated;
