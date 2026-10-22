-- ===================== v35: announcements =====================
-- A card an officer pins for the branch: a title, some words, an optional button and link, an optional
-- deadline. Everyone in the branch reads; the social media officer, organizer and secretary write.
-- A person can dismiss one for themselves ("Got it"); that never affects anyone else.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null default public.my_branch() references public.branches (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  link text,
  link_label text,
  deadline date,
  ends_on date,
  tag text check (tag is null or tag ~ '^[a-z][a-z-]{0,29}$'),
  urgent boolean not null default false,
  signed_by text,
  archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'announcements' and policyname = 'branch reads') then
    create policy "branch reads" on public.announcements for select to authenticated using (branch_id = public.my_branch());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'announcements' and policyname = 'officers write') then
    create policy "officers write" on public.announcements for all to authenticated
      using (branch_id = public.my_branch() and (public.has_role('social_media_officer') or public.has_role('organizer') or public.has_role('general_secretary')))
      with check (branch_id = public.my_branch() and (public.has_role('social_media_officer') or public.has_role('organizer') or public.has_role('general_secretary')));
  end if;
end $$;

create table if not exists public.announcement_dismissals (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  primary key (user_id, announcement_id)
);
alter table public.announcement_dismissals enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'announcement_dismissals' and policyname = 'own rows') then
    create policy "own rows" on public.announcement_dismissals for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
