-- Branch Organizer: the whole database.
--
-- For a new copy: in Supabase, open SQL Editor, paste this file and run it.
-- It creates every table, the row-level security rules that keep each
-- branch's data to itself, and the functions the app calls.
--
-- Generated from a database built from every migration (plus 002 appended by hand), so it matches what
-- running copies have. Changes for copies set up earlier are in migrations/.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


--
-- Name: add_share_rsvp(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_share_rsvp(p_token text, p_name text, p_note text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    insert into public.share_rsvps (share_id, event_id, name, note) values (s.id, s.event_id, n, left(nullif(trim(p_note), ''), 300));
  end if;
  update public.events e set status = 'on'
  where e.id = s.event_id and e.status = 'tentative' and e.target is not null
    and (select count(*) from public.rsvps r where r.event_id = e.id and r.status = 'going')
      + (select count(*) from public.event_guests g where g.event_id = e.id and g.status = 'going')
      + (select count(*) from public.share_rsvps x where x.event_id = e.id) >= e.target;
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_branches(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_branches() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(json_agg(json_build_object('id', id, 'name', name, 'district', district, 'approved', approved, 'created_at', created_at) order by approved, name), '[]'::json)
  from public.branches where public.is_admin();
$$;


--
-- Name: admin_switch_branch(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_switch_branch(p_branch uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then return json_build_object('ok', false, 'error', 'Admins only'); end if;
  if not exists (select 1 from public.branches where id = p_branch) then return json_build_object('ok', false, 'error', 'No such branch'); end if;
  perform set_config('app.branch_setup', 'on', true);
  update public.profiles set branch_id = p_branch where id = auth.uid();
  perform set_config('app.branch_setup', '', true);
  return json_build_object('ok', true);
end $$;


--
-- Name: approve_branch(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_branch(p_branch uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then return json_build_object('ok', false, 'error', 'Admins only'); end if;
  update public.branches set approved = true where id = p_branch;
  return json_build_object('ok', found);
end $$;


--
-- Name: branch_for_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.branch_for_code(p_code text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select name from public.branches where join_code = upper(trim(p_code)) or viewer_code = upper(trim(p_code));
$$;


--
-- Name: calendar_feed(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calendar_feed(p_token text) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with me as (
    select p.id, p.branch_id, p.role from public.calendar_tokens t join public.profiles p on p.id = t.user_id
     where t.token = p_token and length(p_token) >= 20
  )
  select coalesce(json_agg(json_build_object(
    'id', e.id, 'title', e.title, 'event_type', e.event_type, 'start_time', e.start_time,
    'meetup_time', e.meetup_time, 'location', e.location, 'description', e.description,
    'status', e.status, 'target', e.target,
    'mine', (select r.status from public.rsvps r where r.event_id = e.id and r.user_id = me.id)
  ) order by e.start_time), '[]'::json)
  from me join public.events e
    on (e.branch_id = me.branch_id or e.scope in ('district', 'national'))
   and not coalesce(e.archived, false)
   and e.start_time > now() - interval '30 days'
   and (e.event_type <> 'committee' or exists (select 1 from unnest(me.role) x where x <> 'member') or me.id = any(e.invitees));
$$;


--
-- Name: create_branch(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_branch(p_name text, p_district text DEFAULT ''::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: district_materials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.district_materials() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with me as (select p.branch_id, b.district from public.profiles p join public.branches b on b.id = p.branch_id where p.id = auth.uid())
  select coalesce(json_agg(json_build_object(
    'id', m.id, 'name', m.name, 'category', m.category, 'qty', m.qty, 'branch', b.name,
    'holder', coalesce(pr.name, c.name, m.holder_label, 'Branch cupboard')
  ) order by b.name, m.category, m.name), '[]'::json)
  from me
  join public.materials m on m.branch_id <> me.branch_id and m.qty > 0 and coalesce(m.status, 'available') <> 'missing'
  join public.branches b on b.id = m.branch_id and b.district = me.district
  left join public.profiles pr on pr.id::text = m.holder_id
  left join public.comrades c on c.id = m.holder_comrade_id;
$$;


--
-- Name: district_sales(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.district_sales() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with me as (select p.id, p.branch_id, b.district from public.profiles p join public.branches b on b.id = p.branch_id where p.id = auth.uid())
  select coalesce(json_agg(json_build_object(
    'id', e.id, 'title', e.title, 'event_type', e.event_type, 'start_time', e.start_time, 'location', e.location,
    'status', e.status, 'target', e.target, 'branch', b.name,
    'going', (select count(*) from public.rsvps r where r.event_id = e.id and r.status = 'going')
           + (select count(*) from public.event_guests g where g.event_id = e.id and g.status = 'going'),
    'mine', (select g.status from public.event_guests g where g.event_id = e.id and g.added_by = me.id limit 1)
  ) order by e.start_time), '[]'::json)
  from me
  join public.events e on e.branch_id <> me.branch_id and e.scope = 'branch'
  join public.branches b on b.id = e.branch_id and b.district = me.district
  where e.event_type in ('paper_sale', 'uni_stall')
    and not coalesce(e.archived, false)
    and coalesce(e.status, 'on') <> 'off'
    and e.start_time > now() - interval '4 hours';
$$;


--
-- Name: get_share(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_share(p_token text) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
      -- Every prep link with its kind, the event's main reading first.
      'reading', (select coalesce(json_agg(json_build_object('label', x.label, 'url', x.url, 'kind', x.kind) order by x.is_main desc, x.ord), '[]'::json)
                  from (select l->>'label' label, l->>'url' url, l->>'kind' kind, o ord,
                               exists (select 1 from public.shared_reads r where r.event_id = e.id and r.main and r.url = l->>'url') is_main
                        from jsonb_array_elements(coalesce(a.prep_links, '[]'::jsonb)) with ordinality t(l, o)
                        where l->>'url' like 'http%' limit 8) x),
      'book', rg.book,
      'section', rg.current_chapter
    ),
    'going', (select count(*) from public.rsvps r where r.event_id = e.id and r.status = 'going')
           + (select count(*) from public.event_guests g where g.event_id = e.id and g.status = 'going')
           + (select count(*) from public.share_rsvps x where x.event_id = e.id)
  )
  from public.event_shares s join public.events e on e.id = s.event_id
  left join lateral (
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


--
-- Name: get_share_image(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_share_image(p_token text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select s.image from public.event_shares s where s.token = p_token and s.revoked_at is null;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, name, email, branch_tag)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    'branch-2'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


--
-- Name: has_role(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(check_role text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (check_role = any(role) or is_admin)
  );
$$;


--
-- Name: has_role_beyond_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role_beyond_member() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles, unnest(role) as r
    where id = auth.uid() and (r <> 'member' or is_admin)
  );
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;


--
-- Name: is_group_lead(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_lead(p_group uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.reading_group_members m where m.group_id = p_group and m.user_id = auth.uid() and m.is_lead)
      or exists (select 1 from public.reading_groups g where g.id = p_group and g.runner_id = auth.uid());
$$;


--
-- Name: is_view_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_view_only() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select view_only from public.profiles where id = auth.uid()), false);
$$;


--
-- Name: join_branch(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_branch(p_code text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: join_district_sale(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_district_sale(p_event uuid, p_status text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare me record; ev record; label text; cid uuid;
begin
  select p.id, p.name, p.branch_id, b.name as branch, b.district into me
    from public.profiles p join public.branches b on b.id = p.branch_id where p.id = auth.uid();
  if me.id is null then return json_build_object('ok', false, 'error', 'Sign in first'); end if;
  select e.id, e.branch_id into ev from public.events e join public.branches b on b.id = e.branch_id
   where e.id = p_event and e.branch_id <> me.branch_id and b.district = me.district
     and e.event_type in ('paper_sale', 'uni_stall') and not coalesce(e.archived, false);
  if ev.id is null then return json_build_object('ok', false, 'error', 'Not a sale you can join'); end if;
  if p_status = 'no' then
    delete from public.event_guests where event_id = ev.id and added_by = me.id;
    return json_build_object('ok', true);
  end if;
  if p_status not in ('going', 'maybe') then return json_build_object('ok', false, 'error', 'going, maybe or no'); end if;
  label := left(me.name || ' (' || regexp_replace(me.branch, '^.*?(Branch\s*\S+)$', '\1', 'i') || ')', 80);
  select id into cid from public.comrades where branch_id = ev.branch_id and name = label limit 1;
  if cid is null then
    insert into public.comrades (name, aliases, branch_id, created_by) values (label, '{}', ev.branch_id, me.id) returning id into cid;
  end if;
  insert into public.event_guests (event_id, comrade_id, status, added_by) values (ev.id, cid, p_status, me.id)
    on conflict (event_id, comrade_id) do update set status = excluded.status, added_by = excluded.added_by;
  return json_build_object('ok', true);
end $_$;


--
-- Name: my_branch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_branch() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select branch_id from public.profiles where id = auth.uid();
$$;


--
-- Name: new_join_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.new_join_code() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare c text := upper(substr(md5(random()::text), 1, 6));
begin
  if not public.has_role('general_secretary') or public.my_branch() is null then raise exception 'Only the general secretary can do that'; end if;
  update public.branches set join_code = c where id = public.my_branch();
  return c;
end $$;


--
-- Name: pledge_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pledge_totals() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object(
    'pledged', coalesce(sum(amount), 0),
    'paid', coalesce(sum(amount) filter (where status = 'paid'), 0),
    'people', count(*)
  ) from public.pledges where branch_id = public.my_branch();
$$;


--
-- Name: protect_admin_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_admin_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_admin := false;
    elsif new.is_admin is distinct from old.is_admin then
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end $$;


--
-- Name: protect_material_catalog_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_material_catalog_columns() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if (
    new.name is distinct from old.name
    or new.category is distinct from old.category
    or new.qty is distinct from old.qty
    or new.description is distinct from old.description
  ) and not (
    old.created_by = auth.uid()
    or public.has_role('finance_officer')
    or public.has_role('paper_sales_officer')
    or public.has_role('general_secretary')
  ) then
    new.name := old.name;
    new.category := old.category;
    new.qty := old.qty;
    new.description := old.description;
  end if;
  return new;
end;
$$;


--
-- Name: protect_role_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_role_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: protect_subs_verification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_subs_verification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.subs_verified is distinct from old.subs_verified
     and not (public.has_role('finance_officer') or public.has_role('general_secretary')) then
    new.subs_verified := old.subs_verified;
  end if;

  if (new.monthly_subs is distinct from old.monthly_subs
      or new.subs_last_paid is distinct from old.subs_last_paid)
     and not (public.has_role('finance_officer') or public.has_role('general_secretary')) then
    new.subs_verified := false;
  end if;

  return new;
end;
$$;


--
-- Name: set_viewer_code(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_viewer_code(p_on boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare c text := case when p_on then 'V' || upper(substr(md5(random()::text), 1, 7)) end;
begin
  if not public.has_role('general_secretary') or public.my_branch() is null then raise exception 'Only the general secretary can do that'; end if;
  update public.branches set viewer_code = c where id = public.my_branch();
  return c;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    kind text,
    import_row_id uuid,
    target_id text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid DEFAULT public.my_branch()
);


--
-- Name: agenda_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agenda_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    text text NOT NULL,
    owner_id uuid,
    done boolean DEFAULT false NOT NULL,
    done_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_comrade_id uuid,
    due_date date,
    source text,
    pushed integer DEFAULT 0 NOT NULL,
    branch_id uuid DEFAULT public.my_branch(),
    open_since timestamp with time zone,
    claimed_at timestamp with time zone,
    handed_from uuid,
    hand_note text
);


--
-- Name: agenda_contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agenda_contributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agenda_item_id uuid NOT NULL,
    author_id uuid,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agenda_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agenda_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_date date,
    section text DEFAULT 'organizational'::text NOT NULL,
    title text NOT NULL,
    duration text,
    description text,
    icon text DEFAULT 'event_note'::text,
    attachment text,
    leadoff_name text,
    chair_name text,
    reading text,
    reports text[] DEFAULT '{}'::text[] NOT NULL,
    tasks jsonb DEFAULT '[]'::jsonb NOT NULL,
    sort_order integer DEFAULT 99 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    event_id uuid,
    prep_links jsonb DEFAULT '[]'::jsonb NOT NULL,
    branch_tag text DEFAULT 'branch-2'::text,
    created_by uuid,
    archived boolean DEFAULT false NOT NULL,
    link jsonb,
    branch_id uuid DEFAULT public.my_branch(),
    prep_with_id uuid
);


--
-- Name: availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    activity text DEFAULT 'paper_sale'::text NOT NULL,
    days text[] DEFAULT '{}'::text[] NOT NULL,
    note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    slots text[] DEFAULT '{}'::text[] NOT NULL,
    away jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: branch_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_payments (
    branch_id uuid DEFAULT public.my_branch() NOT NULL,
    label text DEFAULT 'SumUp'::text NOT NULL,
    link text,
    qr text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    district text DEFAULT ''::text NOT NULL,
    join_code text DEFAULT upper(substr(md5((random())::text), 1, 6)) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved boolean DEFAULT true NOT NULL,
    viewer_code text
);


--
-- Name: calendar_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_tokens (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comrades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comrades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    profile_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid DEFAULT public.my_branch(),
    phone text,
    candidate_since date,
    candidate_until date,
    candidate_note text,
    left_at date
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    met_date date,
    location_type text,
    about text,
    what_worked text,
    phone text,
    paper_sold text,
    pamphlet_sold text,
    status text DEFAULT 'new'::text NOT NULL,
    labels text[] DEFAULT '{}'::text[] NOT NULL,
    notes jsonb DEFAULT '[]'::jsonb NOT NULL,
    buddy_id text,
    consent_given_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    branch_tag text DEFAULT 'branch-2'::text,
    archived boolean DEFAULT false NOT NULL,
    owner_id uuid,
    tier text,
    last_contact_at timestamp with time zone,
    met_event_id uuid,
    branch_id uuid DEFAULT public.my_branch(),
    stage text DEFAULT 'met'::text NOT NULL,
    stage_at timestamp with time zone,
    CONSTRAINT contacts_stage_check CHECK ((stage = ANY (ARRAY['met'::text, 'talked'::text, 'came'::text, 'joined'::text])))
);


--
-- Name: event_bring; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_bring (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    material_id uuid,
    label text,
    qty text,
    claimed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    brought_at timestamp with time zone
);


--
-- Name: event_checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_checklists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    items jsonb DEFAULT '{}'::jsonb NOT NULL,
    photo_url text,
    video_urls text[] DEFAULT '{}'::text[] NOT NULL,
    completed_by uuid,
    completed_at timestamp with time zone,
    acknowledged boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: event_guests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_guests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    comrade_id uuid NOT NULL,
    status text DEFAULT 'going'::text NOT NULL,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_guests_status_check CHECK ((status = ANY (ARRAY['going'::text, 'maybe'::text, 'no'::text])))
);


--
-- Name: event_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid DEFAULT public.my_branch(),
    event_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    invited_by uuid DEFAULT auth.uid(),
    status text DEFAULT 'invited'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_invites_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'coming'::text, 'maybe'::text, 'no'::text, 'came'::text, 'missed'::text])))
);


--
-- Name: event_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    sold integer DEFAULT 0 NOT NULL,
    money numeric DEFAULT 0 NOT NULL,
    contacts integer DEFAULT 0 NOT NULL,
    reported_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attended integer,
    notes text
);


--
-- Name: event_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    role text NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    token text NOT NULL,
    graphic jsonb,
    image text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: event_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    author_id uuid NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    event_type text DEFAULT 'branch'::text NOT NULL,
    start_time timestamp with time zone NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    description text,
    is_mobilization boolean DEFAULT false NOT NULL,
    meetup_time timestamp with time zone,
    posted_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    chair_id uuid,
    minutes_id uuid,
    branch_tag text DEFAULT 'branch-2'::text,
    archived boolean DEFAULT false NOT NULL,
    lead_id uuid,
    target integer,
    session_id text,
    status text DEFAULT 'on'::text NOT NULL,
    confirm_by timestamp with time zone,
    paper_issue text,
    copies_out integer,
    reading_group_id uuid,
    scope text DEFAULT 'branch'::text NOT NULL,
    branch_id uuid DEFAULT public.my_branch(),
    invitees uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    CONSTRAINT events_scope_check CHECK ((scope = ANY (ARRAY['branch'::text, 'district'::text, 'national'::text]))),
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['tentative'::text, 'on'::text, 'off'::text])))
);


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid DEFAULT public.my_branch(),
    user_id uuid DEFAULT auth.uid() NOT NULL,
    kind text DEFAULT 'bug'::text NOT NULL,
    text text NOT NULL,
    page text,
    device text,
    status text DEFAULT 'open'::text NOT NULL,
    reply text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone
);


--
-- Name: follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    person_id uuid NOT NULL,
    follower_id uuid,
    follower_comrade_id uuid,
    last_touched_at timestamp with time zone,
    note text,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid DEFAULT public.my_branch(),
    notes jsonb DEFAULT '[]'::jsonb NOT NULL,
    with_id uuid
);


--
-- Name: import_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid DEFAULT public.my_branch(),
    user_id uuid DEFAULT auth.uid(),
    data jsonb NOT NULL,
    only_rows jsonb,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    reply text,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT import_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text])))
);


