-- Fix: "infinite recursion detected in policy for relation org_members".
-- The 0001 policies looked up membership by selecting from org_members, whose own policy did the same.
-- my_org_ids() runs as the function owner (bypasses RLS), so policies can use it without recursing.
-- Safe to run on an existing project; 0001 has been updated the same way for fresh installs.

create or replace function my_org_ids()
returns setof uuid language sql security definer stable
set search_path = public as $$
  select org_id from org_members where user_id = auth.uid()
$$;
revoke all on function my_org_ids() from public, anon;
grant execute on function my_org_ids() to authenticated;

drop policy if exists orgs_member_read on orgs;
create policy orgs_member_read on orgs for select to authenticated
  using (id in (select my_org_ids()));

drop policy if exists org_members_member_read on org_members;
create policy org_members_member_read on org_members for select to authenticated
  using (user_id = auth.uid() or org_id in (select my_org_ids()));

drop policy if exists devices_member_read on devices;
create policy devices_member_read on devices for select to authenticated
  using (org_id in (select my_org_ids()));

do $$
declare t text;
begin
  foreach t in array array['users','categories','items','item_variants','addon_groups','addons','dining_tables','orders','order_items',
    'kots','payments','cash_register_sessions','customers','item_notes','cash_movements','audit_log']
  loop
    execute format('drop policy if exists %I on %I', t || '_member_read', t);
    execute format('create policy %I on %I for select to authenticated using (org_id in (select my_org_ids()))', t || '_member_read', t);
  end loop;
end $$;
