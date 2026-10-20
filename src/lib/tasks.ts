import type { AgendaAction, AgendaItem, Availability, AwayRange, Comrade, Event, FollowUp, Profile } from "./types";

/*
 * Spreading the work. Leaders doing everything themselves burns them out
 * and keeps everyone else from learning; handing out orders doesn't build
 * anyone either. These read what's already in the app to answer: what's
 * up for grabs, who's carrying a lot, who hasn't had a go at chairing, and
 * what got done since the last branch. Client-safe, no I/O.
 */

/** Days an open ask waits before it's flagged to the general secretary. */
export const OPEN_STALE_DAYS = 3;

export const isOpenTask = (a: AgendaAction) => !a.done && !a.owner_id && !a.owner_comrade_id;

const DAY = 86400_000;
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dayAfter = (day: string) => addDays(day, 1);

/** The away range covering `day` for this person, if any. */
export function awayOn(avail: Availability[], userId: string, day: string): AwayRange | null {
  for (const a of avail) if (a.user_id === userId) for (const r of a.away ?? []) if (r.from <= day && day <= r.to) return r;
  return null;
}

/** Away now, or starting within a fortnight. */
export function awaySoon(avail: Availability[], userId: string, today: string): AwayRange | null {
  const horizon = addDays(today, 14);
  let best: AwayRange | null = null;
  for (const a of avail)
    if (a.user_id === userId)
      for (const r of a.away ?? []) if (r.to >= today && r.from <= horizon && (!best || r.from < best.from)) best = r;
  return best;
}

export interface Load {
  tasks: number;
  overdue: number;
  followUps: number;
  /** Events they lead in the next two weeks. */
  leading: number;
  away: AwayRange | null;
}

export function workload(
  profiles: Pick<Profile, "id">[],
  src: { actions: AgendaAction[]; followUps: FollowUp[]; events: Event[]; availability: Availability[] },
  today: string,
  now: number,
): Map<string, Load> {
  const map = new Map<string, Load>();
  for (const p of profiles) {
    const mine = src.actions.filter((a) => !a.done && a.owner_id === p.id);
    map.set(p.id, {
      tasks: mine.length,
      overdue: mine.filter((a) => a.due_date && a.due_date < today).length,
      followUps: src.followUps.filter((f) => f.active && f.follower_id === p.id).length,
      leading: src.events.filter((e) => !e.archived && e.status !== "off" && (e.lead_id ?? e.posted_by) === p.id && Date.parse(e.start_time) >= now && Date.parse(e.start_time) - now < 14 * DAY).length,
      away: awaySoon(src.availability, p.id, today),
    });
  }
  return map;
}

const shortDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "3 tasks · away 14–18 Oct" — shown next to names wherever work is given out. */
export function loadHint(l: Load | undefined, today: string) {
  if (!l) return "";
  const bits: string[] = [];
  const total = l.tasks + l.leading;
  bits.push(total === 0 ? "free" : [l.tasks && `${l.tasks} task${l.tasks === 1 ? "" : "s"}`, l.leading && `leading ${l.leading}`].filter(Boolean).join(", "));
  if (l.overdue) bits.push(`${l.overdue} overdue`);
  if (l.away) bits.push(l.away.from <= today ? `away till ${shortDate(l.away.to)}` : `away ${shortDate(l.away.from)}–${shortDate(l.away.to)}`);
  return bits.join(" · ");
}

/* ---------------- rotation ---------------- */

export type RotaRole = "chair" | "minutes" | "leadoff";
export const ROTA_LABEL: Record<RotaRole, string> = { chair: "Chair", minutes: "Minutes", leadoff: "Lead-off" };

const bare = (s: string) => s.replace(/^comrade\s+/i, "").trim().toLowerCase();
const initialsOf = (s: string) =>
  bare(s)
    .split(/\s+/)
    .map((w) => w[0])
    .join("");

/** A lead-off is stored as written ("JB", "Sarah"); match it to an account. */
export function profileForName(raw: string, profiles: Pick<Profile, "id" | "name" | "initials">[]): string | null {
  const q = bare(raw);
  if (!q) return null;
  const hit =
    profiles.find((p) => bare(p.name) === q) ??
    profiles.find((p) => (p.initials ?? "").toLowerCase() === q || initialsOf(p.name) === q) ??
    profiles.find((p) => bare(p.name).split(/\s+/)[0] === q);
  return hit?.id ?? null;
}

const isBranchMeeting = (e: Event) => e.event_type === "branch" && !e.archived && e.status !== "off";

/**
 * Who's had a go at each job, least recent first — people who never have
 * lead the list. The suggestion is someone to ask, not someone to assign.
 */
