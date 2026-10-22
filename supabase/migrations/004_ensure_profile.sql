-- ===================== v30: signed in but no profile row =====================
-- A login whose profile row is missing (made before the sign-up trigger, or the row was removed)
-- could sign in but nothing worked. This makes the missing row from auth.users, exactly as the
-- sign-up trigger does, and the app calls it once if a signed-in person has no profile.
create or replace function public.ensure_profile()
returns void language plpgsql security definer set search_path = public as $$
declare u auth.users%rowtype;
begin
  if auth.uid() is null then return; end if;
  select * into u from auth.users where id = auth.uid();
  if not found then return; end if;
  insert into public.profiles (id, name, email, branch_tag)
  values (u.id, coalesce(u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)), u.email, 'branch-2')
  on conflict (id) do nothing;
end;
$$;
revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