--
-- Name: import_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_id uuid NOT NULL,
    kind text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    match_id text,
    match_score real,
    verified_by uuid,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text DEFAULT 'ai_text'::text NOT NULL,
    raw text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid DEFAULT public.my_branch()
);


--
-- Name: inbox_dismissals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_dismissals (
    user_id uuid NOT NULL,
    key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'paper_sale'::text NOT NULL,
    lat double precision,
    lng double precision,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    branch_tag text DEFAULT 'branch-2'::text,
    archived boolean DEFAULT false NOT NULL,
    branch_id uuid DEFAULT public.my_branch(),
    area text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    book_url text
);


--
-- Name: material_moves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_moves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    icon text DEFAULT 'inventory_2'::text,
    category text DEFAULT 'gear'::text NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    holder_id text,
    holder_label text,
    note text,
    stock_badge text,
    last_updated timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    branch_tag text DEFAULT 'branch-2'::text,
    branch_id uuid DEFAULT public.my_branch(),
    holder_comrade_id uuid,
    wanted integer DEFAULT 0 NOT NULL,
    purpose text
);


--
-- Name: payment_apps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_apps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    app_name text NOT NULL,
    device_name text,
    status text DEFAULT 'ready'::text NOT NULL,
    last_checked date,
    branch_tag text DEFAULT 'branch-2'::text
);


