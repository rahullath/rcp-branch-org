import { isAutoTitle, meetingTopic } from "./meeting-title";
import type { Actor } from "./auth";
import type { AgendaItem, Comrade, Event, PrepLink, Profile } from "./types";
import { leadLabel, sameTopic, type ParsedAgenda } from "./agenda-import";
import { createAgendaItem, createEvent, listAgenda, listEvents, listProfiles, logActivity, updateAgendaItem, updateEvent } from "./data";
import { cleanAliases, createComrade, listComrades, listFollowUps, setFollowUp, updateComrade } from "./data-v2";
import { initials } from "./utils";

/*
 * Turns a parsed agenda doc into records: the meeting, its agenda items, the
 * Branch Programme (future meetings + lead-offs) and follow-ups (who follows
 * up whom — a standing list, not dated tasks). Runs twice with the same code: once as a dry run
 * for the preview, once for real — so what you see is what gets saved.
 * Everything is matched first, so importing the same doc again updates.
 */

export type Change = "create" | "update" | "same" | "skip";

export interface PlanLine {
  change: Change;
  kind: "meeting" | "political" | "organizational" | "paper" | "programme" | "follow-up";
  label: string;
  detail?: string;
  /** Meeting date (YYYY-MM-DD), for grouping in the preview. */
  date?: string | null;
}

/** How each name in the doc was understood — shown as "Who's who" in the preview. */
export interface ImportPerson {
  raw: string;
  /** member: has an account · known: in People, no account yet · new: never seen before. */
  status: "member" | "known" | "new";
  name: string;
}

/** The preview's answer for a new name: who they are, or which member they are. */
export interface PersonHint {
  raw: string;
  name?: string | null;
  profile_id?: string | null;
}

export interface ImportResult {
  lines: PlanLine[];
  warnings: string[];
  people: ImportPerson[];
  /** The main meeting, once saved. */
  eventId: string | null;
  applied: boolean;
}

interface Person {
  /** Their account, if they have one. */
  id: string | null;
  /** Their People entry, if they're known without an account. */
  comradeId: string | null;
  name: string;
  status: ImportPerson["status"] | "all";
}

const TZ = "Europe/London";

/** YYYY-MM-DD + HH:MM in UK time → ISO instant (handles BST/GMT). */
export function londonISO(date: string, hhmm: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const offsetPart = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, timeZoneName: "shortOffset" })
    .formatToParts(new Date(guess))
    .find((p) => p.type === "timeZoneName")?.value;
  const off = offsetPart?.match(/GMT([+-]\d+)(?::(\d+))?/);
  const minutes = off ? Number(off[1]) * 60 + Math.sign(Number(off[1])) * Number(off[2] ?? 0) : 0;
  return new Date(guess - minutes * 60000).toISOString();
}

function londonDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function londonTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

const bare = (n: string) => n.replace(/^Comrade\s+/i, "").trim();

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * "KL", "Kit", "Morgan?", "Dan Price", "All" → who that is. People entries
 * (names + short forms the branch has taught the app) win, then accounts by
 * full name, first name or initials; anything else is new, kept as written.
 */
