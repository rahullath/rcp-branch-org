-- ===================== v29: saved WhatsApp / Instagram links for QR codes on graphics =====================
-- One row per branch. Anyone in the branch can read; social media officer, organizer or GS can change.
create table if not exists public.branch_links (
  branch_id uuid primary key default public.my_branch() references public.branches (id) on delete cascade,
  whatsapp text,
  instagram text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.branch_links enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'branch_links' and policyname = 'branch reads') then
    create policy "branch reads" on public.branch_links for select to authenticated using (branch_id = public.my_branch());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'branch_links' and policyname = 'social writes') then
    create policy "social writes" on public.branch_links for all to authenticated
      using (branch_id = public.my_branch() and (public.has_role('social_media_officer') or public.has_role('organizer') or public.has_role('general_secretary')))
      with check (branch_id = public.my_branch() and (public.has_role('social_media_officer') or public.has_role('organizer') or public.has_role('general_secretary')));
  end if;
end $$;
