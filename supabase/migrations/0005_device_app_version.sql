-- Which version is each counter actually running, and what is its updater doing?
-- Until now that could only be answered by walking to the counter and reading ☰ → Version, so a terminal could
-- sit on an old build (18 Sep 2026: v0.2.0 with the broken updater) for days without anyone noticing.
-- The POS now reports this with its normal sync traffic and the owner dashboard shows it next to the sync pill.
alter table devices add column if not exists app_version text;
alter table devices add column if not exists app_version_at timestamptz;   -- when that version first reported in
alter table devices add column if not exists update_state text;            -- "up to date" | "downloading 43%" | "0.3.4 ready" | "error: no internet"

create or replace function sync_device_info(p_token text, p_version text, p_update_state text default null)
returns jsonb language plpgsql security definer as $$
declare dev devices;
begin
  select * into dev from device_for_token(p_token);
  if dev.id is null then raise exception 'invalid device token' using errcode = '28000'; end if;
  update devices
     set app_version = coalesce(p_version, app_version),
         app_version_at = case when p_version is not null and app_version is distinct from p_version then now() else app_version_at end,
         update_state = coalesce(p_update_state, update_state),
         last_seen_at = now()
   where id = dev.id;
  return jsonb_build_object('device', dev.label, 'version', p_version, 'server_time', now());
end $$;
grant execute on function sync_device_info(text, text, text) to anon, authenticated;
