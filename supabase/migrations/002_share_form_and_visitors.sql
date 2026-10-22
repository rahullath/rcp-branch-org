-- Share-link reply form (who sent you, bringing) and names for other branches' people on district/national events.
-- v27: enough to tell a stranger's reply from a friend's without asking for contact details:
-- who sent them the link (free text) and how many more they're bringing.
alter table public.share_rsvps add column if not exists who_sent text;
alter table public.share_rsvps add column if not exists extra int not null default 0 check (extra between 0 and 5);
create or replace function public.get_share(p_token text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', s.id, 'token', s.token, 'graphic', s.graphic, 'has_image', s.image is not null,
    'event', json_build_object(
      'id', e.id, 'title', e.title, 'event_type', e.event_type, 'start_time', e.start_time,
      'meetup_time', e.meetup_time, 'location', e.location, 'description', e.description,
      'status', e.status, 'target', e.target
    ),
    'brief', json_build_object(
      'topic', a.title,
      'about', a.description,
      -- v26: every prep link with its kind, the event's main reading first, so the page can show
      -- one thing to read and one to listen to.
      'reading', (select coalesce(json_agg(json_build_object('label', x.label, 'url', x.url, 'kind', x.kind) order by x.is_main desc, x.ord), '[]'::json)
                  from (select l->>'label' label, l->>'url' url, l->>'kind' kind, o ord,
                               exists (select 1 from public.shared_reads r where r.event_id = e.id and r.main and r.url = l->>'url') is_main
                        from jsonb_array_elements(coalesce(a.prep_links, '[]'::jsonb)) with ordinality t(l, o)
                        where l->>'url' like 'http%'
                        union all
                        -- v27: events with no discussion item (paper sales, stalls) use the readings set for the event itself.
                        select r.title, r.url, null, row_number() over (order by r.created_at), r.main
                        from public.shared_reads r
                        where r.event_id = e.id and r.url like 'http%'
                          and jsonb_array_length(coalesce(a.prep_links, '[]'::jsonb)) = 0
                        order by 5 desc, 4 limit 8) x),
      'book', rg.book,
      'section', rg.current_chapter
    ),
    'going', (select count(*) from public.rsvps r where r.event_id = e.id and r.status = 'going')
           + (select count(*) from public.event_guests g where g.event_id = e.id and g.status = 'going')
           + (select coalesce(sum(1 + x.extra), 0) from public.share_rsvps x where x.event_id = e.id)
  )
  from public.event_shares s join public.events e on e.id = s.event_id
  left join lateral (
    -- v25: the main discussion, not a short "current events" slot: led off, with reading, the longest.
    select i.title, i.description, i.prep_links from public.agenda_items i
    where i.event_id = e.id and i.section = 'political' and not coalesce(i.archived, false)
    order by (i.leadoff_name is not null) desc,
             (jsonb_array_length(coalesce(i.prep_links, '[]'::jsonb)) > 0) desc,
             coalesce(nullif(regexp_replace(coalesce(i.duration, ''), '\D', '', 'g'), '')::int, 0) desc,
             i.sort_order
    limit 1
  ) a on true
  left join public.reading_groups rg on rg.id = e.reading_group_id
  where s.token = p_token and s.revoked_at is null and not coalesce(e.archived, false);
$$;

-- "I'm coming": a name, who sent them the link, how many more, and an optional note. No emails or phone numbers.
drop function if exists public.add_share_rsvp(text, text, text);
create or replace function public.add_share_rsvp(p_token text, p_name text, p_note text default null, p_who_sent text default null, p_extra int default 0)
returns json language plpgsql security definer set search_path = public as $$
declare s public.event_shares; n text := left(trim(p_name), 60); existing int;
begin
  select * into s from public.event_shares where token = p_token and revoked_at is null;
  if s.id is null or n = '' then return json_build_object('ok', false, 'error', 'This link has expired'); end if;
  if exists (select 1 from public.events where id = s.event_id and (status = 'off' or start_time < now() - interval '6 hours')) then
    return json_build_object('ok', false, 'error', 'This event is no longer taking replies');
  end if;
  select count(*) into existing from public.share_rsvps where share_id = s.id;
  if existing >= 200 then return json_build_object('ok', false, 'error', 'Full up — message whoever sent you the link'); end if;
  if not exists (select 1 from public.share_rsvps where share_id = s.id and lower(name) = lower(n)) then
    insert into public.share_rsvps (share_id, event_id, name, note, who_sent, extra)
    values (s.id, s.event_id, n, left(nullif(trim(p_note), ''), 300), left(nullif(trim(p_who_sent), ''), 60), greatest(0, least(coalesce(p_extra, 0), 5)));
  end if;
  -- A tentative event that reaches its number through the link is on.
  update public.events e set status = 'on'
  where e.id = s.event_id and e.status = 'tentative' and e.target is not null
    and (select count(*) from public.rsvps r where r.event_id = e.id and r.status = 'going')
      + (select count(*) from public.event_guests g where g.event_id = e.id and g.status = 'going')
      + (select coalesce(sum(1 + x.extra), 0) from public.share_rsvps x where x.event_id = e.id) >= e.target;
  return json_build_object('ok', true);
end $$;

grant execute on function public.add_share_rsvp(text, text, text, text, int) to anon, authenticated;

grant execute on function public.get_share(text) to anon, authenticated;

-- ===================== v28: names for other branches' people on district/national events =====================
-- Profiles are limited to your own branch, so someone from another branch who RSVPs to a district or
-- national event showed up as "A comrade". This returns just id, name, initials and branch name for
-- people from other branches who are going to / helping at such events, and nothing else about them.
create or replace function public.event_visitors()
returns table (id uuid, name text, initials text, branch_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.initials, b.name
  from public.profiles p
  left join public.branches b on b.id = p.branch_id
  where auth.uid() is not null
    and p.branch_id is distinct from public.my_branch()
    and p.id in (
      select r.user_id from public.rsvps r join public.events e on e.id = r.event_id where e.scope <> 'branch'
      union select v.user_id from public.event_roles v join public.events e on e.id = v.event_id where e.scope <> 'branch'
      union select g.claimed_by from public.event_bring g join public.events e on e.id = g.event_id where e.scope <> 'branch'
      union select e.lead_id from public.events e where e.scope <> 'branch'
    );
$$;
revoke execute on function public.event_visitors() from public, anon;
grant execute on function public.event_visitors() to authenticated;