export function resolvePerson(raw: string, profiles: Profile[], comrades: Comrade[] = []): Person {
  const text = raw.replace(/\?$/, "").trim();
  if (/^all$/i.test(text)) return { id: null, comradeId: null, name: "All", status: "all" };
  const fromComrade = (c: Comrade): Person => {
    const profile = c.profile_id ? profiles.find((p) => p.id === c.profile_id) : null;
    return profile ? { id: profile.id, comradeId: c.id, name: profile.name, status: "member" } : { id: null, comradeId: c.id, name: c.name, status: "known" };
  };
  const known = comrades.filter((c) => same(c.name, text) || c.aliases.some((a) => same(a, text)));
  if (known.length === 1) return fromComrade(known[0]);

  const lower = text.toLowerCase();
  const member = (p: Profile): Person => ({ id: p.id, comradeId: comrades.find((c) => c.profile_id === p.id)?.id ?? null, name: p.name, status: "member" });
  const byFull = profiles.filter((p) => bare(p.name).toLowerCase() === lower || p.name.toLowerCase() === lower);
  if (byFull.length === 1) return member(byFull[0]);
  const byFirst = profiles.filter((p) => bare(p.name).split(/\s+/)[0].toLowerCase() === lower);
  if (byFirst.length === 1) return member(byFirst[0]);
  if (/^[A-Z]{2,4}$/.test(text)) {
    const byInitials = profiles.filter((p) => (p.initials ?? "").toUpperCase() === text || initials(p.name) === text || bare(p.name).split(/\s+/).map((w) => w[0]).join("").toUpperCase() === text);
    if (byInitials.length === 1) return member(byInitials[0]);
  }
  const knownFirst = comrades.filter((c) => c.name.split(/\s+/)[0].toLowerCase() === lower);
  if (knownFirst.length === 1) return fromComrade(knownFirst[0]);
  return { id: null, comradeId: null, name: text, status: "new" };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function runAgendaImport(
  actor: Actor,
  parsed: ParsedAgenda,
  opts: { apply: boolean; people?: PersonHint[] },
): Promise<ImportResult> {
  const { apply } = opts;
  const lines: PlanLine[] = [];
  const warnings = [...parsed.warnings];
  const [profiles, events, agenda, comradeRows] = await Promise.all([listProfiles(), listEvents({}, true), listAgenda(), listComrades()]);
  const comrades: Comrade[] = [...comradeRows];
  let fakeComrade = 0;

  /** Remember a name: add it as a short form of an existing person, or as a new person. */
  async function remember(raw: string, hint?: PersonHint): Promise<Comrade> {
    const alias = raw.replace(/\?$/, "").trim();
    const name = hint?.name?.trim() || alias;
    const target =
      (hint?.profile_id && comrades.find((c) => c.profile_id === hint.profile_id)) ||
      comrades.find((c) => same(c.name, name) || c.aliases.some((a) => same(a, name)));
    if (target) {
      const aliases = cleanAliases(target.name, [...target.aliases, alias, ...(same(name, target.name) ? [] : [name])]);
      if (aliases.length !== target.aliases.length && apply) await updateComrade(target.id, { aliases });
      target.aliases = aliases;
      return target;
    }
    const profileName = hint?.profile_id ? profiles.find((p) => p.id === hint.profile_id)?.name : null;
    const fresh = { name: profileName ?? name, aliases: [alias, name], profile_id: hint?.profile_id ?? null };
    const created = apply
      ? await createComrade(actor, fresh)
      : ({ ...fresh, aliases: cleanAliases(fresh.name, fresh.aliases), id: `new-person-${++fakeComrade}`, created_at: "" } as Comrade);
    comrades.push(created);
    return created;
  }

  // Answers from the preview's "Who's who" go in first, so everything below matches them.
  for (const hint of opts.people ?? []) {
    if (hint.raw?.trim() && (hint.name?.trim() || hint.profile_id)) await remember(hint.raw, hint);
  }

  const seen = new Map<string, ImportPerson>();
  const person = async (raw: string | null): Promise<Person | null> => {
    if (!raw) return null;
    let p = resolvePerson(raw, profiles, comrades);
    const key = raw.replace(/\?$/, "").trim();
    if (p.status === "new") {
      // Kept as written, and remembered so follow-ups can wait on them and next time they're known.
      const c = await remember(raw);
      p = { id: null, comradeId: c.id, name: c.name, status: "new" };
    }
    if (p.status !== "all" && !seen.has(key)) seen.set(key, { raw: key, status: p.status, name: p.name });
    return p;
  };

  // Working copy: real items + ones this import creates, so later steps match earlier ones.
  const items: AgendaItem[] = [...agenda];
  const meetings = events.filter((e) => !e.archived && (e.event_type === "branch" || e.event_type === "committee"));
  let fakeId = 0;

  async function meetingOn(date: string, start: string, create: boolean): Promise<{ event: Event | null; created: boolean }> {
    const sameDay = meetings.filter((e) => londonDate(e.start_time) === date);
    const found = sameDay.find((e) => e.event_type === "branch") ?? sameDay[0];
    if (found || !create) return { event: found ?? null, created: false };
    const draft: Partial<Event> & { title: string } = {
      title: "Branch meeting",
      event_type: "branch",
      start_time: londonISO(date, start),
      location: "",
      is_mobilization: false,
    };
    const event = apply
      ? await createEvent(actor, draft)
      : ({ ...draft, id: `new-${++fakeId}`, posted_by: actor.id, created_at: new Date().toISOString() } as Event);
    meetings.push(event);
    return { event, created: true };
  }

  /** `leadoff` is already resolved to the text shown on the agenda. */
  const touched = new Set<string>();
  async function upsertItem(event: Event, it: { section: AgendaItem["section"]; title: string; duration: number | null; leadoff: string | null; prep: PrepLink[] }, sort: number, kind: PlanLine["kind"]) {
    touched.add(event.id);
    const date = londonDate(event.start_time);
    const pool = items.filter((i) => i.event_id === event.id && !i.archived && i.section === it.section);
    const existing =
      it.section === "political"
        ? pool.find((i) => !/^burning questions/i.test(i.title) && !/^burning questions/i.test(it.title) && sameTopic(i.title, it.title)) ??
          pool.find((i) => norm(i.title) === norm(it.title))
        : pool.find((i) => norm(i.title) === norm(it.title));
    const leadoff = it.leadoff;

    if (!existing) {
      const data: Partial<AgendaItem> & { title: string } = {
        title: it.title,
        section: it.section,
        duration: it.duration ? String(it.duration) : null,
        leadoff_name: leadoff,
        prep_links: it.prep,
        event_id: event.id,
        meeting_date: date,
        icon: it.section === "political" ? "forum" : "event_note",
        sort_order: sort,
      };
      const created = apply ? await createAgendaItem(actor, data) : ({ ...data, id: `new-item-${++fakeId}`, created_at: "" } as AgendaItem);
      items.push(created);
      lines.push({ change: "create", kind, label: it.title, detail: describe(it.duration, leadoff, it.prep.length), date });
      return created;
    }

    const patch: Partial<AgendaItem> = {};
    const title = it.title.length > existing.title.length ? it.title : existing.title;
    if (title !== existing.title) patch.title = title;
    if (it.duration && String(it.duration) !== existing.duration) patch.duration = String(it.duration);
    if (leadoff && leadoff !== existing.leadoff_name) patch.leadoff_name = leadoff;
    const links = [...(existing.prep_links ?? [])];
    for (const l of it.prep) if (!links.some((x) => x.url === l.url)) links.push(l);
    if (links.length !== (existing.prep_links ?? []).length) patch.prep_links = links;

    if (Object.keys(patch).length === 0) {
      lines.push({ change: "same", kind, label: existing.title, detail: "already on the agenda", date });
      return existing;
    }
    Object.assign(existing, patch);
    if (apply) await updateAgendaItem(existing.id, patch);
    lines.push({ change: "update", kind, label: title, detail: Object.keys(patch).map((k) => k.replace("_name", "").replace("prep_links", "prep links")).join(", ") + " updated", date });
    return existing;
  }

  // ---- 1. the meeting --------------------------------------------------------
  const m = parsed.meeting;
  let main: Event | null = null;
  if (m.date) {
    const start = m.start ?? "18:30";
    const { event, created } = await meetingOn(m.date, start, true);
    main = event!;
    const chair = await person(m.chair);
    const minutes = await person(m.minutes);
    const patch: Partial<Event> = {};
    if (!created && m.start && londonTime(main.start_time) !== m.start) patch.start_time = londonISO(m.date, m.start);
    if (m.meet) {
      const meetISO = londonISO(m.date, m.meet);
      if (main.meetup_time !== meetISO) patch.meetup_time = meetISO;
    }
    if (chair?.id && chair.id !== main.chair_id) patch.chair_id = chair.id;
    if (minutes?.id && minutes.id !== main.minutes_id) patch.minutes_id = minutes.id;
    if (chair?.id && !main.lead_id) patch.lead_id = chair.id;
    if (m.location && m.location !== main.location) patch.location = m.location;
    if (Object.keys(patch).length && apply) main = (await updateEvent(main.id, patch)) ?? main;
    else Object.assign(main, patch);
    const bits = [
      `${m.date} ${m.start ?? start}${m.meet ? ` · meet ${m.meet}` : ""}`,
      chair ? `chair ${chair.name}${chair.id ? "" : " (no account yet, so not set)"}` : null,
      minutes ? `minutes ${minutes.name}${minutes.id ? "" : " (no account yet, so not set)"}` : null,
      m.location ?? (created ? "location TBC" : null),
    ].filter(Boolean);
    lines.push({ change: created ? "create" : Object.keys(patch).length ? "update" : "same", kind: "meeting", label: main.title, detail: bits.join(" · "), date: m.date });

    // ---- 2. its items --------------------------------------------------------
    let orgSort = 10;
    for (const it of parsed.items) {
      const sort = it.section === "political" ? (/^burning/i.test(it.title) ? 1 : 2) : orgSort++;
      await upsertItem(main, { ...it, leadoff: (await person(it.lead))?.name ?? null }, sort, it.section);
    }
  }

  // ---- 3. Branch Programme ----------------------------------------------------
  const programmeStart = m.start ?? "18:30";
  for (const row of parsed.programme) {
    if (!row.date) {
      lines.push({ change: "skip", kind: "programme", label: row.topic, detail: "no date yet", date: null });
      continue;
    }
    const { event, created } = await meetingOn(row.date, programmeStart, true);
    if (created) lines.push({ change: "create", kind: "meeting", label: "Branch meeting", detail: `${row.date} ${programmeStart} · from the programme`, date: row.date });
    const who = row.comrade ? await person(row.comrade) : null;
    await upsertItem(
      event!,
      { section: "political", title: row.topic.replace(/\?$/, ""), duration: null, leadoff: who ? leadLabel(who.name, row.tentative) : null, prep: [] },
      2,
      "programme",
    );
  }

  // ---- 4. follow-ups → who follows up whom (a standing list, not dated tasks) ------
  const followUps = await listFollowUps();
  for (const f of parsed.followUps) {
    const by = await person(f.by);
    if (!by || by.status === "all") continue;
    const who = bare(by.name).split(/\s+/)[0];
    for (const name of f.names) {
      const target = await person(name);
      if (!target || target.status === "all") continue;
      const personId = target.comradeId ?? (target.id ? (comrades.find((c) => c.profile_id === target.id)?.id ?? null) : null);
      const current = personId ? followUps.find((x) => x.person_id === personId) : null;
      const same = current && ((by.id && current.follower_id === by.id) || (!by.id && by.comradeId && current.follower_comrade_id === by.comradeId));
      if (same) {
        lines.push({ change: "same", kind: "follow-up", label: `${who} → ${name}`, detail: "already following them up" });
        continue;
      }
      if (apply) {
        // Members get a People entry too, so they can be followed up like anyone else.
        const pid = personId && !personId.startsWith("new-") ? personId : (await remember(name)).id;
        const followerComrade = by.comradeId && !by.comradeId.startsWith("new-") ? by.comradeId : null;
        followUps.push(await setFollowUp(actor, pid, by.id ? { profile_id: by.id } : { comrade_id: followerComrade }));
      }
      const before = current ? (current.follower_id ? (profiles.find((p) => p.id === current.follower_id)?.name ?? "someone") : (comrades.find((c) => c.id === current.follower_comrade_id)?.name ?? "someone")) : null;
      lines.push({
        change: current ? "update" : "create",
        kind: "follow-up",
        label: `${who} → ${name}`,
        detail: before ? `handed over from ${bare(before).split(/\s+/)[0]}` : by.id ? `on ${who}'s list` : `${who} has no account yet — on their list once they join`,
      });
    }
  }

  const fresh = [...seen.values()].filter((p) => p.status === "new");
  if (fresh.length) {
    warnings.push(
      `New name${fresh.length === 1 ? "" : "s"}: ${fresh.map((p) => p.raw).join(", ")}. They'll be added to People as written — say who they are below so they match next time.`,
    );
  }
  if (apply) await logActivity(actor, "import.agenda", "agenda", null, main?.id ?? null, `${lines.filter((l) => l.change === "create" || l.change === "update").length} change(s) from an agenda doc`);
  // ---- 5. Name each branch meeting after its topic ------------------------------
  for (const id of touched) {
    const ev = meetings.find((e) => e.id === id);
    if (!ev || ev.event_type !== "branch") continue;
    const topic = meetingTopic(ev.id, items);
    if (!topic || topic === ev.title || !isAutoTitle(ev.title)) continue;
    if (apply && !ev.id.startsWith("new-")) await updateEvent(ev.id, { title: topic });
    const created = lines.find((l) => l.kind === "meeting" && l.date === londonDate(ev.start_time) && l.change === "create");
    if (created) created.label = topic;
    else lines.push({ change: "update", kind: "meeting", label: topic, detail: `renamed from “${ev.title}”`, date: londonDate(ev.start_time) });
    ev.title = topic;
  }

  return { lines, warnings, people: [...seen.values()], eventId: main && !main.id.startsWith("new-") ? main.id : null, applied: apply };
}

function describe(duration: number | null, lead: string | null, links: number) {
  return [duration ? `${duration} min` : null, lead ? `lead ${lead}` : null, links ? `${links} prep link${links === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || undefined;
}