--
-- Name: pledges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pledges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    amount numeric NOT NULL,
    status text DEFAULT 'unpaid'::text NOT NULL,
    method text,
    paid_at date,
    branch_tag text DEFAULT 'branch-2'::text,
    comrade_id uuid,
    branch_id uuid DEFAULT public.my_branch()
);


--
-- Name: poll_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.poll_votes (
    poll_id uuid NOT NULL,
    user_id uuid NOT NULL,
    option text NOT NULL
);


--
-- Name: polls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.polls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    options text[] DEFAULT '{}'::text[] NOT NULL,
    created_by uuid,
    closes_at timestamp with time zone,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid DEFAULT public.my_branch()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text DEFAULT 'Comrade'::text NOT NULL,
    role text[] DEFAULT ARRAY['member'::text] NOT NULL,
    email text,
    monthly_subs numeric,
    subs_last_paid date,
    paper_sub boolean DEFAULT false,
    idom_sub boolean DEFAULT false,
    branch_tag text DEFAULT 'branch-2'::text,
    created_at timestamp with time zone DEFAULT now(),
    pronouns text,
    subs_verified boolean DEFAULT false NOT NULL,
    notification_prefs jsonb,
    initials text,
    branch_id uuid,
    onboarded_at timestamp with time zone,
    phone text,
    is_admin boolean DEFAULT false NOT NULL,
    paper_sub_kind text DEFAULT 'none'::text NOT NULL,
    idom_sub_kind text DEFAULT 'none'::text NOT NULL,
    view_only boolean DEFAULT false NOT NULL,
    CONSTRAINT profiles_idom_sub_kind_check CHECK ((idom_sub_kind = ANY (ARRAY['none'::text, 'digital'::text, 'physical'::text]))),
    CONSTRAINT profiles_paper_sub_kind_check CHECK ((paper_sub_kind = ANY (ARRAY['none'::text, 'digital'::text, 'physical'::text])))
);


--
-- Name: push_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_log (
    key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    keys jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reading_group_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reading_group_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    added_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reading_group_guests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reading_group_guests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    comrade_id uuid NOT NULL,
    is_lead boolean DEFAULT false NOT NULL,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reading_group_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reading_group_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    note text,
    status text DEFAULT 'open'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reading_group_invites_kind_check CHECK ((kind = ANY (ARRAY['invite'::text, 'request'::text]))),
    CONSTRAINT reading_group_invites_status_check CHECK ((status = ANY (ARRAY['open'::text, 'accepted'::text, 'declined'::text])))
);


--
-- Name: reading_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reading_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    is_lead boolean DEFAULT false NOT NULL
);


--
-- Name: reading_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reading_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    runner_id uuid,
    cadence text,
    current_chapter text,
    archived boolean DEFAULT false NOT NULL,
    branch_tag text DEFAULT 'branch-2'::text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    book text,
    capacity integer DEFAULT 6 NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    schedule text,
    location text,
    audience text,
    level text,
    plan text,
    branch_id uuid DEFAULT public.my_branch(),
    CONSTRAINT reading_groups_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'running'::text, 'finished'::text])))
);


--
-- Name: reading_ticks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reading_ticks (
    user_id uuid NOT NULL,
    session_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resource_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_sources (
    key text NOT NULL,
    url text,
    feed text,
    sitemap text,
    search text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: role_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid DEFAULT public.my_branch(),
    user_id uuid DEFAULT auth.uid() NOT NULL,
    role text NOT NULL,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rsvps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rsvps (
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    series_id text DEFAULT 'series-1'::text NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    topic text NOT NULL,
    session_date date,
    start_time text,
    location text,
    leadoff_name text,
    chair_name text,
    reading_link text,
    prep_questions text[],
    summary text,
    completed boolean DEFAULT false NOT NULL,
    branch_tag text DEFAULT 'branch-2'::text,
    branch_id uuid DEFAULT public.my_branch()
);


--
-- Name: share_rsvps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_rsvps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    share_id uuid NOT NULL,
    event_id uuid NOT NULL,
    name text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shared_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid DEFAULT public.my_branch(),
    url text NOT NULL,
    title text NOT NULL,
    note text,
    event_id uuid,
    shared_by uuid DEFAULT auth.uid(),
    read_by uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    main boolean DEFAULT false NOT NULL
);


--
-- Name: social_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    day text DEFAULT 'Mon'::text NOT NULL,
    day_num integer DEFAULT 1 NOT NULL,
    title text NOT NULL,
    platforms text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    branch_tag text DEFAULT 'branch-2'::text,
    branch_id uuid DEFAULT public.my_branch(),
    post_date date,
    event_id uuid,
    image text
);


--
-- Name: topic_ideas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_ideas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid DEFAULT public.my_branch(),
    title text NOT NULL,
    kind text DEFAULT 'branch'::text NOT NULL,
    note text,
    interested uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    used_event_id uuid,
    archived boolean DEFAULT false NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT topic_ideas_kind_check CHECK ((kind = ANY (ARRAY['branch'::text, 'open_meeting'::text])))
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    amount numeric NOT NULL,
    type text DEFAULT 'expense'::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    branch_tag text DEFAULT 'branch-2'::text,
    category text,
    branch_id uuid DEFAULT public.my_branch()
);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: agenda_actions agenda_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_actions
    ADD CONSTRAINT agenda_actions_pkey PRIMARY KEY (id);


--
-- Name: agenda_contributions agenda_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_contributions
    ADD CONSTRAINT agenda_contributions_pkey PRIMARY KEY (id);


--
-- Name: agenda_items agenda_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_pkey PRIMARY KEY (id);


--
-- Name: availability availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_pkey PRIMARY KEY (id);


--
-- Name: availability availability_user_id_activity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_user_id_activity_key UNIQUE (user_id, activity);


--
-- Name: branch_payments branch_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_payments
    ADD CONSTRAINT branch_payments_pkey PRIMARY KEY (branch_id);


--
-- Name: branches branches_join_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_join_code_key UNIQUE (join_code);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: branches branches_viewer_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_viewer_code_key UNIQUE (viewer_code);


--
-- Name: calendar_tokens calendar_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_tokens
    ADD CONSTRAINT calendar_tokens_pkey PRIMARY KEY (user_id);


--
-- Name: calendar_tokens calendar_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_tokens
    ADD CONSTRAINT calendar_tokens_token_key UNIQUE (token);


--
-- Name: comrades comrades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comrades
    ADD CONSTRAINT comrades_pkey PRIMARY KEY (id);


