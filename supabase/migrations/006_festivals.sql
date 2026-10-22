-- Festival details (name, days, place, link): set by an admin, read by everyone signed in.
create table if not exists public.festivals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  location text,
  url text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
alter table public.festivals enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'festivals' and policyname = 'signed in reads') then
    create policy "signed in reads" on public.festivals for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'festivals' and policyname = 'admin writes') then
    create policy "admin writes" on public.festivals for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
