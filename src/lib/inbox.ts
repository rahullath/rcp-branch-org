import type { Actor } from "./auth";
import { canSeeCommittee } from "./auth";
import type {
  Ask,
  Comrade,
  Contact,
  FollowUp,
  MaterialMove,
  Event,
  EventExtras,
  EventGuest,
  EventReport,
  EventInvite,
  AgendaItem,
  SharedRead,
  ImportRequest,
  InboxPayload,
  Material,
  Poll,
  PollVote,
  ReadingGroup,
  ReadingGroupInvite,
  ReadingGroupMember,
  RoleRequest,
  Rsvp,
} from "./types";
import { contactOwner, contactTier, eventLead, INVITE_EVENT_TYPES, reportWriter, type ContactTier } from "./types";
import { isUpcoming, startMs, EVENT_GRACE_MS } from "./dates";
import { listRoleRequests } from "./onboarding";
import { listAgenda, listAllReadingGroupMembers, listAvailability, listProfiles, listContacts, listEvents, listMaterials, listReadingGroups, listRsvps } from "./data";
import {
  listAgendaActions,
  listDismissals,
  listEventExtras,
  listComrades,
  listEventGuests,
  listEventReports,
  listFollowUps,
  listMaterialMoves,
  listReadingGroupInvites,
  listPolls,
  listImportRequests,
  listEventInvites,
  listSharedReads,
  MISSING_ACTION,
} from "./data-extras";
import type { AgendaAction, Availability } from "./types";
import { awayOn, isOpenTask, OPEN_STALE_DAYS } from "./tasks";
import { didRead, expectsReading, mainRead } from "./preread";
import { inSetupWindow, postedKey, setupChecks } from "./setup";
import { CANDIDATE_QUIET_DAYS, candidacyProgress, isCandidate } from "./candidates";

const bareName = (s: string) => s.replace(/^comrade\s+/i, "").trim().toLowerCase();
import { goingCount, needsDecision, QUIET_DAYS } from "./follow-through";
import { groupLeadIds } from "./reading-groups";

/** RSVP asks only cover the next fortnight — further out shows up later. */
const RSVP_WINDOW_MS = 14 * 86400_000;
/** A lead owes a sale report for three weeks, then it quietly drops. */
/** A report not written within a week isn't going to be: stop asking. */
const REPORT_WINDOW_MS = 7 * 86400_000;
/** Holding a material this long gets one "still got it?". */
const STALE_HOLD_MS = 21 * 86400_000;

export { REPORT_EVENT_TYPES } from "./types";
import { REPORT_EVENT_TYPES } from "./types";

interface InboxSources {
  events: Event[];
  rsvps: Pick<Rsvp, "event_id" | "user_id" | "status">[];
  extras: EventExtras;
  polls: Poll[];
  votes: PollVote[];
  reports: EventReport[];
  actions: AgendaAction[];
  materials: Material[];
  moves: MaterialMove[];
  contacts: Pick<Contact, "met_event_id">[];
  /** Names of the signed-in comrade's own contacts, for "did they come?". */
  myContacts?: (Pick<Contact, "id" | "name"> & Partial<Pick<Contact, "phone" | "stage" | "archived">> & { tier?: ContactTier })[];
  eventInvites?: EventInvite[];
  agendaItems?: AgendaItem[];
  reads?: SharedRead[];
  /** For People entries not yet linked to an account: name → profile id. */
  profileIdByName?: Map<string, string>;
  guests: EventGuest[];
  groups: ReadingGroup[];
  groupMembers: ReadingGroupMember[];
  invites: ReadingGroupInvite[];
  followUps: FollowUp[];
  comrades: Comrade[];
  /** Pending "I'm the X officer" — the general secretaries confirm them. */
  roleRequests?: RoleRequest[];
  gsIds?: string[];
  importRequests?: ImportRequest[];
  availability?: Availability[];
  adminIds?: string[];
}

export function pollIsOpen(p: Poll, now: number) {
  return !p.archived && (!p.closes_at || new Date(p.closes_at).getTime() > now);
}

/**
 * Everything that needs this person's answer. Nobody writes inbox items —
 * each one exists because something is missing an answer from them, and
 * disappears the moment it's answered (or they say "not me").
 * Pure, so the reminder cron can run it for every member.
 */
