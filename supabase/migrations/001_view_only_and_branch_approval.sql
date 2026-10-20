-- View-only accounts and branch approval.
--
-- View only: someone who joins with a branch's viewer link sees how the
-- branch runs but can't change anything, and never sees contacts, follow-ups,
-- money, availability or imports. Writes are refused here, in the database,
-- not just hidden in the app.
--
-- Approval: on a copy shared by several branches, a new branch waits until
-- an admin approves it. The first branch on a fresh copy is approved at once
-- and whoever starts it becomes the copy's admin.

alter table public.profiles add column if not exists view_only boolean not null default false;
alter table public.branches add column if not exists approved boolean not null default true;
alter table public.branches add column if not exists viewer_code text unique;
alter table public.branches alter column district set default '';

create or replace function public.is_view_only()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select view_only from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function public.is_view_only() from public, anon;
grant execute on function public.is_view_only() to authenticated;

-- Role and view_only change only through the general secretary or the branch functions below.
create or replace function public.protect_role_column()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.view_only is distinct from old.view_only)
     and not public.has_role('general_secretary')
     and coalesce(current_setting('app.branch_setup', true), '') <> 'on' then
    new.role := old.role;
    new.view_only := old.view_only;
  end if;
  return new;
end;
$$;

create or replace function public.create_branch(p_name text, p_district text default '')
returns json language plpgsql security definer set search_path = public as $$
declare b public.branches; n text := left(trim(p_name), 80); first boolean;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'Sign in first'); end if;
  if public.my_branch() is not null then return json_build_object('ok', false, 'error', 'You''re already in a branch'); end if;
  if n = '' then return json_build_object('ok', false, 'error', 'Name the branch'); end if;
  first := not exists (select 1 from public.branches);
  insert into public.branches (name, district, created_by, approved)
  values (n, coalesce(trim(p_district), ''), auth.uid(), first or public.is_admin())
  returning * into b;
  perform set_config('app.branch_setup', 'on', true);
  update public.profiles
     set branch_id = b.id,
         is_admin = is_admin or first,
         role = (select array_agg(distinct x) from unnest(role || array['general_secretary', 'member']) as x)
   where id = auth.uid();
  perform set_config('app.branch_setup', '', true);
  return json_build_object('ok', true, 'id', b.id, 'name', b.name, 'join_code', b.join_code, 'approved', b.approved);
end $$;

-- The member code makes you a member; the viewer code makes you view only.
create or replace function public.join_branch(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare b public.branches; c text := upper(trim(p_code)); viewer boolean;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'Sign in first'); end if;
  if public.my_branch() is not null then return json_build_object('ok', false, 'error', 'You''re already in a branch'); end if;
  select * into b from public.branches where join_code = c or viewer_code = c;
  if b.id is null then return json_build_object('ok', false, 'error', 'That code doesn''t match a branch. Check it with whoever gave it to you'); end if;
  viewer := b.viewer_code = c;
  perform set_config('app.branch_setup', 'on', true);
  update public.profiles set branch_id = b.id, view_only = viewer, role = case when viewer then array['member'] else role end
   where id = auth.uid();
  perform set_config('app.branch_setup', '', true);
  return json_build_object('ok', true, 'id', b.id, 'name', b.name, 'view_only', viewer);
end $$;

create or replace function public.branch_for_code(p_code text)
returns text language sql stable security definer set search_path = public as $$
  select name from public.branches where join_code = upper(trim(p_code)) or viewer_code = upper(trim(p_code));
$$;

-- General secretary: turn the viewer link on (a fresh code) or off.
create or replace function public.set_viewer_code(p_on boolean)
returns text language plpgsql security definer set search_path = public as $$
declare c text := case when p_on then 'V' || upper(substr(md5(random()::text), 1, 7)) end;
begin
  if not public.has_role('general_secretary') or public.my_branch() is null then raise exception 'Only the general secretary can do that'; end if;
  update public.branches set viewer_code = c where id = public.my_branch();
  return c;
end $$;
revoke execute on function public.set_viewer_code(boolean) from public, anon;
grant execute on function public.set_viewer_code(boolean) to authenticated;

create or replace function public.admin_branches()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', id, 'name', name, 'district', district, 'approved', approved, 'created_at', created_at) order by approved, name), '[]'::json)
  from public.branches where public.is_admin();
$$;

create or replace function public.approve_branch(p_branch uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return json_build_object('ok', false, 'error', 'Admins only'); end if;
  update public.branches set approved = true where id = p_branch;
  return json_build_object('ok', found);
end $$;
revoke execute on function public.approve_branch(uuid) from public, anon;
grant execute on function public.approve_branch(uuid) to authenticated;

-- View-only accounts write nothing, except their own profile (name, first-run steps).
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists "view only: no insert" on public.%I', t);
    execute format('drop policy if exists "view only: no update" on public.%I', t);
    execute format('drop policy if exists "view only: no delete" on public.%I', t);
    execute format('create policy "view only: no insert" on public.%I as restrictive for insert to authenticated with check (not public.is_view_only())', t);
    if t = 'profiles' then
      execute 'create policy "view only: no update" on public.profiles as restrictive for update to authenticated using (not public.is_view_only() or id = auth.uid())';
    else
      execute format('create policy "view only: no update" on public.%I as restrictive for update to authenticated using (not public.is_view_only())', t);
    end if;
    execute format('create policy "view only: no delete" on public.%I as restrictive for delete to authenticated using (not public.is_view_only())', t);
  end loop;
end $$;

-- Private to the branch's members: never shown to view-only accounts.
do $$
declare t text;
begin
  foreach t in array array['contacts', 'follow_ups', 'transactions', 'pledges', 'availability', 'imports', 'import_rows',
                           'import_requests', 'role_requests', 'feedback', 'event_invites', 'reading_group_contacts',
                           'share_rsvps', 'activity_log', 'push_log']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "view only: hidden" on public.%I', t);
      execute format('create policy "view only: hidden" on public.%I as restrictive for select to authenticated using (not public.is_view_only())', t);
    end if;
  end loop;
end $$;