export function rota(role: RotaRole, profiles: Pick<Profile, "id" | "name" | "initials">[], events: Event[], items: AgendaItem[], now: number) {
  const last = new Map<string, { at: string; times: number }>();
  const mark = (id: string | null | undefined, at: string) => {
    if (!id) return;
    const cur = last.get(id);
    last.set(id, { at: !cur || at > cur.at ? at : cur.at, times: (cur?.times ?? 0) + 1 });
  };
  if (role === "leadoff") {
    for (const i of items) if (i.section === "political" && !i.archived && i.leadoff_name && i.meeting_date && Date.parse(i.meeting_date) <= now) mark(profileForName(i.leadoff_name, profiles), i.meeting_date);
  } else {
    for (const e of events) if (isBranchMeeting(e) && Date.parse(e.start_time) <= now) mark(role === "chair" ? e.chair_id : e.minutes_id, e.start_time.slice(0, 10));
  }
  return profiles
    .map((p) => ({ id: p.id, name: p.name, last: last.get(p.id)?.at ?? null, times: last.get(p.id)?.times ?? 0 }))
    .sort((a, b) => (a.last ?? "").localeCompare(b.last ?? "") || a.times - b.times || a.name.localeCompare(b.name));
}

/** The next branch meeting with a chair or minutes slot still empty (within three weeks). */
export function nextMeetingGaps(events: Event[], now: number) {
  const next = events.filter((e) => isBranchMeeting(e) && Date.parse(e.start_time) > now && Date.parse(e.start_time) - now < 21 * DAY).sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
  if (!next) return null;
  const gaps = (["chair", "minutes"] as const).filter((r) => !(r === "chair" ? next.chair_id : next.minutes_id));
  return { event: next, gaps };
}

/* ---------------- done since last branch ---------------- */

export function lastBranchMeeting(events: Event[], now: number) {
  return events.filter((e) => isBranchMeeting(e) && Date.parse(e.start_time) < now).sort((a, b) => b.start_time.localeCompare(a.start_time))[0] ?? null;
}

/**
 * What each person did since the last branch meeting: actions ticked off,
 * events they led, people they kept in touch with. For the meeting to
 * recognise, so it isn't only the misses that get mentioned.
 */
export function doneSince(
  since: number,
  now: number,
  src: {
    actions: AgendaAction[];
    events: Event[];
    followUps: FollowUp[];
    profiles: Pick<Profile, "id" | "name" | "initials">[];
    comrades: Pick<Comrade, "id" | "name">[];
    /** Contacts moved on, per comrade (counts only). */
    progress?: { owner_id: string; talked: number; came: number; joined: number; invited: number }[];
  },
) {
  const by = new Map<string, { name: string; items: string[] }>();
  const add = (key: string, name: string, item: string) => {
    const cur = by.get(key) ?? { name, items: [] };
    cur.items.push(item);
    by.set(key, cur);
  };
  const pname = (id: string) => {
    const p = src.profiles.find((x) => x.id === id);
    return p ? p.name : null;
  };
  const inRange = (iso?: string | null) => !!iso && Date.parse(iso) >= since && Date.parse(iso) <= now;
  for (const a of src.actions) {
    if (!a.done || !inRange(a.done_at)) continue;
    if (a.owner_id && pname(a.owner_id)) add(a.owner_id, pname(a.owner_id)!, a.text);
    else if (a.owner_comrade_id) {
      const c = src.comrades.find((x) => x.id === a.owner_comrade_id);
      if (c) add(c.id, c.name, a.text);
    }
  }
  for (const e of src.events) {
    if (e.archived || e.status === "off" || !inRange(e.start_time)) continue;
    const lead = e.lead_id ?? e.posted_by;
    if (lead && pname(lead)) add(lead, pname(lead)!, `Led ${e.title.split(" — ")[0]}`);
  }
  const touched = new Map<string, number>();
  for (const f of src.followUps) if (f.follower_id && inRange(f.last_touched_at)) touched.set(f.follower_id, (touched.get(f.follower_id) ?? 0) + 1);
  for (const [id, n] of touched) if (pname(id)) add(id, pname(id)!, `Kept in touch with ${n} ${n === 1 ? "person" : "people"}`);
  for (const p of src.progress ?? []) {
    const n = pname(p.owner_id);
    if (!n) continue;
    if (p.joined) add(p.owner_id, n, `${p.joined} contact${p.joined === 1 ? "" : "s"} joined`);
    if (p.came) add(p.owner_id, n, `${p.came} contact${p.came === 1 ? "" : "s"} came to something`);
    if (p.invited) add(p.owner_id, n, `Invited ${p.invited} to events`);
  }
  return [...by.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}
