import type { Actor } from "./auth";
import type { AwayRange, Event } from "./types";
import { eventLead } from "./types";
import { isSupabaseConfigured } from "./config";
import { createAdminClient } from "./supabase/server";
import { listEvents, listProfiles, listRsvps, setRsvp, updateEvent } from "./data";
import { claimBringItem, listEventExtras, setEventRole, shortTitle } from "./data-extras";
import { sendPush } from "./push";

/*
 * You've said you're away (a trip, exams, or "can't do this afternoon").
 * Anything you'd signed up for in that window is handed back, and whoever
 * runs it hears straight away, with your reason if you gave one. Nobody
 * finds out on the day.
 */

const londonDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const londonTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false });

/** Does this away range cover the event? Part-day ranges count if the event starts inside them (or within 2h before the end of the window). */
function awayCovers(r: AwayRange, e: Pick<Event, "start_time">) {
  const day = londonDay(e.start_time);
  if (day < r.from || day > r.to) return false;
  if (!r.start || !r.end) return true;
  const t = londonTime(e.start_time);
  // An event starting up to 2h before the window still overlaps it.
  const [sh, sm] = r.start.split(":").map(Number);
  const earliest = `${String(Math.max(0, sh - 2)).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
  return t >= earliest && t < r.end;
}

/** Same range? (used to find the newly added ones) */
export const sameRange = (a: AwayRange, b: AwayRange) => a.from === b.from && a.to === b.to && (a.start ?? "") === (b.start ?? "") && (a.end ?? "") === (b.end ?? "");

/** Hand back what the new away ranges clash with and tell the people affected. Returns what changed, for the toast. */
export async function applyAway(actor: Actor, added: AwayRange[]) {
  if (!added.length) return { events: [] as string[] };
  const now = Date.now();
  const [events, rsvps, extras, profiles] = await Promise.all([listEvents({}, true, actor.id), listRsvps(), listEventExtras(), listProfiles()]);
  const gsIds = profiles.filter((p) => p.role.includes("general_secretary")).map((p) => p.id);
  const touched: string[] = [];

  for (const e of events) {
    if (e.archived || e.status === "off" || Date.parse(e.start_time) < now) continue;
    const r = added.find((x) => awayCovers(x, e));
    if (!r) continue;
    const when = r.start && r.end ? `${r.start}–${r.end}` : r.from === r.to ? "that day" : "then";
    const mine = rsvps.find((x) => x.event_id === e.id && x.user_id === actor.id)?.status;
    const out = await handBack(actor, e, { extras, gsIds, why: `Away ${when}${r.note ? `: ${r.note}` : ""}.`, notifyIfOnlyGoing: !!mine && mine !== "no" });
    if (mine && mine !== "no") await setRsvp(actor, e.id, "no").catch(() => undefined);
    if (out || (mine && mine !== "no")) touched.push(shortTitle(e.title));
  }
  return { events: touched };
}

type Extras = Awaited<ReturnType<typeof listEventExtras>>;

/**
 * Step someone out of one event: their bring items and roles go back on the
 * list, chair/minutes are freed, and the lead (or the GS, if it was theirs)
 * hears what's now free. Returns whether they had anything to hand back.
 */
export async function handBack(actor: Actor, e: Event, opts: { why: string; extras?: Extras; gsIds?: string[]; notifyIfOnlyGoing?: boolean }) {
  const extras = opts.extras ?? (await listEventExtras());
  const gsIds = opts.gsIds ?? (await listProfiles()).filter((p) => p.role.includes("general_secretary")).map((p) => p.id);
  const bringing = extras.bring.filter((b) => b.event_id === e.id && b.claimed_by === actor.id);
  const roles = extras.roles.filter((x) => x.event_id === e.id && x.user_id === actor.id);
  const lead = eventLead(e);
  const isLead = lead === actor.id;
  const chairOrMinutes = [e.chair_id === actor.id ? "chairing" : null, e.minutes_id === actor.id ? "taking minutes" : null].filter((x): x is string => !!x);
  const had = [
    isLead ? "leading it" : null,
    ...chairOrMinutes,
    bringing.length ? `bringing ${bringing.map((b) => b.label ?? "an item").join(", ")}` : null,
    roles.length ? roles.map((x) => x.role.toLowerCase()).join(", ") : null,
  ].filter(Boolean);
  if (!had.length && !opts.notifyIfOnlyGoing) return false;

  for (const b of bringing) await claimBringItem(actor, b, false).catch(() => undefined);
  for (const x of roles) await setEventRole(x.id, null).catch(() => undefined);
  if (chairOrMinutes.length) await clearMeetingRoles(e, actor.id);

  const first = actor.name.replace(/^Comrade\s+/i, "").split(" ")[0];
  const to = (isLead ? gsIds : [lead]).filter((id): id is string => !!id && id !== actor.id);
  await sendPush(to, "lead_updates", {
    title: `${first} can't make ${shortTitle(e.title)}`,
    body: `${opts.why}${had.length ? ` Was ${had.join("; ")}, now free for someone else.` : ""}`,
    url: `/events/${e.id}`,
    tag: `away-${e.id}-${actor.id}`,
    actions: [{ action: "open", title: "Open" }],
  }).catch(() => 0);
  return had.length > 0;
}

/** Chair / minutes are lead-or-officer edits under RLS; stepping yourself down uses the service role. */
async function clearMeetingRoles(e: Event, userId: string) {
  const patch: Partial<Event> = {};
  if (e.chair_id === userId) patch.chair_id = null;
  if (e.minutes_id === userId) patch.minutes_id = null;
  if (!isSupabaseConfigured) {
    await updateEvent(e.id, patch);
    return;
  }
  await createAdminClient()?.from("events").update(patch).eq("id", e.id);
}