--
-- Name: comrades comrades_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comrades
    ADD CONSTRAINT comrades_profile_id_key UNIQUE (profile_id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: event_bring event_bring_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_bring
    ADD CONSTRAINT event_bring_pkey PRIMARY KEY (id);


--
-- Name: event_checklists event_checklists_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_checklists
    ADD CONSTRAINT event_checklists_event_id_key UNIQUE (event_id);


--
-- Name: event_checklists event_checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_checklists
    ADD CONSTRAINT event_checklists_pkey PRIMARY KEY (id);


--
-- Name: event_guests event_guests_event_id_comrade_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_guests
    ADD CONSTRAINT event_guests_event_id_comrade_id_key UNIQUE (event_id, comrade_id);


--
-- Name: event_guests event_guests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_guests
    ADD CONSTRAINT event_guests_pkey PRIMARY KEY (id);


--
-- Name: event_invites event_invites_event_id_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_event_id_contact_id_key UNIQUE (event_id, contact_id);


--
-- Name: event_invites event_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_pkey PRIMARY KEY (id);


--
-- Name: event_reports event_reports_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_reports
    ADD CONSTRAINT event_reports_event_id_key UNIQUE (event_id);


--
-- Name: event_reports event_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_reports
    ADD CONSTRAINT event_reports_pkey PRIMARY KEY (id);


--
-- Name: event_roles event_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_roles
    ADD CONSTRAINT event_roles_pkey PRIMARY KEY (id);


--
-- Name: event_shares event_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_shares
    ADD CONSTRAINT event_shares_pkey PRIMARY KEY (id);


--
-- Name: event_shares event_shares_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_shares
    ADD CONSTRAINT event_shares_token_key UNIQUE (token);


--
-- Name: event_updates event_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_updates
    ADD CONSTRAINT event_updates_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: follow_ups follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (id);


--
-- Name: import_requests import_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_requests
    ADD CONSTRAINT import_requests_pkey PRIMARY KEY (id);


--
-- Name: import_rows import_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_rows
    ADD CONSTRAINT import_rows_pkey PRIMARY KEY (id);


--
-- Name: imports imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_pkey PRIMARY KEY (id);


--
-- Name: inbox_dismissals inbox_dismissals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_dismissals
    ADD CONSTRAINT inbox_dismissals_pkey PRIMARY KEY (user_id, key);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: material_moves material_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_moves
    ADD CONSTRAINT material_moves_pkey PRIMARY KEY (id);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: payment_apps payment_apps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_apps
    ADD CONSTRAINT payment_apps_pkey PRIMARY KEY (id);


--
-- Name: pledges pledges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pledges
    ADD CONSTRAINT pledges_pkey PRIMARY KEY (id);


--
-- Name: poll_votes poll_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_pkey PRIMARY KEY (poll_id, user_id);


--
-- Name: polls polls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polls
    ADD CONSTRAINT polls_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_log push_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_log
    ADD CONSTRAINT push_log_pkey PRIMARY KEY (key);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: reading_group_contacts reading_group_contacts_group_id_contact_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_contacts
    ADD CONSTRAINT reading_group_contacts_group_id_contact_id_key UNIQUE (group_id, contact_id);


--
-- Name: reading_group_contacts reading_group_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_contacts
    ADD CONSTRAINT reading_group_contacts_pkey PRIMARY KEY (id);


--
-- Name: reading_group_guests reading_group_guests_group_id_comrade_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_guests
    ADD CONSTRAINT reading_group_guests_group_id_comrade_id_key UNIQUE (group_id, comrade_id);


--
-- Name: reading_group_guests reading_group_guests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_guests
    ADD CONSTRAINT reading_group_guests_pkey PRIMARY KEY (id);


--
-- Name: reading_group_invites reading_group_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_invites
    ADD CONSTRAINT reading_group_invites_pkey PRIMARY KEY (id);


--
-- Name: reading_group_members reading_group_members_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_members
    ADD CONSTRAINT reading_group_members_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: reading_group_members reading_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_members
    ADD CONSTRAINT reading_group_members_pkey PRIMARY KEY (id);


--
-- Name: reading_groups reading_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_groups
    ADD CONSTRAINT reading_groups_pkey PRIMARY KEY (id);


--
-- Name: reading_ticks reading_ticks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_ticks
    ADD CONSTRAINT reading_ticks_pkey PRIMARY KEY (user_id, session_id);


--
-- Name: resource_sources resource_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_sources
    ADD CONSTRAINT resource_sources_pkey PRIMARY KEY (key);


--
-- Name: role_requests role_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_requests
    ADD CONSTRAINT role_requests_pkey PRIMARY KEY (id);


--
-- Name: rsvps rsvps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rsvps
    ADD CONSTRAINT rsvps_pkey PRIMARY KEY (event_id, user_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: share_rsvps share_rsvps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_rsvps
    ADD CONSTRAINT share_rsvps_pkey PRIMARY KEY (id);


--
-- Name: shared_reads shared_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_reads
    ADD CONSTRAINT shared_reads_pkey PRIMARY KEY (id);


--
-- Name: social_posts social_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_pkey PRIMARY KEY (id);


--
-- Name: topic_ideas topic_ideas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_ideas
    ADD CONSTRAINT topic_ideas_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: activity_log_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_branch_idx ON public.activity_log USING btree (branch_id);


--
-- Name: agenda_actions_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_actions_branch_idx ON public.agenda_actions USING btree (branch_id);


--
-- Name: agenda_contributions_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_contributions_item_idx ON public.agenda_contributions USING btree (agenda_item_id);


--
-- Name: agenda_items_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agenda_items_branch_idx ON public.agenda_items USING btree (branch_id);


--
-- Name: comrades_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comrades_branch_idx ON public.comrades USING btree (branch_id);


--
-- Name: contacts_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_branch_idx ON public.contacts USING btree (branch_id);


--
-- Name: contacts_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_owner_idx ON public.contacts USING btree (owner_id);


--
-- Name: event_bring_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_bring_event_idx ON public.event_bring USING btree (event_id);


--
-- Name: event_roles_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_roles_event_idx ON public.event_roles USING btree (event_id);


--
-- Name: event_updates_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_updates_event_idx ON public.event_updates USING btree (event_id);


--
-- Name: events_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_branch_idx ON public.events USING btree (branch_id);


--
-- Name: follow_ups_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_branch_idx ON public.follow_ups USING btree (branch_id);


--
-- Name: follow_ups_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX follow_ups_one_active ON public.follow_ups USING btree (person_id) WHERE active;


--
-- Name: import_rows_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_rows_pending_idx ON public.import_rows USING btree (kind, status);


--
-- Name: imports_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX imports_branch_idx ON public.imports USING btree (branch_id);


--
-- Name: locations_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_branch_idx ON public.locations USING btree (branch_id);


--
-- Name: material_moves_material_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_moves_material_idx ON public.material_moves USING btree (material_id, created_at DESC);


--
-- Name: materials_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materials_branch_idx ON public.materials USING btree (branch_id);


--
-- Name: pledges_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pledges_branch_idx ON public.pledges USING btree (branch_id);


--
-- Name: polls_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX polls_branch_idx ON public.polls USING btree (branch_id);


--
-- Name: reading_groups_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reading_groups_branch_idx ON public.reading_groups USING btree (branch_id);


--
-- Name: sessions_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_branch_idx ON public.sessions USING btree (branch_id);


--
-- Name: social_posts_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX social_posts_branch_idx ON public.social_posts USING btree (branch_id);


--
-- Name: transactions_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_branch_idx ON public.transactions USING btree (branch_id);


--
-- Name: profiles protect_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_admin BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_admin_column();


--
-- Name: materials protect_material_catalog; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_material_catalog BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.protect_material_catalog_columns();


--
-- Name: profiles protect_profile_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_profile_role BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_role_column();


--
-- Name: profiles protect_subs_verification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_subs_verification BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_subs_verification();


--
-- Name: activity_log activity_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


--
-- Name: activity_log activity_log_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: agenda_actions agenda_actions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_actions
    ADD CONSTRAINT agenda_actions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: agenda_actions agenda_actions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_actions
    ADD CONSTRAINT agenda_actions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: agenda_actions agenda_actions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_actions
    ADD CONSTRAINT agenda_actions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: agenda_actions agenda_actions_handed_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_actions
    ADD CONSTRAINT agenda_actions_handed_from_fkey FOREIGN KEY (handed_from) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: agenda_actions agenda_actions_owner_comrade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_actions
    ADD CONSTRAINT agenda_actions_owner_comrade_id_fkey FOREIGN KEY (owner_comrade_id) REFERENCES public.comrades(id) ON DELETE SET NULL;


--
-- Name: agenda_actions agenda_actions_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_actions
    ADD CONSTRAINT agenda_actions_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agenda_contributions agenda_contributions_agenda_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_contributions
    ADD CONSTRAINT agenda_contributions_agenda_item_id_fkey FOREIGN KEY (agenda_item_id) REFERENCES public.agenda_items(id) ON DELETE CASCADE;


--
-- Name: agenda_contributions agenda_contributions_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_contributions
    ADD CONSTRAINT agenda_contributions_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: agenda_items agenda_items_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: agenda_items agenda_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: agenda_items agenda_items_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: agenda_items agenda_items_prep_with_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_items
    ADD CONSTRAINT agenda_items_prep_with_id_fkey FOREIGN KEY (prep_with_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: availability availability_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: branch_payments branch_payments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_payments
    ADD CONSTRAINT branch_payments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branch_payments branch_payments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_payments
    ADD CONSTRAINT branch_payments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: branches branches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: calendar_tokens calendar_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_tokens
    ADD CONSTRAINT calendar_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: comrades comrades_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comrades
    ADD CONSTRAINT comrades_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: comrades comrades_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comrades
    ADD CONSTRAINT comrades_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: comrades comrades_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comrades
    ADD CONSTRAINT comrades_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: contacts contacts_met_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_met_event_id_fkey FOREIGN KEY (met_event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id);


--
-- Name: event_bring event_bring_claimed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_bring
    ADD CONSTRAINT event_bring_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_bring event_bring_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_bring
    ADD CONSTRAINT event_bring_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_bring event_bring_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_bring
    ADD CONSTRAINT event_bring_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE SET NULL;


--
-- Name: event_checklists event_checklists_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_checklists
    ADD CONSTRAINT event_checklists_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id);


--
-- Name: event_checklists event_checklists_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_checklists
    ADD CONSTRAINT event_checklists_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: event_checklists event_checklists_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_checklists
    ADD CONSTRAINT event_checklists_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_guests event_guests_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_guests
    ADD CONSTRAINT event_guests_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_guests event_guests_comrade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_guests
    ADD CONSTRAINT event_guests_comrade_id_fkey FOREIGN KEY (comrade_id) REFERENCES public.comrades(id) ON DELETE CASCADE;


--
-- Name: event_guests event_guests_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_guests
    ADD CONSTRAINT event_guests_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_invites event_invites_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: event_invites event_invites_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: event_invites event_invites_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_invites event_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_reports event_reports_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_reports
    ADD CONSTRAINT event_reports_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_reports event_reports_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_reports
    ADD CONSTRAINT event_reports_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.profiles(id);


--
-- Name: event_roles event_roles_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_roles
    ADD CONSTRAINT event_roles_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_roles event_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_roles
    ADD CONSTRAINT event_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_shares event_shares_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_shares
    ADD CONSTRAINT event_shares_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_shares event_shares_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_shares
    ADD CONSTRAINT event_shares_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_updates event_updates_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_updates
    ADD CONSTRAINT event_updates_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: event_updates event_updates_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_updates
    ADD CONSTRAINT event_updates_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: events events_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: events events_chair_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_chair_id_fkey FOREIGN KEY (chair_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: events events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: events events_minutes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_minutes_id_fkey FOREIGN KEY (minutes_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: events events_posted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.profiles(id);


--
-- Name: events events_reading_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_reading_group_id_fkey FOREIGN KEY (reading_group_id) REFERENCES public.reading_groups(id) ON DELETE SET NULL;


--
-- Name: feedback feedback_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: feedback feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: follow_ups follow_ups_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: follow_ups follow_ups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: follow_ups follow_ups_follower_comrade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_follower_comrade_id_fkey FOREIGN KEY (follower_comrade_id) REFERENCES public.comrades(id) ON DELETE SET NULL;


--
-- Name: follow_ups follow_ups_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: follow_ups follow_ups_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.comrades(id) ON DELETE CASCADE;


--
-- Name: follow_ups follow_ups_with_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_with_id_fkey FOREIGN KEY (with_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: import_requests import_requests_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_requests
    ADD CONSTRAINT import_requests_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: import_requests import_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_requests
    ADD CONSTRAINT import_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: import_requests import_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_requests
    ADD CONSTRAINT import_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: import_rows import_rows_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_rows
    ADD CONSTRAINT import_rows_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.imports(id) ON DELETE CASCADE;


--
-- Name: import_rows import_rows_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_rows
    ADD CONSTRAINT import_rows_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.profiles(id);


--
-- Name: imports imports_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: imports imports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: inbox_dismissals inbox_dismissals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_dismissals
    ADD CONSTRAINT inbox_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: locations locations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: locations locations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: material_moves material_moves_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_moves
    ADD CONSTRAINT material_moves_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: material_moves material_moves_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_moves
    ADD CONSTRAINT material_moves_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: materials materials_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: materials materials_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: materials materials_holder_comrade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_holder_comrade_id_fkey FOREIGN KEY (holder_comrade_id) REFERENCES public.comrades(id) ON DELETE SET NULL;


--
-- Name: payment_apps payment_apps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_apps
    ADD CONSTRAINT payment_apps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: pledges pledges_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pledges
    ADD CONSTRAINT pledges_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: pledges pledges_comrade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pledges
    ADD CONSTRAINT pledges_comrade_id_fkey FOREIGN KEY (comrade_id) REFERENCES public.comrades(id) ON DELETE SET NULL;


--
-- Name: pledges pledges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pledges
    ADD CONSTRAINT pledges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: poll_votes poll_votes_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;


--
-- Name: poll_votes poll_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: polls polls_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polls
    ADD CONSTRAINT polls_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: polls polls_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polls
    ADD CONSTRAINT polls_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reading_group_contacts reading_group_contacts_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_contacts
    ADD CONSTRAINT reading_group_contacts_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reading_group_contacts reading_group_contacts_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_contacts
    ADD CONSTRAINT reading_group_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: reading_group_contacts reading_group_contacts_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_contacts
    ADD CONSTRAINT reading_group_contacts_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.reading_groups(id) ON DELETE CASCADE;


--
-- Name: reading_group_guests reading_group_guests_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_guests
    ADD CONSTRAINT reading_group_guests_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: reading_group_guests reading_group_guests_comrade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_guests
    ADD CONSTRAINT reading_group_guests_comrade_id_fkey FOREIGN KEY (comrade_id) REFERENCES public.comrades(id) ON DELETE CASCADE;


--
-- Name: reading_group_guests reading_group_guests_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_guests
    ADD CONSTRAINT reading_group_guests_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.reading_groups(id) ON DELETE CASCADE;


--
-- Name: reading_group_invites reading_group_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_invites
    ADD CONSTRAINT reading_group_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: reading_group_invites reading_group_invites_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_invites
    ADD CONSTRAINT reading_group_invites_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.reading_groups(id) ON DELETE CASCADE;


--
-- Name: reading_group_invites reading_group_invites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_invites
    ADD CONSTRAINT reading_group_invites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reading_group_members reading_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_members
    ADD CONSTRAINT reading_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.reading_groups(id) ON DELETE CASCADE;


--
-- Name: reading_group_members reading_group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_group_members
    ADD CONSTRAINT reading_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reading_groups reading_groups_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_groups
    ADD CONSTRAINT reading_groups_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: reading_groups reading_groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_groups
    ADD CONSTRAINT reading_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: reading_groups reading_groups_runner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_groups
    ADD CONSTRAINT reading_groups_runner_id_fkey FOREIGN KEY (runner_id) REFERENCES public.profiles(id);


--
-- Name: reading_ticks reading_ticks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reading_ticks
    ADD CONSTRAINT reading_ticks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: resource_sources resource_sources_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_sources
    ADD CONSTRAINT resource_sources_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: role_requests role_requests_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_requests
    ADD CONSTRAINT role_requests_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: role_requests role_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_requests
    ADD CONSTRAINT role_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: role_requests role_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_requests
    ADD CONSTRAINT role_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: rsvps rsvps_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rsvps
    ADD CONSTRAINT rsvps_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: rsvps rsvps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rsvps
    ADD CONSTRAINT rsvps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: share_rsvps share_rsvps_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_rsvps
    ADD CONSTRAINT share_rsvps_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: share_rsvps share_rsvps_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_rsvps
    ADD CONSTRAINT share_rsvps_share_id_fkey FOREIGN KEY (share_id) REFERENCES public.event_shares(id) ON DELETE CASCADE;


--
-- Name: shared_reads shared_reads_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_reads
    ADD CONSTRAINT shared_reads_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: shared_reads shared_reads_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_reads
    ADD CONSTRAINT shared_reads_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: shared_reads shared_reads_shared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_reads
    ADD CONSTRAINT shared_reads_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: social_posts social_posts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: social_posts social_posts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: topic_ideas topic_ideas_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_ideas
    ADD CONSTRAINT topic_ideas_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: topic_ideas topic_ideas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_ideas
    ADD CONSTRAINT topic_ideas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: topic_ideas topic_ideas_used_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_ideas
    ADD CONSTRAINT topic_ideas_used_event_id_fkey FOREIGN KEY (used_event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id);


--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: reading_group_contacts adder or gs delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "adder or gs delete" ON public.reading_group_contacts FOR DELETE TO authenticated USING (((added_by = auth.uid()) OR public.has_role('general_secretary'::text)));


--
-- Name: import_requests admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin update" ON public.import_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: agenda_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agenda_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: agenda_contributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agenda_contributions ENABLE ROW LEVEL SECURITY;

--
-- Name: agenda_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agenda_items ENABLE ROW LEVEL SECURITY;

--
-- Name: role_requests ask for yourself; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ask for yourself" ON public.role_requests FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (status = 'pending'::text)));


--
-- Name: share_rsvps auth delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth delete" ON public.share_rsvps FOR DELETE TO authenticated USING (true);


--
-- Name: activity_log auth insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: agenda_items auth insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert" ON public.agenda_items FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: contacts auth insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: event_checklists auth insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert" ON public.event_checklists FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: events auth insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert" ON public.events FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: import_rows auth insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert" ON public.import_rows FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: imports auth insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert" ON public.imports FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: locations auth insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert" ON public.locations FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: materials auth insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert" ON public.materials FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: reading_groups auth insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert" ON public.reading_groups FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: social_posts auth insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth insert" ON public.social_posts FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: activity_log auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.activity_log FOR SELECT TO authenticated USING (true);


--
-- Name: agenda_actions auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.agenda_actions FOR SELECT TO authenticated USING (true);


--
-- Name: agenda_contributions auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.agenda_contributions FOR SELECT TO authenticated USING (true);


--
-- Name: agenda_items auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.agenda_items FOR SELECT TO authenticated USING (true);


--
-- Name: availability auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.availability FOR SELECT TO authenticated USING (true);


--
-- Name: comrades auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.comrades FOR SELECT TO authenticated USING (true);


--
-- Name: contacts auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.contacts FOR SELECT TO authenticated USING (true);


--
-- Name: event_bring auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.event_bring FOR SELECT TO authenticated USING (true);


--
-- Name: event_checklists auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.event_checklists FOR SELECT TO authenticated USING (true);


--
-- Name: event_guests auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.event_guests FOR SELECT TO authenticated USING (true);


--
-- Name: event_invites auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.event_invites FOR SELECT TO authenticated USING (true);


--
-- Name: event_reports auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.event_reports FOR SELECT TO authenticated USING (true);


--
-- Name: event_roles auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.event_roles FOR SELECT TO authenticated USING (true);


--
-- Name: event_shares auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.event_shares FOR SELECT TO authenticated USING (true);


--
-- Name: event_updates auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.event_updates FOR SELECT TO authenticated USING (true);


--
-- Name: events auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.events FOR SELECT TO authenticated USING (((event_type <> 'committee'::text) OR public.has_role_beyond_member()));


--
-- Name: feedback auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.feedback FOR SELECT TO authenticated USING (true);


--
-- Name: follow_ups auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.follow_ups FOR SELECT TO authenticated USING (true);


--
-- Name: import_rows auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.import_rows FOR SELECT TO authenticated USING (true);


--
-- Name: imports auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.imports FOR SELECT TO authenticated USING (true);


--
-- Name: locations auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.locations FOR SELECT TO authenticated USING (true);


--
-- Name: material_moves auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.material_moves FOR SELECT TO authenticated USING (true);


--
-- Name: materials auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.materials FOR SELECT TO authenticated USING (true);


--
-- Name: payment_apps auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.payment_apps FOR SELECT TO authenticated USING (true);


--
-- Name: poll_votes auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.poll_votes FOR SELECT TO authenticated USING (true);


--
-- Name: polls auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.polls FOR SELECT TO authenticated USING (true);


--
-- Name: profiles auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: reading_group_contacts auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.reading_group_contacts FOR SELECT TO authenticated USING (true);


--
-- Name: reading_group_guests auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.reading_group_guests FOR SELECT TO authenticated USING (true);


--
-- Name: reading_group_invites auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.reading_group_invites FOR SELECT TO authenticated USING (true);


--
-- Name: reading_group_members auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.reading_group_members FOR SELECT TO authenticated USING (true);


--
-- Name: reading_groups auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.reading_groups FOR SELECT TO authenticated USING (true);


--
-- Name: resource_sources auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.resource_sources FOR SELECT TO authenticated USING (true);


--
-- Name: rsvps auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.rsvps FOR SELECT TO authenticated USING (true);


--
-- Name: sessions auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.sessions FOR SELECT TO authenticated USING (true);


--
-- Name: share_rsvps auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.share_rsvps FOR SELECT TO authenticated USING (true);


--
-- Name: shared_reads auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.shared_reads FOR SELECT TO authenticated USING (true);


--
-- Name: social_posts auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.social_posts FOR SELECT TO authenticated USING (true);


--
-- Name: topic_ideas auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.topic_ideas FOR SELECT TO authenticated USING (true);


--
-- Name: transactions auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.transactions FOR SELECT TO authenticated USING (true);


--
-- Name: event_checklists auth update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth update" ON public.event_checklists FOR UPDATE TO authenticated USING (true);


--
-- Name: materials auth update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth update" ON public.materials FOR UPDATE TO authenticated USING (true);


--
-- Name: agenda_actions auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.agenda_actions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: comrades auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.comrades TO authenticated USING (true) WITH CHECK (true);


--
-- Name: event_bring auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.event_bring TO authenticated USING (true) WITH CHECK (true);


--
-- Name: event_guests auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.event_guests TO authenticated USING (true) WITH CHECK (true);


--
-- Name: event_reports auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.event_reports TO authenticated USING (true) WITH CHECK (true);


--
-- Name: event_roles auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.event_roles TO authenticated USING (true) WITH CHECK (true);


--
-- Name: event_shares auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.event_shares TO authenticated USING (true) WITH CHECK (true);


--
-- Name: event_updates auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.event_updates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: follow_ups auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.follow_ups TO authenticated USING (true) WITH CHECK (true);


--
-- Name: material_moves auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.material_moves TO authenticated USING (true) WITH CHECK (true);


--
-- Name: polls auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.polls TO authenticated USING (true) WITH CHECK (true);


--
-- Name: reading_group_guests auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.reading_group_guests TO authenticated USING (true) WITH CHECK (true);


--
-- Name: reading_group_invites auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.reading_group_invites TO authenticated USING (true) WITH CHECK (true);


--
-- Name: rsvps auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.rsvps TO authenticated USING (true) WITH CHECK (true);


--
-- Name: shared_reads auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.shared_reads TO authenticated USING (true) WITH CHECK (true);


--
-- Name: topic_ideas auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.topic_ideas TO authenticated USING (true) WITH CHECK (true);


--
-- Name: agenda_contributions author or officer delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "author or officer delete" ON public.agenda_contributions FOR DELETE TO authenticated USING (((author_id = auth.uid()) OR public.has_role('education_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

--
-- Name: branch_payments branch reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "branch reads" ON public.branch_payments FOR SELECT TO authenticated USING ((branch_id = public.my_branch()));


--
-- Name: branch_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branch_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: comrades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comrades ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: event_checklists creator or social or gs delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "creator or social or gs delete" ON public.event_checklists FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR public.has_role('social_media_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: event_bring; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_bring ENABLE ROW LEVEL SECURITY;

--
-- Name: event_checklists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_checklists ENABLE ROW LEVEL SECURITY;

--
-- Name: event_guests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_guests ENABLE ROW LEVEL SECURITY;

--
-- Name: event_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: event_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: event_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: event_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: event_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_apps finance insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance insert" ON public.payment_apps FOR INSERT TO authenticated WITH CHECK ((public.has_role('finance_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: pledges finance insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance insert" ON public.pledges FOR INSERT TO authenticated WITH CHECK ((public.has_role('finance_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: transactions finance insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK ((public.has_role('finance_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: payment_apps finance update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance update" ON public.payment_apps FOR UPDATE TO authenticated USING ((public.has_role('finance_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: pledges finance update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance update" ON public.pledges FOR UPDATE TO authenticated USING ((public.has_role('finance_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: transactions finance update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance update" ON public.transactions FOR UPDATE TO authenticated USING ((public.has_role('finance_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: branch_payments finance writes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "finance writes" ON public.branch_payments TO authenticated USING (((branch_id = public.my_branch()) AND (public.has_role('finance_officer'::text) OR public.has_role('general_secretary'::text)))) WITH CHECK (((branch_id = public.my_branch()) AND (public.has_role('finance_officer'::text) OR public.has_role('general_secretary'::text))));


--
-- Name: follow_ups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: role_requests gs decides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gs decides" ON public.role_requests FOR UPDATE TO authenticated USING (public.has_role('general_secretary'::text)) WITH CHECK (public.has_role('general_secretary'::text));


--
-- Name: payment_apps gs delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gs delete" ON public.payment_apps FOR DELETE TO authenticated USING (public.has_role('general_secretary'::text));


--
-- Name: pledges gs delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gs delete" ON public.pledges FOR DELETE TO authenticated USING (public.has_role('general_secretary'::text));


--
-- Name: profiles gs delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gs delete" ON public.profiles FOR DELETE TO authenticated USING (public.has_role('general_secretary'::text));


--
-- Name: transactions gs delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gs delete" ON public.transactions FOR DELETE TO authenticated USING (public.has_role('general_secretary'::text));


--
-- Name: branches gs rename; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gs rename" ON public.branches FOR UPDATE TO authenticated USING (((id = public.my_branch()) AND public.has_role('general_secretary'::text))) WITH CHECK (((id = public.my_branch()) AND public.has_role('general_secretary'::text)));


--
-- Name: import_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: import_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_dismissals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_dismissals ENABLE ROW LEVEL SECURITY;

--
-- Name: reading_group_members lead adds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lead adds" ON public.reading_group_members FOR INSERT TO authenticated WITH CHECK ((public.is_group_lead(group_id) OR public.has_role('general_secretary'::text) OR public.has_role('education_officer'::text) OR public.has_role('organizer'::text)));


--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: material_moves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_moves ENABLE ROW LEVEL SECURITY;

--
-- Name: materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

--
-- Name: social_posts officer delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "officer delete" ON public.social_posts FOR DELETE TO authenticated USING ((public.has_role('social_media_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: social_posts officer update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "officer update" ON public.social_posts FOR UPDATE TO authenticated USING ((public.has_role('social_media_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: resource_sources officer write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "officer write" ON public.resource_sources TO authenticated USING ((public.has_role('general_secretary'::text) OR public.has_role('education_officer'::text) OR public.has_role('social_media_officer'::text))) WITH CHECK ((public.has_role('general_secretary'::text) OR public.has_role('education_officer'::text) OR public.has_role('social_media_officer'::text)));


--
-- Name: sessions officer write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "officer write" ON public.sessions TO authenticated USING ((public.has_role('education_officer'::text) OR public.has_role('general_secretary'::text))) WITH CHECK ((public.has_role('education_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: calendar_tokens own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own ON public.calendar_tokens TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: branches own branch read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own branch read" ON public.branches FOR SELECT TO authenticated USING ((id = public.my_branch()));


--
-- Name: import_requests own insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own insert" ON public.import_requests FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (status = 'pending'::text)));


--
-- Name: import_requests own or admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin read" ON public.import_requests FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: role_requests own or gs read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or gs read" ON public.role_requests FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role('general_secretary'::text)));


--
-- Name: pledges own or officer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or officer read" ON public.pledges FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role_beyond_member()));


--
-- Name: event_invites own write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own write" ON public.event_invites TO authenticated USING ((invited_by = auth.uid())) WITH CHECK ((invited_by = auth.uid()));


--
-- Name: contacts owner or gs delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner or gs delete" ON public.contacts FOR DELETE TO authenticated USING (((owner_id = auth.uid()) OR (created_by = auth.uid()) OR public.has_role('general_secretary'::text)));


--
-- Name: events owner or officer delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner or officer delete" ON public.events FOR DELETE TO authenticated USING (((posted_by = auth.uid()) OR public.has_role('organizer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: locations owner or officer delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner or officer delete" ON public.locations FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR public.has_role('organizer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: materials owner or officer delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner or officer delete" ON public.materials FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR public.has_role('finance_officer'::text) OR public.has_role('paper_sales_officer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: contacts owner or officer update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner or officer update" ON public.contacts FOR UPDATE TO authenticated USING (((owner_id = auth.uid()) OR (created_by = auth.uid()) OR public.has_role_beyond_member())) WITH CHECK (true);


--
-- Name: events owner or officer update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner or officer update" ON public.events FOR UPDATE TO authenticated USING (((posted_by = auth.uid()) OR public.has_role('organizer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: locations owner or officer update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner or officer update" ON public.locations FOR UPDATE TO authenticated USING (((created_by = auth.uid()) OR public.has_role('organizer'::text) OR public.has_role('general_secretary'::text)));


--
-- Name: agenda_items owner or section officer delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner or section officer delete" ON public.agenda_items FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR public.has_role('general_secretary'::text) OR ((section = 'paper'::text) AND public.has_role('paper_sales_officer'::text)) OR ((section = 'political'::text) AND public.has_role('education_officer'::text)) OR ((section = 'organizational'::text) AND public.has_role('organizer'::text))));


--
-- Name: agenda_items owner or section officer update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner or section officer update" ON public.agenda_items FOR UPDATE TO authenticated USING (((created_by = auth.uid()) OR public.has_role('general_secretary'::text) OR ((section = 'paper'::text) AND public.has_role('paper_sales_officer'::text)) OR ((section = 'political'::text) AND public.has_role('education_officer'::text)) OR ((section = 'organizational'::text) AND public.has_role('organizer'::text))));


--
-- Name: payment_apps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_apps ENABLE ROW LEVEL SECURITY;

--
-- Name: pledges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pledges ENABLE ROW LEVEL SECURITY;

--
-- Name: poll_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: polls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: push_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: reading_group_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reading_group_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: reading_group_guests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reading_group_guests ENABLE ROW LEVEL SECURITY;

--
-- Name: reading_group_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reading_group_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: reading_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reading_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: reading_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reading_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: reading_ticks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reading_ticks ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: role_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: rsvps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;

--
-- Name: reading_groups runner or gs delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "runner or gs delete" ON public.reading_groups FOR DELETE TO authenticated USING (((runner_id = auth.uid()) OR (created_by = auth.uid()) OR public.has_role('general_secretary'::text)));


--
-- Name: reading_groups runner or gs update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "runner or gs update" ON public.reading_groups FOR UPDATE TO authenticated USING (((runner_id = auth.uid()) OR (created_by = auth.uid()) OR public.has_role('general_secretary'::text)));


--
-- Name: activity_log same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.activity_log AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: agenda_actions same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.agenda_actions AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: agenda_contributions same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.agenda_contributions AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.agenda_items i
  WHERE (i.id = agenda_contributions.agenda_item_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.agenda_items i
  WHERE (i.id = agenda_contributions.agenda_item_id))));


--
-- Name: agenda_items same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.agenda_items AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: availability same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.availability AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE (p.id = availability.user_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE (p.id = availability.user_id))));


--
-- Name: comrades same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.comrades AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: contacts same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.contacts AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: event_bring same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.event_bring AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_bring.event_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_bring.event_id))));


--
-- Name: event_checklists same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.event_checklists AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_checklists.event_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_checklists.event_id))));


--
-- Name: event_guests same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.event_guests AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_guests.event_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_guests.event_id))));


--
-- Name: event_invites same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.event_invites AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: event_reports same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.event_reports AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_reports.event_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_reports.event_id))));


