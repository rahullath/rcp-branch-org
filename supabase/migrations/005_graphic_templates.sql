-- ===================== v31: saved graphic designs =====================
-- One set per branch. Anyone in the branch can read; social media officer, organizer or secretary can save and remove.
create table if not exists public.graphic_templates (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null default public.my_branch() references public.branches (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  tpl text not null check (tpl in ('event', 'quote', 'reading', 'paper')),
  options jsonb not null default '{}'::jsonb,
  fields jsonb not null default '{}'::jsonb,
  event_type text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.graphic_templates enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'graphic_templates' and policyname = 'branch reads') then
    create policy "branch reads" on public.graphic_templates for select to authenticated using (branch_id = public.my_branch());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'graphic_templates' and policyname = 'social writes') then
    create policy "social writes" on public.graphic_templates for all to authenticated
      using (branch_id = public.my_branch() and (public.has_role('social_media_officer') or public.has_role('organizer') or public.has_role('general_secretary')))
      with check (branch_id = public.my_branch() and (public.has_role('social_media_officer') or public.has_role('organizer') or public.has_role('general_secretary')));
  end if;
end $$;