function deriveAsks(userId: string, src: InboxSources, now: number, dismissed: Set<string> = new Set()): Ask[] {
  const asks: Ask[] = [];
  const mine = new Map(src.rsvps.filter((r) => r.user_id === userId).map((r) => [r.event_id, r.status]));
  const upcoming = src.events.filter((e) => !e.archived && isUpcoming(e, now)).sort((a, b) => startMs(a) - startMs(b));

  for (const e of upcoming) {
    if (startMs(e) - now > RSVP_WINDOW_MS || e.status === "off") continue;
    // Reading group sessions only ask the group's members.
    if (e.reading_group_id && !src.groupMembers.some((m) => m.group_id === e.reading_group_id && m.user_id === userId)) continue;
    if (!mine.has(e.id)) asks.push({ k: `rsvp-${e.id}`, kind: "rsvp", event: e });
  }

  // Past its deadline and short of its number: the lead calls it, so nobody turns up alone.
  for (const e of upcoming) {
    if (eventLead(e) !== userId) continue;
    const going = goingCount(e, src.rsvps, src.guests);
    if (needsDecision(e, going, now)) asks.push({ k: `decide-${e.id}-${e.confirm_by}`, kind: "decide", event: e, going });
  }

  for (const inv of src.invites) {
    if (inv.status !== "open") continue;
    const group = src.groups.find((g) => g.id === inv.group_id);
    if (!group) continue;
    if (inv.kind === "invite" && inv.user_id === userId) asks.push({ k: `rg-invite-${inv.id}`, kind: "rg-invite", invite: inv, group });
    if (inv.kind === "request" && inv.user_id !== userId && groupLeadIds(group, src.groupMembers).includes(userId)) {
      asks.push({ k: `rg-request-${inv.id}`, kind: "rg-request", invite: inv, group });
    }
  }

  // You said you'd bring it: a reminder the day before, with a way out.
  for (const e of upcoming) {
    if (startMs(e) - now > 36 * 3600_000 || e.status === "off") continue;
    for (const item of src.extras.bring.filter((b) => b.event_id === e.id && b.claimed_by === userId && !b.brought_at)) {
      const material = item.material_id ? (src.materials.find((m) => m.id === item.material_id) ?? null) : null;
      asks.push({ k: `bring-remind-${item.id}`, kind: "bring-reminder", event: e, item, material });
    }
    // The lead hears what nobody has said they'll bring, while there's time.
    if (eventLead(e) === userId && startMs(e) - now <= 48 * 3600_000) {
      const open = src.extras.bring.filter((b) => b.event_id === e.id && !b.claimed_by);
      if (open.length)
        asks.push({
          k: `bring-gap-${e.id}-${open.length}`,
          kind: "bring-gap",
          event: e,
          items: open.map((b) => ({ id: b.id, label: b.label ?? src.materials.find((m) => m.id === b.material_id)?.name ?? "Item" })),
        });
    }
  }

  // After an event: did the contacts you invited come? Counts towards recruitment.
  const names = new Map((src.myContacts ?? []).map((c) => [c.id, c.name]));
  const byEvent = new Map<string, (EventInvite & { name: string })[]>();
  for (const inv of src.eventInvites ?? []) {
    if (inv.invited_by !== userId || !["invited", "coming", "maybe"].includes(inv.status) || !names.has(inv.contact_id)) continue;
    const list = byEvent.get(inv.event_id) ?? [];
    list.push({ ...inv, name: names.get(inv.contact_id)! });
    byEvent.set(inv.event_id, list);
  }
  for (const [eventId, invites] of byEvent) {
    const e = src.events.find((x) => x.id === eventId);
    if (!e || e.status === "off" || isUpcoming(e, now) || now - startMs(e) > 5 * 86400_000) continue;
    asks.push({ k: `invite-check-${eventId}`, kind: "invite-check", event: e, invites });
  }

  // Never said when you're usually free: one ask, until you do (or say not now). It's what
  // "best times" on Paper sales is built from.
  const mineFree = (src.availability ?? []).filter((a) => a.user_id === userId);
  if (src.availability && !mineFree.some((a) => (a.slots?.length ?? 0) > 0 || a.days.length > 0)) asks.push({ k: "setweek-1", kind: "set-week" });

  // Set up: whoever leads it, a few days before. Checks read off the app; the one thing left is posting it.
  for (const e of src.events) {
    if (e.archived || e.status === "off" || eventLead(e) !== userId || !inSetupWindow(e, now)) continue;
    const checks = setupChecks(e, src);
    const posted = dismissed.has(postedKey(e.id));
    if (posted && checks.every((c) => c.ok)) continue;
    asks.push({ k: `setup-${e.id}`, kind: "setup", event: e, checks, posted });
  }

  // Bring someone: the next open meeting, branch or social in the coming days, and your contacts
  // nobody has invited yet. One card, for the soonest one you haven't invited anyone to.
  const warm = (src.myContacts ?? []).filter((c) => !c.archived && c.phone && c.stage !== "joined" && c.tier !== "cold");
  if (warm.length) {
    const next = src.events
      .filter((e) => INVITE_EVENT_TYPES.includes(e.event_type) && e.status !== "off" && !e.archived && isUpcoming(e, now) && startMs(e) - now < 6 * 86400_000 && startMs(e) - now > 3 * 3600_000)
      .sort((a, b) => startMs(a) - startMs(b))
      .find((e) => !(src.eventInvites ?? []).some((i) => i.event_id === e.id && i.invited_by === userId));
    if (next) {
      const invited = new Set((src.eventInvites ?? []).filter((i) => i.event_id === next.id).map((i) => i.contact_id));
      const people = warm.filter((c) => !invited.has(c.id)).sort((a, b) => Number(a.tier !== "priority") - Number(b.tier !== "priority"));
      if (people.length) asks.push({ k: `bring-${next.id}`, kind: "invite-contacts", event: next, people: people.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null })) });
    }
  }

  // Something to read: one card per event (its main reading), gone once you've done any of them.
  // A branch meeting's pre-read is for everyone who hasn't said they can't come;
  // other events' readings only for whoever's going or maybe. Shared on its own: one card each.
  const readsByEvent = new Map<string, SharedRead[]>();
  for (const r of src.reads ?? []) {
    if (now - Date.parse(r.created_at) > 14 * 86400_000) continue;
    if (!r.event_id) {
      if (r.shared_by !== userId && !r.read_by.includes(userId)) asks.push({ k: `read-${r.id}`, kind: "read", read: r, event: null });
      continue;
    }
    readsByEvent.set(r.event_id, [...(readsByEvent.get(r.event_id) ?? []), r]);
  }
  for (const [eventId, reads] of readsByEvent) {
    const e = src.events.find((x) => x.id === eventId);
    if (!e || !isUpcoming(e, now) || !expectsReading(e, mine.get(e.id)) || didRead(reads, userId)) continue;
    const main = mainRead(reads)!;
    asks.push({ k: `read-${main.id}`, kind: "read", read: main, event: { id: e.id, title: e.title, start_time: e.start_time }, others: reads.length - 1 });
  }

  // Pairing: you're going along with someone, or helping them prep a lead-off.
  for (const f of src.followUps) {
    if (!f.active || f.with_id !== userId) continue;
    const person = src.comrades.find((c) => c.id === f.person_id);
    if (person) asks.push({ k: `pair-fu-${f.id}`, kind: "pair", role: "follow-up", who: f.follower_id, what: person.name, href: "/follow-ups" });
  }
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  for (const i of src.agendaItems ?? []) {
    if (i.prep_with_id !== userId || i.archived || !i.meeting_date || i.meeting_date < today) continue;
    asks.push({ k: `pair-lead-${i.id}`, kind: "pair", role: "lead-off", who: null, what: `${i.leadoff_name ? `${i.leadoff_name}'s lead-off on ` : ""}${i.title}`, href: "/programme", when: i.meeting_date });
  }

  for (const p of src.polls) {
    if (!pollIsOpen(p, now)) continue;
    if (!src.votes.some((v) => v.poll_id === p.id && v.user_id === userId)) {
      asks.push({ k: `poll-${p.id}`, kind: "poll", poll: p, votes: src.votes.filter((v) => v.poll_id === p.id) });
    }
  }

  for (const e of upcoming) {
    if (mine.get(e.id) !== "going") continue;
    for (const item of src.extras.bring.filter((b) => b.event_id === e.id && !b.claimed_by)) {
      const material = item.material_id ? (src.materials.find((m) => m.id === item.material_id) ?? null) : null;
      asks.push({ k: `bring-${item.id}`, kind: "bring", event: e, item, material });
    }
  }

  for (const e of src.events) {
    if (!REPORT_EVENT_TYPES.includes(e.event_type) || e.archived || e.status === "off" || reportWriter(e, src.extras.roles) !== userId) continue;
    // Only reading group *sessions* (linked to a group) get the short report.
    if (e.event_type === "reading_group" && !e.reading_group_id) continue;
    const ended = startMs(e) + EVENT_GRACE_MS;
    if (ended > now || now - ended > REPORT_WINDOW_MS) continue;
    if (src.reports.some((r) => r.event_id === e.id)) continue;
    asks.push({
      k: `report-${e.id}`,
      kind: "report",
      event: e,
      contactsLogged: src.contacts.filter((c) => c.met_event_id === e.id).length,
      went: src.rsvps.filter((r) => r.event_id === e.id && r.status === "going").map((r) => r.user_id),
    });
  }

  // Actions sit in the inbox until done; each push a week re-asks (the key includes the date).
  for (const a of src.actions) {
    if (a.owner_id === userId && !a.done) {
      // Due while you're away: move it or hand it on, before it's late.
      const away = a.due_date && a.due_date >= today ? awayOn(src.availability ?? [], userId, a.due_date) : null;
      if (away) asks.push({ k: `away-${a.id}-${a.due_date}`, kind: "away-clash", action: a, away });
      else asks.push({ k: `action-${a.id}${a.due_date ? `-${a.due_date}` : ""}`, kind: "action", action: a });
    }
  }

  // Open asks: anyone can take one. Not shown to whoever posted or handed it on.
  // After a few days untaken, the secretary sees it flagged.
  const isGs = !!src.gsIds?.includes(userId);
  for (const a of src.actions) {
    if (!isOpenTask(a) || a.handed_from === userId) continue;
    const days = Math.floor((now - Date.parse(a.open_since ?? a.created_at)) / 86400_000);
    const stale = isGs && days >= OPEN_STALE_DAYS;
    if (a.created_by === userId && !stale) continue;
    asks.push({ k: `open-${a.id}${stale ? "-stale" : ""}`, kind: "open-task", action: a, days, stale });
  }

  // People you follow up who've gone quiet: one nudge per quiet stretch.
  for (const f of src.followUps) {
    if (f.follower_id !== userId || !f.active) continue;
    const since = f.last_touched_at ?? f.created_at;
    const days = Math.floor((now - Date.parse(since)) / 86400_000);
    const person = src.comrades.find((c) => c.id === f.person_id);
    // Candidates get closer follow-up: nudged after a week, not ten days.
    if (!person || person.left_at || days < (isCandidate(person) ? CANDIDATE_QUIET_DAYS : QUIET_DAYS)) continue;
    asks.push({ k: `quiet-${f.id}-${since.slice(0, 10)}`, kind: "quiet", followUp: f, person, days: f.last_touched_at ? days : null });
  }

  // A candidacy's review date is a week away (or past): the GS and whoever follows them up decide.
  const todayDay = new Date(now).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  for (const c of src.comrades) {
    if (!isCandidate(c)) continue;
    const prog = candidacyProgress(c, todayDay);
    if (!prog || prog.daysLeft > 7) continue;
    const follows = src.followUps.some((f) => f.active && f.person_id === c.id && f.follower_id === userId);
    if (!src.gsIds?.includes(userId) && !follows) continue;
    asks.push({ k: `candidate-${c.id}-${c.candidate_until}`, kind: "candidate-review", person: c, daysLeft: prog.daysLeft });
  }

  if (src.gsIds?.includes(userId)) {
    for (const r of src.roleRequests ?? []) {
      if (r.status === "pending" && r.user_id !== userId) asks.push({ k: `role-${r.id}`, kind: "role-request", request: r });
    }
  }

  if (src.adminIds?.includes(userId)) {
    for (const r of src.importRequests ?? []) {
      if (r.status !== "pending") continue;
      const rows = Object.values(r.only_rows ?? {}).reduce((n, a) => n + a.length, 0);
      asks.push({ k: `import-${r.id}`, kind: "import-request", request: { id: r.id, user_id: r.user_id, note: r.note, created_at: r.created_at }, rows });
    }
  }

  // Missing materials: only the last person logged with it is asked, once.
  // Held for three weeks: the holder gets one "still got it?".
  for (const m of src.materials) {
    const last = src.moves.find((mv) => mv.material_id === m.id && mv.action !== MISSING_ACTION);
    if (!last) continue;
    if (m.status === "missing" && last.actor_id === userId) {
      asks.push({ k: `material-${m.id}`, kind: "material", material: m, lastMove: last });
    } else if (m.status === "in_use" && m.category !== "book" && m.holder_id === userId && now - new Date(last.created_at).getTime() > STALE_HOLD_MS) {
      asks.push({ k: `held-${m.id}-${last.id}`, kind: "material", material: m, lastMove: last, stale: true });
    }
  }

  // A call only the lead can make goes first — it's the one with a deadline already passed.
  return asks.filter((a) => !dismissed.has(a.k)).sort((a, b) => Number(b.kind === "decide") - Number(a.kind === "decide"));
}

async function loadInboxSources(actor: Actor | null): Promise<InboxSources> {
  const [events, rsvps, extras, { polls, votes }, reports, actions, materials, moves, contacts, guests, groups, groupMembers, invites, followUps, comrades] = await Promise.all([
    listEvents({}, canSeeCommittee(actor), actor?.id),
    listRsvps(),
    listEventExtras(),
    listPolls(),
    listEventReports(),
    listAgendaActions(),
    listMaterials(),
    listMaterialMoves(),
    // Unscoped on purpose: only `met_event_id` is used, to count contacts logged at a sale.
    listContacts(),
    listEventGuests(),
    listReadingGroups(),
    listAllReadingGroupMembers(),
    listReadingGroupInvites(),
    listFollowUps(),
    listComrades(),
  ]);
  const [roleRequests, profiles] = await Promise.all([listRoleRequests(), listProfiles()]);
  const adminIds = profiles.filter((p) => p.is_admin).map((p) => p.id);
  const [availability, eventInvites, agendaItems, reads] = await Promise.all([listAvailability(), listEventInvites(), listAgenda(), listSharedReads()]);
  const importRequests = actor && adminIds.includes(actor.id) ? await listImportRequests() : [];
  return {
    events,
    rsvps: rsvps as InboxSources["rsvps"],
    extras,
    polls,
    votes,
    reports,
    actions,
    materials,
    moves,
    contacts: contacts.map((c) => ({ met_event_id: c.met_event_id })),
    myContacts: actor ? contacts.filter((c) => contactOwner(c) === actor.id).map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null, stage: c.stage ?? null, archived: c.archived, tier: contactTier(c) })) : [],
    eventInvites,
    agendaItems,
    reads,
    profileIdByName: new Map(profiles.map((p) => [bareName(p.name), p.id])),
    guests,
    groups,
    groupMembers,
    invites,
    followUps,
    comrades,
    roleRequests,
    gsIds: profiles.filter((p) => p.role.includes("general_secretary")).map((p) => p.id),
    importRequests,
    adminIds,
    availability,
  };
}

export async function buildInbox(actor: Actor): Promise<InboxPayload> {
  const now = Date.now();
  const [src, dismissed] = await Promise.all([loadInboxSources(actor), listDismissals(actor.id)]);
  // View-only accounts are shown how the branch runs, not asked to do things they can't.
  const asks = actor.viewOnly ? [] : deriveAsks(actor.id, src, now, new Set(dismissed));
  const going = new Set(src.rsvps.filter((r) => r.user_id === actor.id && r.status === "going").map((r) => r.event_id));
  const live = new Map(src.events.filter((e) => isUpcoming(e, now)).map((e) => [e.id, e]));
  const updates = src.extras.updates
    .filter((u) => going.has(u.event_id) && live.has(u.event_id) && u.author_id !== actor.id)
    .map((u) => ({ ...u, event: { id: u.event_id, title: live.get(u.event_id)!.title } }));
  return { asks, updates };
}