--
-- Name: event_roles same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.event_roles AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_roles.event_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_roles.event_id))));


--
-- Name: event_shares same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.event_shares AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_shares.event_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_shares.event_id))));


--
-- Name: event_updates same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.event_updates AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_updates.event_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = event_updates.event_id))));


--
-- Name: events same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.events AS RESTRICTIVE TO authenticated USING (((branch_id = public.my_branch()) OR (scope <> 'branch'::text))) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: feedback same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.feedback AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: follow_ups same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.follow_ups AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: import_requests same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.import_requests AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: import_rows same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.import_rows AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.imports i
  WHERE (i.id = import_rows.import_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.imports i
  WHERE (i.id = import_rows.import_id))));


--
-- Name: imports same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.imports AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: locations same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.locations AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: material_moves same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.material_moves AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.materials m
  WHERE (m.id = material_moves.material_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.materials m
  WHERE (m.id = material_moves.material_id))));


--
-- Name: materials same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.materials AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: payment_apps same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.payment_apps AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE (p.id = payment_apps.user_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE (p.id = payment_apps.user_id))));


--
-- Name: pledges same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.pledges AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: poll_votes same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.poll_votes AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.polls p
  WHERE (p.id = poll_votes.poll_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.polls p
  WHERE (p.id = poll_votes.poll_id))));


