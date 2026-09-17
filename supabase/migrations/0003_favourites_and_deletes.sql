-- 1. Favourites rail on the billing screen (mirrors the SQLite column added in v0.2.0).
alter table items add column if not exists is_favourite boolean not null default false;

-- 2. Row deletes from the counter (e.g. a payment leg removed when the payment mode is corrected after billing).
--    Same token gate as sync_push; only rows of the device's own org can be removed.
create or replace function sync_delete(p_token text, p_table text, p_ids text[])
returns int language plpgsql security definer as $$
declare
  dev devices;
  n int := 0;
begin
  select * into dev from device_for_token(p_token);
  if dev.id is null then raise exception 'invalid device token' using errcode = '28000'; end if;
  if p_table not in ('payments','order_items','kots','cash_movements','item_variants','addons','item_notes') then
    raise exception 'table % does not accept deletes', p_table;
  end if;
  execute format('delete from %I where org_id = $1 and id = any($2)', p_table) using dev.org_id, p_ids;
  get diagnostics n = row_count;
  update devices set last_seen_at = now() where id = dev.id;
  return n;
end $$;
grant execute on function sync_delete(text, text, text[]) to anon, authenticated;
