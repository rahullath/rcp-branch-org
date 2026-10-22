import { retitleLinks } from "@/lib/link-title";
import { json } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/config";
import { devStore } from "@/lib/dev-store";
import { createAdminClient } from "@/lib/supabase/server";
import { claimOnce, isPushConfigured, sendPush } from "@/lib/push";
import { bringPayload, notifyDecide, rsvpPayload } from "@/lib/notify";
import { goingCount, londonDay, needsDecision } from "@/lib/follow-through";
import { shortTitle } from "@/lib/data-extras";
import type { AgendaAction, BringItem, Contact, Event, EventGuest, EventInvite, Material, Profile, Rsvp, SharedRead } from "@/lib/types";
import { didRead, expectsReading, mainRead, PREREAD_TYPES } from "@/lib/preread";
import { contactOwner, contactTier, eventLead, INVITE_EVENT_TYPES } from "@/lib/types";
import { inSetupWindow } from "@/lib/setup";

export const dynamic = "force-dynamic";

const H = 3600_000;

/**
 * Daily reminder run (vercel.json cron). Sends, at most once each:
 * - the 48h reminder, only to people who haven't answered (events 36–60h out);
 * - bring-list gaps the day before, to people going and the lead (events 12–36h out);
 * - "you're bringing X tomorrow" to whoever said they'd bring it;
 * - the day before a branch meeting / reading group: anyone who hasn't done
 *   any of the readings gets one nudge;
 * - the lead, a few days before: check it's set up and post it in the branch chat;
 * - two or three days before an open meeting, branch or social: anyone with
 *   contacts nobody's invited yet, "anyone to bring?";
 * - the Sunday summary, to people who turned it on;
 * - "call it" to the lead of a tentative event past its deadline and short;
 * - actions due today (or overdue, once per due date) to their owner.
 * Protected by CRON_SECRET (Vercel sends it as a bearer token).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authed = secret ? request.headers.get("authorization") === `Bearer ${secret}` : !isSupabaseConfigured;
  if (!authed) return json({ error: "Unauthorized" }, { status: 401 });
  // Links saved as "Article" or "Video": give them their real titles.
  const admin = createAdminClient();
  if (admin) await retitleLinks(admin).catch(() => 0);
  if (!isPushConfigured) return json({ ok: true, skipped: "push not configured" });

  const src = await load();
  if (!src) return json({ ok: true, skipped: "SUPABASE_SERVICE_ROLE_KEY not set" });
  const now = Date.now();
  const live = src.events.filter((e) => !e.archived && e.status !== "off");
  let reminders = 0;
  let gaps = 0;

  for (const e of live) {
    const until = new Date(e.start_time).getTime() - now;
    const rsvps = src.rsvps.filter((r) => r.event_id === e.id);

    if (until > 36 * H && until <= 60 * H) {
      // Only the event's own branch — unless it's a district/national event.
      const audience = src.profiles
        .filter((p) => (e.scope && e.scope !== "branch") || !e.branch_id || p.branch_id === e.branch_id)
        // Committee meetings: officers and invitees only.
        .filter((p) => e.event_type !== "committee" || (p.role ?? []).some((r) => r !== "member") || (e.invitees ?? []).includes(p.id));
      const unanswered = audience.map((p) => p.id).filter((id) => !rsvps.some((r) => r.user_id === id));
      const fresh = [];
      for (const id of unanswered) if (await claimOnce(`remind48-${e.id}-${id}`)) fresh.push(id);
      const when = new Date(e.start_time).toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
      reminders += await sendPush(fresh, "reminders", rsvpPayload(e, `${shortTitle(e.title)} is ${when}`, "You haven't answered yet. Are you coming?"));
    }

    if (until > 12 * H && until <= 36 * H) {
      const going = rsvps.filter((r) => r.status === "going").map((r) => r.user_id);
      const lead = eventLead(e);
      for (const item of src.bring.filter((b) => b.event_id === e.id && !b.claimed_by)) {
        if (!(await claimOnce(`gap-${item.id}`))) continue;
        const material = src.materials.find((m) => m.id === item.material_id) ?? null;
        gaps += await sendPush([...new Set([...going, ...(lead ? [lead] : [])])], "bring_gaps", bringPayload(e, item, material));
      }
      for (const item of src.bring.filter((b) => b.event_id === e.id && b.claimed_by && !b.brought_at)) {
        if (!(await claimOnce(`bringing-${item.id}`))) continue;
        const label = src.materials.find((m) => m.id === item.material_id)?.name ?? item.label ?? "your item";
        gaps += await sendPush([item.claimed_by!], "bring_gaps", {
          title: `Bringing ${label} tomorrow`,
          body: `For ${shortTitle(e.title)}. Can't now? Say so in the app and it goes back on the list.`,
          url: "/inbox",
          tag: `bringing-${item.id}`,
          actions: [{ action: "open", title: "Open" }],
        });
      }
    }
  }

  // Pre-reads, the day before (12–36h out): one nudge to whoever hasn't done any of them. Nobody else is told.
  let prereads = 0;
  for (const e of live) {
    const until = new Date(e.start_time).getTime() - now;
    if (!PREREAD_TYPES.includes(e.event_type) || until <= 12 * H || until > 36 * H) continue;
    const reads = src.reads.filter((x) => x.event_id === e.id);
    const main = mainRead(reads);
    if (!main) continue;
    const branchPeople = src.profiles.filter((p) => !e.branch_id || p.branch_id === e.branch_id);
    for (const p of branchPeople) {
      const theirs = src.rsvps.find((x) => x.event_id === e.id && x.user_id === p.id)?.status;
      if (!expectsReading(e, theirs) || didRead(reads, p.id)) continue;
      if (await claimOnce(`preread-${e.id}-${p.id}`)) {
        prereads += await sendPush([p.id], "reminders", {
          title: `Before ${shortTitle(e.title)} tomorrow`,
          body: `One thing to read or listen to, if you can. It makes the discussion.`,
          url: "/inbox",
          tag: `preread-${e.id}`,
          actions: [{ action: "open", title: "Open" }],
        });
      }
    }
  }

  // Leads: once, when the event comes into its set-up window.
  let setups = 0;
  for (const e of live) {
    const lead = eventLead(e);
    if (!lead || !inSetupWindow(e, now) || !(await claimOnce(`setup-${e.id}`))) continue;
    const days = Math.round((new Date(e.start_time).getTime() - now) / (24 * H));
    setups += await sendPush([lead], "lead_updates", {
      title: `You're leading ${shortTitle(e.title)} ${days <= 1 ? "tomorrow" : `in ${days} days`}`,
      body: "Check it's set up, and post it in the branch chat. One tap from your inbox.",
      url: "/inbox",
      tag: `setup-${e.id}`,
      actions: [{ action: "open", title: "Open" }],
    });
  }

  // Bring someone: 2–3 days before, to whoever has contacts nobody's invited. Names are theirs only.
  let bring = 0;
  for (const e of live) {
    const until = new Date(e.start_time).getTime() - now;
    if (!INVITE_EVENT_TYPES.includes(e.event_type) || until <= 48 * H || until > 72 * H) continue;
    const invited = new Set(src.invites.filter((i) => i.event_id === e.id).map((i) => i.contact_id));
    const owners = new Map<string, string[]>();
    for (const c of src.contacts) {
      const owner = contactOwner(c);
      if (!owner || !c.phone || c.stage === "joined" || contactTier(c) === "cold" || invited.has(c.id)) continue;
      // Their own branch's events only.
      if (e.branch_id && src.profiles.find((p) => p.id === owner)?.branch_id !== e.branch_id) continue;
      owners.set(owner, [...(owners.get(owner) ?? []), c.name.split(/\s+/)[0]]);
    }
    for (const [owner, names] of owners) {
      if (src.invites.some((i) => i.event_id === e.id && i.invited_by === owner) || !(await claimOnce(`bring-${e.id}-${owner}`))) continue;
      bring += await sendPush([owner], "lead_updates", {
        title: `Anyone to bring to ${shortTitle(e.title)}?`,
        body: `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}. One message each, from your inbox.`,
        url: "/inbox",
        tag: `bring-${e.id}`,
        actions: [{ action: "open", title: "Open" }],
      });
    }
  }

  let decisions = 0;
  for (const e of live) {
    const lead = eventLead(e);
    const going = goingCount(e, src.rsvps, src.guests);
    if (!lead || !needsDecision(e, going, now) || !(await claimOnce(`decide-${e.id}-${e.confirm_by}`))) continue;
    await notifyDecide(e, going, lead);
    decisions++;
  }

  let due = 0;
  const today = londonDay(now);
  for (const a of src.actions) {
    if (a.done || !a.owner_id || !a.due_date || a.due_date > today) continue;
    if (!(await claimOnce(`due-${a.id}-${a.due_date}`))) continue;
    due += await sendPush([a.owner_id], "reminders", {
      title: a.due_date === today ? "Due today" : "Overdue",
      body: a.text,
      url: "/inbox",
      tag: `action-${a.id}`,
      actions: [{ action: "open", title: "Open" }],
    });
  }

  let digests = 0;
  const london = new Date().toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" });
  if (london === "Sun" && (await claimOnce(`digest-${new Date().toISOString().slice(0, 10)}`))) {
    const week = live.filter((e) => {
      const t = new Date(e.start_time).getTime() - now;
      return t > 0 && t < 7 * 24 * H;
    });
    // One digest per branch: its own events plus the district/national ones.
    const branches = [...new Set(src.profiles.map((p) => p.branch_id ?? null))];
    for (const branch of branches) {
      const mine = week.filter((e) => e.event_type !== "committee" && ((e.scope && e.scope !== "branch") || !e.branch_id || e.branch_id === branch));
      if (mine.length === 0) continue;
      digests += await sendPush(src.profiles.filter((p) => (p.branch_id ?? null) === branch).map((p) => p.id), "sunday_digest", {
        title: `This week: ${mine.length} event${mine.length === 1 ? "" : "s"}`,
        body: mine.slice(0, 4).map((e) => shortTitle(e.title)).join(" · "),
        url: "/home",
        tag: "digest",
        actions: [{ action: "open", title: "Open" }],
      });
    }
  }

  return json({ ok: true, reminders, gaps, prereads, setups, bring, decisions, due, digests });
}

type Sources = {
  events: Event[];
  rsvps: Rsvp[];
  bring: BringItem[];
  materials: Material[];
  profiles: Pick<Profile, "id" | "branch_id" | "role" | "name">[];
  guests: EventGuest[];
  actions: AgendaAction[];
  reads: SharedRead[];
  contacts: Contact[];
  invites: Pick<EventInvite, "event_id" | "contact_id" | "invited_by">[];
};

async function load(): Promise<Sources | null> {
  if (!isSupabaseConfigured) {
    const db = devStore.load();
    const viaLink = (db.share_rsvps ?? []).map((r) => ({ id: r.id, event_id: r.event_id, comrade_id: "", status: "going" as const, created_at: r.created_at }));
    return {
      events: db.events,
      rsvps: db.rsvps as Rsvp[],
      bring: db.event_bring,
      materials: db.materials,
      profiles: db.profiles,
      guests: [...(db.event_guests ?? []), ...viaLink],
      actions: db.agenda_actions,
      reads: db.shared_reads ?? [],
      contacts: db.contacts ?? [],
      invites: db.event_invites ?? [],
    };
  }
  const admin = createAdminClient();
  if (!admin) return null;
  const since = new Date(Date.now() - 6 * H).toISOString();
  const [events, rsvps, bring, materials, profiles, guests, actions, viaLink, reads, contacts, invites] = await Promise.all([
    admin.from("events").select("*").eq("archived", false).gte("start_time", since),
    admin.from("rsvps").select("*"),
    admin.from("event_bring").select("*"),
    admin.from("materials").select("*"),
    admin.from("profiles").select("id,branch_id,role,name").not("branch_id", "is", null),
    admin.from("event_guests").select("*"),
    admin.from("agenda_actions").select("*").eq("done", false),
    admin.from("share_rsvps").select("id,event_id,created_at"),
    admin.from("shared_reads").select("*").not("event_id", "is", null),
    admin.from("contacts").select("*").or("archived.is.null,archived.eq.false"),
    admin.from("event_invites").select("event_id,contact_id,invited_by"),
  ]);
  return {
    events: (events.data ?? []) as Event[],
    rsvps: (rsvps.data ?? []) as Rsvp[],
    bring: (bring.data ?? []) as BringItem[],
    materials: (materials.data ?? []) as Material[],
    profiles: (profiles.data ?? []) as Pick<Profile, "id" | "branch_id" | "role" | "name">[],
    guests: [
      ...((guests.data ?? []) as EventGuest[]),
      ...((viaLink.data ?? []) as { id: string; event_id: string; created_at: string }[]).map((r) => ({ ...r, comrade_id: "", status: "going" as const })),
    ],
    actions: (actions.data ?? []) as AgendaAction[],
    reads: (reads.data ?? []) as SharedRead[],
    contacts: (contacts.data ?? []) as Contact[],
    invites: (invites.data ?? []) as Pick<EventInvite, "event_id" | "contact_id" | "invited_by">[],
  };
}