--
-- Name: polls same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.polls AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: profiles same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.profiles AS RESTRICTIVE TO authenticated USING (((id = auth.uid()) OR (branch_id = public.my_branch()))) WITH CHECK (((id = auth.uid()) OR (branch_id = public.my_branch())));


--
-- Name: reading_group_contacts same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.reading_group_contacts AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.reading_groups g
  WHERE (g.id = reading_group_contacts.group_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.reading_groups g
  WHERE (g.id = reading_group_contacts.group_id))));


--
-- Name: reading_group_guests same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.reading_group_guests AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.reading_groups g
  WHERE (g.id = reading_group_guests.group_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.reading_groups g
  WHERE (g.id = reading_group_guests.group_id))));


--
-- Name: reading_group_invites same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.reading_group_invites AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.reading_groups g
  WHERE (g.id = reading_group_invites.group_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.reading_groups g
  WHERE (g.id = reading_group_invites.group_id))));


--
-- Name: reading_group_members same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.reading_group_members AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.reading_groups g
  WHERE (g.id = reading_group_members.group_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.reading_groups g
  WHERE (g.id = reading_group_members.group_id))));


--
-- Name: reading_groups same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.reading_groups AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: role_requests same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.role_requests AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: rsvps same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.rsvps AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = rsvps.event_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = rsvps.event_id))));


--
-- Name: sessions same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.sessions AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: share_rsvps same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.share_rsvps AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = share_rsvps.event_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE (e.id = share_rsvps.event_id))));


--
-- Name: shared_reads same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.shared_reads AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: social_posts same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.social_posts AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: topic_ideas same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.topic_ideas AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: transactions same branch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "same branch" ON public.transactions AS RESTRICTIVE TO authenticated USING ((branch_id = public.my_branch())) WITH CHECK ((branch_id = public.my_branch()));


--
-- Name: availability self delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self delete" ON public.availability FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: agenda_contributions self insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self insert" ON public.agenda_contributions FOR INSERT TO authenticated WITH CHECK ((author_id = auth.uid()));


--
-- Name: availability self insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self insert" ON public.availability FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles self insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: reading_group_contacts self insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self insert" ON public.reading_group_contacts FOR INSERT TO authenticated WITH CHECK ((added_by = auth.uid()));


--
-- Name: reading_group_members self join; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self join" ON public.reading_group_members FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: reading_group_members self leave; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self leave" ON public.reading_group_members FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: inbox_dismissals self only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self only" ON public.inbox_dismissals TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: push_subscriptions self only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self only" ON public.push_subscriptions TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: reading_ticks self only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self only" ON public.reading_ticks TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles self or gen-sec update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self or gen-sec update" ON public.profiles FOR UPDATE TO authenticated USING (((id = auth.uid()) OR public.has_role('general_secretary'::text))) WITH CHECK (((id = auth.uid()) OR public.has_role('general_secretary'::text)));


--
-- Name: availability self update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self update" ON public.availability FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: reading_group_members self update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self update" ON public.reading_group_members FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: poll_votes self write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self write" ON public.poll_votes TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: share_rsvps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_rsvps ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: social_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: topic_ideas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.topic_ideas ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: import_rows verifier update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "verifier update" ON public.import_rows FOR UPDATE TO authenticated USING ((public.has_role('general_secretary'::text) OR ((kind = ANY (ARRAY['people'::text, 'materials'::text, 'events'::text])) AND public.has_role('organizer'::text)) OR ((kind = 'finance'::text) AND public.has_role('finance_officer'::text)) OR ((kind = 'education'::text) AND public.has_role('education_officer'::text)) OR ((kind = 'social'::text) AND public.has_role('social_media_officer'::text)))) WITH CHECK ((public.has_role('general_secretary'::text) OR ((kind = ANY (ARRAY['people'::text, 'materials'::text, 'events'::text])) AND public.has_role('organizer'::text)) OR ((kind = 'finance'::text) AND public.has_role('finance_officer'::text)) OR ((kind = 'education'::text) AND public.has_role('education_officer'::text)) OR ((kind = 'social'::text) AND public.has_role('social_media_officer'::text))));


--
-- Name: activity_log view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.activity_log AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: availability view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.availability AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: contacts view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.contacts AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_invites view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.event_invites AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: feedback view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.feedback AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: follow_ups view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.follow_ups AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: import_requests view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.import_requests AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: import_rows view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.import_rows AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: imports view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.imports AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: pledges view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.pledges AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: push_log view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.push_log AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_group_contacts view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.reading_group_contacts AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: role_requests view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.role_requests AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: share_rsvps view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.share_rsvps AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: transactions view only: hidden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: hidden" ON public.transactions AS RESTRICTIVE FOR SELECT TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: activity_log view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.activity_log AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: agenda_actions view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.agenda_actions AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: agenda_contributions view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.agenda_contributions AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: agenda_items view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.agenda_items AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: availability view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.availability AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: branch_payments view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.branch_payments AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: branches view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.branches AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: calendar_tokens view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.calendar_tokens AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: comrades view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.comrades AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: contacts view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.contacts AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_bring view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.event_bring AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_checklists view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.event_checklists AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_guests view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.event_guests AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_invites view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.event_invites AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_reports view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.event_reports AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_roles view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.event_roles AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_shares view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.event_shares AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_updates view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.event_updates AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: events view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.events AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: feedback view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.feedback AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: follow_ups view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.follow_ups AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: import_requests view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.import_requests AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: import_rows view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.import_rows AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: imports view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.imports AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: inbox_dismissals view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.inbox_dismissals AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: locations view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.locations AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: material_moves view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.material_moves AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: materials view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.materials AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: payment_apps view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.payment_apps AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: pledges view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.pledges AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: poll_votes view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.poll_votes AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: polls view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.polls AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: profiles view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.profiles AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: push_log view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.push_log AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: push_subscriptions view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.push_subscriptions AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_group_contacts view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.reading_group_contacts AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_group_guests view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.reading_group_guests AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_group_invites view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.reading_group_invites AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_group_members view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.reading_group_members AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_groups view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.reading_groups AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_ticks view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.reading_ticks AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: resource_sources view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.resource_sources AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: role_requests view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.role_requests AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: rsvps view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.rsvps AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: sessions view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.sessions AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: share_rsvps view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.share_rsvps AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: shared_reads view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.shared_reads AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: social_posts view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.social_posts AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: topic_ideas view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.topic_ideas AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: transactions view only: no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no delete" ON public.transactions AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: activity_log view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.activity_log AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: agenda_actions view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.agenda_actions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: agenda_contributions view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.agenda_contributions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: agenda_items view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.agenda_items AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: availability view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.availability AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: branch_payments view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.branch_payments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: branches view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.branches AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: calendar_tokens view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.calendar_tokens AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: comrades view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.comrades AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: contacts view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.contacts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: event_bring view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.event_bring AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: event_checklists view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.event_checklists AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: event_guests view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.event_guests AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: event_invites view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.event_invites AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: event_reports view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.event_reports AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: event_roles view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.event_roles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: event_shares view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.event_shares AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: event_updates view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.event_updates AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: events view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.events AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: feedback view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.feedback AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: follow_ups view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.follow_ups AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: import_requests view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.import_requests AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: import_rows view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.import_rows AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: imports view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.imports AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: inbox_dismissals view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.inbox_dismissals AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: locations view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.locations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: material_moves view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.material_moves AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: materials view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.materials AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: payment_apps view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.payment_apps AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: pledges view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.pledges AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: poll_votes view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.poll_votes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: polls view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.polls AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: profiles view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.profiles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: push_log view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.push_log AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: push_subscriptions view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.push_subscriptions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: reading_group_contacts view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.reading_group_contacts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: reading_group_guests view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.reading_group_guests AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: reading_group_invites view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.reading_group_invites AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: reading_group_members view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.reading_group_members AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: reading_groups view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.reading_groups AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: reading_ticks view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.reading_ticks AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: resource_sources view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.resource_sources AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: role_requests view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.role_requests AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: rsvps view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.rsvps AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: sessions view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.sessions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: share_rsvps view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.share_rsvps AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: shared_reads view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.shared_reads AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: social_posts view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.social_posts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: topic_ideas view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.topic_ideas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: transactions view only: no insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no insert" ON public.transactions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.is_view_only()));


--
-- Name: activity_log view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.activity_log AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: agenda_actions view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.agenda_actions AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: agenda_contributions view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.agenda_contributions AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: agenda_items view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.agenda_items AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: availability view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.availability AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: branch_payments view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.branch_payments AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: branches view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.branches AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: calendar_tokens view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.calendar_tokens AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: comrades view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.comrades AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: contacts view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.contacts AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_bring view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.event_bring AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_checklists view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.event_checklists AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_guests view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.event_guests AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_invites view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.event_invites AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_reports view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.event_reports AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_roles view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.event_roles AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_shares view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.event_shares AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: event_updates view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.event_updates AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: events view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.events AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: feedback view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.feedback AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: follow_ups view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.follow_ups AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: import_requests view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.import_requests AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: import_rows view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.import_rows AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: imports view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.imports AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: inbox_dismissals view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.inbox_dismissals AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: locations view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.locations AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: material_moves view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.material_moves AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: materials view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.materials AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: payment_apps view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.payment_apps AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: pledges view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.pledges AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: poll_votes view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.poll_votes AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: polls view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.polls AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: profiles view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING (((NOT public.is_view_only()) OR (id = auth.uid())));


--
-- Name: push_log view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.push_log AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: push_subscriptions view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.push_subscriptions AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_group_contacts view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.reading_group_contacts AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_group_guests view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.reading_group_guests AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_group_invites view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.reading_group_invites AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_group_members view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.reading_group_members AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_groups view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.reading_groups AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: reading_ticks view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.reading_ticks AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: resource_sources view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.resource_sources AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: role_requests view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.role_requests AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: rsvps view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.rsvps AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: sessions view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.sessions AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: share_rsvps view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.share_rsvps AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: shared_reads view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.shared_reads AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: social_posts view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.social_posts AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: topic_ideas view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.topic_ideas AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: transactions view only: no update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "view only: no update" ON public.transactions AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.is_view_only()));


--
-- Name: feedback write your own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "write your own" ON public.feedback FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: feedback writer or gs deletes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "writer or gs deletes" ON public.feedback FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR public.has_role('general_secretary'::text)));


--
-- Name: feedback writer or gs edits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "writer or gs edits" ON public.feedback FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR public.has_role('general_secretary'::text))) WITH CHECK (true);


--
-- Name: FUNCTION add_share_rsvp(p_token text, p_name text, p_note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.add_share_rsvp(p_token text, p_name text, p_note text) TO anon;
GRANT ALL ON FUNCTION public.add_share_rsvp(p_token text, p_name text, p_note text) TO authenticated;


--
-- Name: FUNCTION admin_branches(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_branches() TO authenticated;


--
-- Name: FUNCTION admin_switch_branch(p_branch uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_switch_branch(p_branch uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_switch_branch(p_branch uuid) TO authenticated;


--
-- Name: FUNCTION approve_branch(p_branch uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.approve_branch(p_branch uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_branch(p_branch uuid) TO authenticated;


--
-- Name: FUNCTION branch_for_code(p_code text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.branch_for_code(p_code text) TO anon;
GRANT ALL ON FUNCTION public.branch_for_code(p_code text) TO authenticated;


--
-- Name: FUNCTION calendar_feed(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.calendar_feed(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_feed(p_token text) TO anon;
GRANT ALL ON FUNCTION public.calendar_feed(p_token text) TO authenticated;


--
-- Name: FUNCTION create_branch(p_name text, p_district text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_branch(p_name text, p_district text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_branch(p_name text, p_district text) TO authenticated;


--
-- Name: FUNCTION district_materials(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.district_materials() TO authenticated;


--
-- Name: FUNCTION district_sales(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.district_sales() TO authenticated;


--
-- Name: FUNCTION get_share(p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_share(p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_share(p_token text) TO authenticated;


--
-- Name: FUNCTION get_share_image(p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_share_image(p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_share_image(p_token text) TO authenticated;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;


--
-- Name: FUNCTION has_role(check_role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role(check_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(check_role text) TO authenticated;


--
-- Name: FUNCTION has_role_beyond_member(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role_beyond_member() FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role_beyond_member() TO authenticated;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin() TO authenticated;


--
-- Name: FUNCTION is_group_lead(p_group uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_lead(p_group uuid) TO authenticated;


--
-- Name: FUNCTION is_view_only(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_view_only() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_view_only() TO authenticated;


--
-- Name: FUNCTION join_branch(p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_branch(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_branch(p_code text) TO authenticated;


--
-- Name: FUNCTION join_district_sale(p_event uuid, p_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_district_sale(p_event uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_district_sale(p_event uuid, p_status text) TO authenticated;


--
-- Name: FUNCTION my_branch(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_branch() TO authenticated;


--
-- Name: FUNCTION new_join_code(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.new_join_code() FROM PUBLIC;
GRANT ALL ON FUNCTION public.new_join_code() TO authenticated;


--
-- Name: FUNCTION pledge_totals(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pledge_totals() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pledge_totals() TO authenticated;


--
-- Name: FUNCTION protect_material_catalog_columns(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_material_catalog_columns() FROM PUBLIC;


--
-- Name: FUNCTION protect_role_column(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_role_column() FROM PUBLIC;


--
-- Name: FUNCTION protect_subs_verification(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_subs_verification() FROM PUBLIC;


--
-- Name: FUNCTION set_viewer_code(p_on boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_viewer_code(p_on boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_viewer_code(p_on boolean) TO authenticated;


--
--



--
-- Outside the public schema: a profile for every new sign-in, and the
-- public bucket for event photos.
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO storage.buckets (id, name, public) VALUES ('checklist-photos', 'checklist-photos', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth upload checklist photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'checklist-photos');
CREATE POLICY "public read checklist photos" ON storage.objects FOR SELECT USING (bucket_id = 'checklist-photos');
CREATE POLICY "uploader delete checklist photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'checklist-photos' AND owner = auth.uid());

-- ===== 002_share_form_and_visitors.sql =====
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
