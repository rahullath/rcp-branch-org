import type {
  AgendaAction,
  Comrade,
  EventGuest,
  FollowUp,
  ReadingGroupGuest,
  ReadingGroupInvite,
  ShareRsvp,
  AgendaItem,
  BringItem,
  Event,
  EventExtras,
  EventReport,
  EventRole,
  EventUpdate,
  Material,
  MaterialMove,
  Poll,
  PollVote,
  PushSubscriptionRow,
  ReadingGroupContact,
  TopicIdea,
  ImportRequest,
  EventInvite,
  Contact,
  SharedRead,
} from "./types";
import { isSupabaseConfigured } from "./config";
import { deleteRow, devStore, findRow, insertRow, listRows, updateRow, type StoreTable } from "./dev-store";
import { createClient } from "./supabase/server";
import type { Actor } from "./auth";
import { createAgendaItem, createMaterial, getEvent, getMaterial, listAgenda, listEvents, listMaterials, updateAgendaItem, updateMaterial } from "./data";
import { byStartAsc, isUpcoming } from "./dates";

/*
 * The shared logistics that hang off events. Same dual pattern as data.ts:
 * Supabase when configured, the JSON dev store in demo mode. Reads swallow
 * Supabase errors into [] (as data.ts does); writes throw.
 */

type Row = { id: string };

async function list<T>(table: string, order?: { column: string; ascending?: boolean }): Promise<T[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    let q = supabase.from(table).select("*");
    if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
    const { data } = await q;
    return (data ?? []) as T[];
  }
  return [...listRows<Row>(table as StoreTable)] as unknown as T[];
}

async function insert<T extends Row>(table: string, row: Omit<T, "id"> & { id?: string }): Promise<T> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from(table).insert(row).select().single();
    if (error) throw new Error(error.message);
    return data as T;
  }
  return insertRow<T>(table as StoreTable, row as Partial<T>);
}

async function update<T extends Row>(table: string, id: string, patch: Partial<T>): Promise<T | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from(table).update(patch as Record<string, unknown>).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as T) ?? null;
  }
  return updateRow<T>(table as StoreTable, id, patch) ?? null;
}

async function remove(table: string, id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return deleteRow(table as StoreTable, id);
}

async function find<T extends Row>(table: string, id: string): Promise<T | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
    return (data as T) ?? null;
  }
  return findRow<T>(table as StoreTable, id) ?? null;
}

const now = () => new Date().toISOString();

/* ============================= event extras ============================= */

export async function listEventExtras(): Promise<EventExtras> {
  const [bring, roles, updates] = await Promise.all([
    list<BringItem>("event_bring", { column: "created_at" }),
    list<EventRole>("event_roles", { column: "created_at" }),
    list<EventUpdate>("event_updates", { column: "created_at", ascending: false }),
  ]);
  return {
    bring: [...bring].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    roles: [...roles].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    updates: [...updates].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

export const getBringItem = (id: string) => find<BringItem>("event_bring", id);
export const getEventRole = (id: string) => find<EventRole>("event_roles", id);

export function addBringItem(eventId: string, input: { material_id?: string | null; label?: string | null; qty?: string | null }) {
  return insert<BringItem>("event_bring", {
    event_id: eventId,
    material_id: input.material_id ?? null,
    label: input.label ?? null,
    qty: input.qty ?? null,
    claimed_by: null,
    created_at: now(),
  });
}

/**
 * "I'll bring it". When the item is a material, the material moves to the
 * claimer and the move is logged — so Materials always knows where it is
 * without anyone doing a stock-take.
 */
export async function claimBringItem(actor: Actor, item: BringItem, claim: boolean): Promise<BringItem | null> {
  const updated = await update<BringItem>("event_bring", item.id, { claimed_by: claim ? actor.id : null });
  if (claim && item.material_id) {
    const [material, event] = await Promise.all([getMaterial(item.material_id), getEvent(item.event_id)]);
    if (material) {
      await updateMaterial(material.id, { holder_id: actor.id, holder_label: null, status: "in_use" });
      await addMaterialMove(actor, material.id, `is bringing it to ${event ? shortTitle(event.title) : "an event"}`);
    }
  }
  if (!claim && item.claimed_by && item.material_id) {
    const event = await getEvent(item.event_id);
    await addMaterialMove(actor, item.material_id, `can't bring it to ${event ? shortTitle(event.title) : "the event"} after all`);
  }
  return updated;
}

export const deleteBringItem = (id: string) => remove("event_bring", id);

/** Ticked "here" on the day (or un-ticked). */
export const markBrought = (id: string, here: boolean) => update<BringItem>("event_bring", id, { brought_at: here ? now() : null });

export function addEventRole(eventId: string, role: string, userId: string | null = null) {
  return insert<EventRole>("event_roles", { event_id: eventId, role, user_id: userId, created_at: now() });
}

export const setEventRole = (id: string, userId: string | null) => update<EventRole>("event_roles", id, { user_id: userId });
export const deleteEventRole = (id: string) => remove("event_roles", id);

export function addEventUpdate(actor: Actor, eventId: string, text: string) {
  return insert<EventUpdate>("event_updates", { event_id: eventId, author_id: actor.id, text, created_at: now() });
}

/* ============================= reports ============================= */

export const listEventReports = () => list<EventReport>("event_reports");

/**
 * The lead's one prompt after a sale. The totals land on the next branch
 * meeting's agenda by themselves, so nobody has to remember to report back.
 */
export async function saveEventReport(
  actor: Actor,
  event: Event,
  input: { sold: number; money: number; contacts: number; attended?: number | null; notes?: string | null },
): Promise<{ report: EventReport; agendaItem: AgendaItem | null }> {
  const report = await insert<EventReport>("event_reports", {
    event_id: event.id,
    sold: input.sold,
    money: input.money,
    contacts: input.contacts,
    ...(input.attended != null ? { attended: input.attended } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    reported_by: actor.id,
    created_at: now(),
  });
  const meeting = await nextBranchMeeting();
  const agendaItem = await createAgendaItem(actor, {
    title: reportLine(event, input),
    section: event.event_type === "reading_group" ? "organizational" : "paper",
    duration: "2",
    event_id: meeting?.id ?? null,
    meeting_date: meeting ? meeting.start_time.slice(0, 10) : null,
    link: { kind: "report", id: event.id },
    sort_order: 1,
  });
  return { report, agendaItem };
}

type ReportInput = { sold: number; money: number; contacts: number; attended?: number | null; notes?: string | null };

/** The one line that goes on the next branch agenda. */
function reportLine(event: Event, input: ReportInput) {
  const date = new Date(event.start_time).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" }).replace(",", "");
  return event.event_type === "reading_group"
    ? `${shortTitle(event.title)} ${date}: ${input.attended ?? 0} came${input.notes ? ` · ${input.notes}` : ""}`
    : `${event.event_type === "uni_stall" ? "Stall" : "Paper sale"} ${date}: ${input.sold} sold, £${input.money}, ${input.contacts} contact${input.contacts === 1 ? "" : "s"}${input.notes ? ` · ${input.notes.slice(0, 140)}` : ""}`;
}

/** Corrected numbers: the report, and its line on the branch agenda, follow. */
export async function updateEventReport(event: Event, report: EventReport, input: ReportInput) {
  const updated = await update<EventReport>("event_reports", report.id, {
    sold: input.sold,
    money: input.money,
    contacts: input.contacts,
    ...(input.attended != null ? { attended: input.attended } : {}),
    notes: input.notes ?? null,
  });
  const line = (await listAgenda()).find((i) => i.link?.kind === "report" && i.link.id === event.id);
  // Agenda lines are officer-edit; a member correcting their own report still gets the report fixed.
  if (line) await updateAgendaItem(line.id, { title: reportLine(event, input) }).catch(() => null);
  return updated;
}

export async function nextBranchMeeting(): Promise<Event | null> {
  const t = Date.now();
  const events = await listEvents({}, false);
  return events.filter((e) => e.event_type === "branch" && isUpcoming(e, t)).sort(byStartAsc)[0] ?? null;
}

/* ============================= polls ============================= */

export async function listPolls(): Promise<{ polls: Poll[]; votes: PollVote[] }> {
  const [polls, votes] = await Promise.all([
    list<Poll>("polls", { column: "created_at", ascending: false }),
    list<PollVote>("poll_votes"),
  ]);
  return {
    polls: polls.filter((p) => !p.archived).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    votes: votes.map(({ poll_id, user_id, option }) => ({ poll_id, user_id, option })),
  };
}

export const getPoll = (id: string) => find<Poll>("polls", id);

export function createPoll(actor: Actor, input: { question: string; options: string[]; closes_at?: string | null }) {
  return insert<Poll>("polls", {
    question: input.question,
    options: input.options,
    created_by: actor.id,
    closes_at: input.closes_at ?? null,
    archived: false,
    created_at: now(),
  });
}

export const archivePoll = (id: string) => update<Poll>("polls", id, { archived: true });

/** One vote per person; voting again moves it, `option: null` withdraws it. */
export async function castVote(actor: Actor, pollId: string, option: string | null): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    if (option === null) {
      const { error } = await supabase.from("poll_votes").delete().eq("poll_id", pollId).eq("user_id", actor.id);
      if (error) throw new Error(error.message);
      return;
    }
    const { error } = await supabase
      .from("poll_votes")
      .upsert({ poll_id: pollId, user_id: actor.id, option }, { onConflict: "poll_id,user_id" });
    if (error) throw new Error(error.message);
    return;
  }
  const id = `pv-${pollId}-${actor.id}`;
  deleteRow("poll_votes", id);
  if (option !== null) insertRow("poll_votes", { id, poll_id: pollId, user_id: actor.id, option });
}

/* ============================= materials log ============================= */

export async function listMaterialMoves(): Promise<MaterialMove[]> {
  const rows = await list<MaterialMove>("material_moves", { column: "created_at", ascending: false });
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function addMaterialMove(actor: Actor, materialId: string, action: string) {
  return insert<MaterialMove>("material_moves", { material_id: materialId, actor_id: actor.id, action, created_at: now() });
}

/** Logged when someone marks a material missing — not a holder, so never the one asked. */
export const MISSING_ACTION = "marked it missing";
export type MaterialMoveKind = "take" | "found" | "return" | "pass" | "missing" | "sold";

/**
 * Move or sell copies. `qty` (sold, or passed on) can be part of the pile: what
 * you pass on joins the other person's copies of the same title, or starts a
 * new line with them, and yours keeps the rest.
 */
export async function moveMaterial(
  actor: Actor,
  material: Material,
  kind: MaterialMoveKind,
  opts: { to?: { id: string; name: string; comrade?: boolean }; qty?: number } = {},
): Promise<Material | null> {
  const n = Math.max(1, Math.min(material.qty || 1, Math.round(opts.qty ?? material.qty ?? 1)));
  if (kind === "sold") {
    const updated = await updateMaterial(material.id, { qty: Math.max(0, material.qty - n) });
    await addMaterialMove(actor, material.id, `sold ${n}`);
    return updated;
  }
  if (kind === "pass" && opts.to && n < material.qty) {
    const to = opts.to;
    const holder = to.comrade ? { holder_id: null, holder_comrade_id: to.id } : { holder_id: to.id, holder_comrade_id: null };
    const theirs = (await listMaterials()).find(
      (m) => m.id !== material.id && m.name === material.name && m.status !== "missing" && (to.comrade ? m.holder_comrade_id === to.id : m.holder_id === to.id),
    );
    if (theirs) await updateMaterial(theirs.id, { qty: theirs.qty + n });
    else {
      const created = await createMaterial(actor, { name: material.name, category: material.category, qty: n, status: "in_use", ...holder, holder_label: null, note: null, wanted: 0 });
      await addMaterialMove(actor, created.id, `got ${n} from ${actor.name.replace(/^Comrade\s+/i, "").split(" ")[0]}`);
    }
    const updated = await updateMaterial(material.id, { qty: material.qty - n });
    await addMaterialMove(actor, material.id, `passed ${n} to ${to.name.replace(/^Comrade\s+/i, "")}`);
    return updated;
  }
  let patch: Partial<Material>;
  let action: string;
  if (kind === "take" || kind === "found") {
    patch = { holder_id: actor.id, holder_comrade_id: null, holder_label: null, status: "in_use" };
    action = kind === "found" ? "found them" : "took it";
  } else if (kind === "return") {
    patch = { holder_id: null, holder_comrade_id: null, holder_label: "Branch cupboard", status: "available" };
    action = "returned it to the cupboard";
  } else if (kind === "missing") {
    patch = { holder_id: null, holder_comrade_id: null, holder_label: null, status: "missing" };
    action = MISSING_ACTION;
  } else {
    if (!opts.to) throw new Error("Pick who you passed it to");
    patch = opts.to.comrade
      ? { holder_id: null, holder_comrade_id: opts.to.id, holder_label: null, status: "in_use" }
      : { holder_id: opts.to.id, holder_comrade_id: null, holder_label: null, status: "in_use" };
    action = `passed it to ${opts.to.name.replace(/^Comrade\s+/i, "")}`;
  }
  const updated = await updateMaterial(material.id, patch);
  await addMaterialMove(actor, material.id, action);
  return updated;
}

/* ============================= agenda actions ============================= */

export async function listAgendaActions(): Promise<AgendaAction[]> {
  const rows = await list<AgendaAction>("agenda_actions", { column: "created_at" });
  return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export const getAgendaAction = (id: string) => find<AgendaAction>("agenda_actions", id);

export function createAgendaAction(
  actor: Actor,
  input: {
    text: string;
    owner_id: string | null;
    owner_comrade_id?: string | null;
    event_id?: string | null;
    due_date?: string | null;
    source?: string | null;
  },
) {
  const open = !input.owner_id && !input.owner_comrade_id;
  return insert<AgendaAction>("agenda_actions", {
    text: input.text,
    owner_id: input.owner_id,
    ...(input.owner_comrade_id ? { owner_comrade_id: input.owner_comrade_id } : {}),
    ...(input.due_date ? { due_date: input.due_date } : {}),
    ...(input.source ? { source: input.source } : {}),
    event_id: input.event_id ?? null,
    ...(open ? { open_since: now() } : {}),
    done: false,
    done_at: null,
    created_by: actor.id,
    created_at: now(),
  });
}

export function setAgendaActionDone(id: string, done: boolean) {
  return update<AgendaAction>("agenda_actions", id, { done, done_at: done ? now() : null });
}

export const deleteAgendaAction = (id: string) => remove("agenda_actions", id);

export function updateAgendaAction(
  id: string,
  patch: Partial<Pick<AgendaAction, "text" | "owner_id" | "owner_comrade_id" | "due_date" | "event_id" | "pushed" | "open_since" | "claimed_at" | "handed_from" | "hand_note">>,
) {
  return update<AgendaAction>("agenda_actions", id, patch);
}

/** "Push a week": the due date moves on seven days and the push is counted, so the branch sees it. */
export function pushAgendaAction(a: AgendaAction, today: string) {
  const base = a.due_date && a.due_date > today ? a.due_date : today;
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return update<AgendaAction>("agenda_actions", a.id, { due_date: d.toISOString().slice(0, 10), pushed: (a.pushed ?? 0) + 1 });
}

/* ============================= per-person private rows ============================= */

async function listMine<T extends { user_id: string }>(table: string, userId: string): Promise<T[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from(table).select("*").eq("user_id", userId);
    return (data ?? []) as T[];
  }
  return (listRows<Row>(table as StoreTable) as unknown as T[]).filter((r) => r.user_id === userId);
}

export async function listReadingTicks(userId: string): Promise<string[]> {
  return (await listMine<{ user_id: string; session_id: string }>("reading_ticks", userId)).map((r) => r.session_id);
}

export async function setReadingTick(userId: string, sessionId: string, on: boolean): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = on
      ? await supabase.from("reading_ticks").upsert({ user_id: userId, session_id: sessionId }, { onConflict: "user_id,session_id" })
      : await supabase.from("reading_ticks").delete().eq("user_id", userId).eq("session_id", sessionId);
    if (error) throw new Error(error.message);
    return;
  }
  const id = `rt-${userId}-${sessionId}`;
  deleteRow("reading_ticks", id);
  if (on) insertRow("reading_ticks", { id, user_id: userId, session_id: sessionId, created_at: now() });
}

export async function listDismissals(userId: string): Promise<string[]> {
  return (await listMine<{ user_id: string; key: string }>("inbox_dismissals", userId)).map((r) => r.key);
}

export async function dismissAsk(userId: string, key: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("inbox_dismissals").upsert({ user_id: userId, key }, { onConflict: "user_id,key" });
    if (error) throw new Error(error.message);
    return;
  }
  const id = `dm-${userId}-${key}`;
  if (!findRow("inbox_dismissals", id)) insertRow("inbox_dismissals", { id, user_id: userId, key, created_at: now() });
}

/* ============================= push subscriptions ============================= */

export async function savePushSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ user_id: userId, endpoint: sub.endpoint, keys: sub.keys }, { onConflict: "endpoint" });
    if (error) throw new Error(error.message);
    return;
  }
  const db = devStore.load();
  db.push_subscriptions = db.push_subscriptions.filter((s) => s.endpoint !== sub.endpoint);
  db.push_subscriptions.push({ id: devStore.uid("push"), user_id: userId, endpoint: sub.endpoint, keys: sub.keys, created_at: now() });
  devStore.save(db);
}

export async function deletePushSubscription(endpoint: string) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return;
  }
  const db = devStore.load();
  db.push_subscriptions = db.push_subscriptions.filter((s) => s.endpoint !== endpoint);
  devStore.save(db);
}

export async function listMyPushSubscriptions(userId: string): Promise<PushSubscriptionRow[]> {
  return listMine<PushSubscriptionRow>("push_subscriptions", userId);
}

/* ============================= reading group contacts ============================= */

export const listReadingGroupContacts = () => list<ReadingGroupContact>("reading_group_contacts", { column: "created_at" });
export const getReadingGroupContact = (id: string) => find<ReadingGroupContact>("reading_group_contacts", id);
export const removeReadingGroupContact = (id: string) => remove("reading_group_contacts", id);

export function addReadingGroupContact(actor: Actor, groupId: string, contactId: string) {
  return insert<ReadingGroupContact>("reading_group_contacts", { group_id: groupId, contact_id: contactId, added_by: actor.id, created_at: now() });
}

/* ============================= people (comrades) ============================= */

export async function listComrades(): Promise<Comrade[]> {
  const rows = await list<Comrade>("comrades", { column: "name" });
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}

export const getComrade = (id: string) => find<Comrade>("comrades", id);
export const deleteComrade = (id: string) => remove("comrades", id);

/** Short forms are kept trimmed, de-duplicated and without the full name itself. */
export function cleanAliases(name: string, aliases: string[]) {
  const seen = new Set<string>([name.trim().toLowerCase()]);
  const out: string[] = [];
  for (const a of aliases.map((x) => x.replace(/\?$/, "").trim()).filter(Boolean)) {
    if (seen.has(a.toLowerCase())) continue;
    seen.add(a.toLowerCase());
    out.push(a);
  }
  return out;
}

export function createComrade(actor: Actor, input: { name: string; aliases?: string[]; profile_id?: string | null }) {
  return insert<Comrade>("comrades", {
    name: input.name.trim(),
    aliases: cleanAliases(input.name, input.aliases ?? []),
    profile_id: input.profile_id ?? null,
    created_by: actor.id,
    created_at: now(),
  });
}

/** Candidacy dates and notes. */
export const setCandidacy = (id: string, patch: Partial<Pick<Comrade, "candidate_since" | "candidate_until" | "candidate_note" | "left_at">>) => update<Comrade>("comrades", id, patch);

export async function updateComrade(id: string, patch: { name?: string; aliases?: string[]; phone?: string | null }) {
  const current = await getComrade(id);
  if (!current) return null;
  const name = patch.name?.trim() || current.name;
  return update<Comrade>("comrades", id, {
    name,
    aliases: cleanAliases(name, patch.aliases ?? current.aliases),
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
  });
}

/**
 * Link a person to their account (or unlink with null). Follow-ups waiting on
 * them move into that account's inbox.
 */
export async function linkComrade(id: string, profileId: string | null): Promise<{ comrade: Comrade | null; moved: number }> {
  const comrade = await update<Comrade>("comrades", id, { profile_id: profileId });
  if (!profileId) return { comrade, moved: 0 };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("agenda_actions")
      .update({ owner_id: profileId })
      .eq("owner_comrade_id", id)
      .is("owner_id", null)
      .select("id");
    if (error) throw new Error(error.message);
    // Their follow-ups (people they follow up) become theirs too.
    await supabase.from("follow_ups").update({ follower_id: profileId, follower_comrade_id: null }).eq("follower_comrade_id", id).is("follower_id", null);
    return { comrade, moved: data?.length ?? 0 };
  }
  let moved = 0;
  for (const f of listRows<FollowUp>("follow_ups")) {
    if (f.follower_comrade_id === id && !f.follower_id) updateRow<FollowUp>("follow_ups", f.id, { follower_id: profileId, follower_comrade_id: null });
  }
  for (const a of listRows<AgendaAction>("agenda_actions")) {
    if (a.owner_comrade_id === id && !a.owner_id) {
      updateRow<AgendaAction>("agenda_actions", a.id, { owner_id: profileId });
      moved++;
    }
  }
  return { comrade, moved };
}

/* ============================= follow-ups ============================= */

export const listFollowUps = async () => (await list<FollowUp>("follow_ups", { column: "created_at" })).filter((f) => f.active);
export const getFollowUp = (id: string) => find<FollowUp>("follow_ups", id);
export const updateFollowUp = (id: string, patch: Partial<Pick<FollowUp, "with_id">>) => update<FollowUp>("follow_ups", id, patch);

/**
 * Make `follower` the one following up `personId` — a handover if someone
 * else had them. The follower is an account or a People entry (no account yet).
 */
export async function setFollowUp(actor: Actor, personId: string, follower: { profile_id?: string | null; comrade_id?: string | null }): Promise<FollowUp> {
  const followerId = follower.profile_id ?? null;
  const followerComrade = followerId ? null : (follower.comrade_id ?? null);
  const current = (await listFollowUps()).find((f) => f.person_id === personId);
  if (current) {
    if (current.follower_id === followerId && (current.follower_comrade_id ?? null) === followerComrade) return current;
    return (await update<FollowUp>("follow_ups", current.id, { follower_id: followerId, follower_comrade_id: followerComrade })) ?? current;
  }
  return insert<FollowUp>("follow_ups", {
    person_id: personId,
    follower_id: followerId,
    follower_comrade_id: followerComrade,
    last_touched_at: null,
    note: null,
    active: true,
    created_by: actor.id,
    created_at: now(),
  });
}

/** "Spoke to them" — resets the quiet clock, optionally with a line about how it went (kept in the history). */
export async function touchFollowUp(actor: Actor, id: string, note?: string | null) {
  const f = await find<FollowUp>("follow_ups", id);
  const notes = [...(f?.notes ?? []), ...(note ? [{ text: note, by: actor.id, at: now(), kind: "note" as const }] : [])];
  return update<FollowUp>("follow_ups", id, { last_touched_at: now(), ...(note ? { note, notes } : {}) });
}

/** Hand someone over to another comrade, with a note so they can carry on. */
export async function handOverFollowUp(actor: Actor, id: string, to: { profile_id?: string | null; comrade_id?: string | null; label: string }, note: string | null) {
  const f = await find<FollowUp>("follow_ups", id);
  if (!f) return null;
  const notes = [...(f.notes ?? []), { text: `Handed over to ${to.label}${note ? `: ${note}` : ""}`, by: actor.id, at: now(), kind: "handover" as const }];
  return update<FollowUp>("follow_ups", id, {
    follower_id: to.profile_id ?? null,
    follower_comrade_id: to.profile_id ? null : (to.comrade_id ?? null),
    notes,
    ...(note ? { note } : {}),
  });
}

/** Nobody follows them up any more (joined and settled, moved away, went cold for good). */
export const endFollowUp = (id: string) => update<FollowUp>("follow_ups", id, { active: false });

/* ============================= event guests ============================= */

/** People marked going without an account, plus everyone who said "I'm coming" on a share link. */
export async function listEventGuests(): Promise<EventGuest[]> {
  const [guests, viaLink] = await Promise.all([list<EventGuest>("event_guests", { column: "created_at" }), list<ShareRsvp>("share_rsvps", { column: "created_at" })]);
  return [
    ...guests,
    ...viaLink.map((r): EventGuest => ({ id: `link-${r.id}`, event_id: r.event_id, comrade_id: "", status: "going", created_at: r.created_at, via_link: true, name: r.name, who_sent: r.who_sent ?? null, extra: r.extra ?? 0, note: r.note ?? null })),
  ];
}
export const getEventGuest = (id: string) => find<EventGuest>("event_guests", id);
export const removeEventGuest = (id: string) => remove("event_guests", id);

/** Mark someone without an account going/maybe/no — one row per person per event. */
export async function setEventGuest(actor: Actor, eventId: string, comradeId: string, status: EventGuest["status"]): Promise<EventGuest> {
  const existing = (await list<EventGuest>("event_guests")).find((g) => g.event_id === eventId && g.comrade_id === comradeId);
  if (existing) return (await update<EventGuest>("event_guests", existing.id, { status })) ?? existing;
  return insert<EventGuest>("event_guests", { event_id: eventId, comrade_id: comradeId, status, added_by: actor.id, created_at: now() });
}

/* ============================= reading group guests + invites ============================= */

export const listReadingGroupGuests = () => list<ReadingGroupGuest>("reading_group_guests", { column: "created_at" });
export const getReadingGroupGuest = (id: string) => find<ReadingGroupGuest>("reading_group_guests", id);
export const removeReadingGroupGuest = (id: string) => remove("reading_group_guests", id);
export const setReadingGroupGuestLead = (id: string, isLead: boolean) => update<ReadingGroupGuest>("reading_group_guests", id, { is_lead: isLead });

export function addReadingGroupGuest(actor: Actor, groupId: string, comradeId: string, isLead = false) {
  return insert<ReadingGroupGuest>("reading_group_guests", { group_id: groupId, comrade_id: comradeId, is_lead: isLead, added_by: actor.id, created_at: now() });
}

export const listReadingGroupInvites = () => list<ReadingGroupInvite>("reading_group_invites", { column: "created_at" });
export const getReadingGroupInvite = (id: string) => find<ReadingGroupInvite>("reading_group_invites", id);
export const setInviteStatus = (id: string, status: ReadingGroupInvite["status"]) => update<ReadingGroupInvite>("reading_group_invites", id, { status });

export function createReadingGroupInvite(actor: Actor, input: { group_id: string; user_id: string; kind: ReadingGroupInvite["kind"]; note?: string | null }) {
  return insert<ReadingGroupInvite>("reading_group_invites", {
    group_id: input.group_id,
    user_id: input.user_id,
    kind: input.kind,
    note: input.note ?? null,
    status: "open",
    created_by: actor.id,
    created_at: now(),
  });
}

/* ============================= helpers ============================= */

/** "Freshers stall — Guild of Students" → "Freshers stall". */
export function shortTitle(title: string) {
  return title.split(" — ")[0];
}

/* ============================= topic ideas ============================= */

export async function listTopicIdeas(): Promise<TopicIdea[]> {
  const rows = await list<TopicIdea>("topic_ideas", { column: "created_at" });
  return rows.filter((t) => !t.archived);
}

export const getTopicIdea = (id: string) => find<TopicIdea>("topic_ideas", id);

export function createTopicIdea(actor: Actor, input: { title: string; kind: TopicIdea["kind"]; note: string | null }) {
  return insert<TopicIdea>("topic_ideas", { ...input, interested: [actor.id], archived: false, created_by: actor.id, created_at: now() });
}

export const updateTopicIdea = (id: string, patch: Partial<TopicIdea>) => update<TopicIdea>("topic_ideas", id, patch);

/* ============================= import requests ============================= */

/** Newest first. RLS shows the admin everything in the branch, others their own. */
export async function listImportRequests(): Promise<ImportRequest[]> {
  const rows = await list<ImportRequest>("import_requests", { column: "created_at", ascending: false });
  return isSupabaseConfigured ? rows : [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export const getImportRequest = (id: string) => find<ImportRequest>("import_requests", id);

export function createImportRequest(actor: Actor, input: { data: Record<string, unknown>; only_rows: Record<string, number[]> | null; note: string | null }) {
  return insert<ImportRequest>("import_requests", { ...input, user_id: actor.id, status: "pending", created_at: now() });
}

export const updateImportRequest = (id: string, patch: Partial<ImportRequest>) => update<ImportRequest>("import_requests", id, patch);

/* ============================= event invites ============================= */

export const listEventInvites = () => list<EventInvite>("event_invites", { column: "created_at" });
export const getEventInvite = (id: string) => find<EventInvite>("event_invites", id);

/** Invite (or re-invite) a contact; one row per event and contact. */
export async function inviteContact(actor: Actor, eventId: string, contactId: string): Promise<EventInvite> {
  const existing = (await listEventInvites()).find((i) => i.event_id === eventId && i.contact_id === contactId);
  if (existing) return existing;
  return insert<EventInvite>("event_invites", { event_id: eventId, contact_id: contactId, invited_by: actor.id, status: "invited", created_at: now(), updated_at: now() });
}

export const setEventInviteStatus = (id: string, status: EventInvite["status"]) => update<EventInvite>("event_invites", id, { status, updated_at: now() });
export const deleteEventInvite = (id: string) => remove("event_invites", id);

/** Contacts as rows — for stage moves made by invites. */
export const getContactRow = (id: string) => find<Contact>("contacts", id);
export const setContactStage = (id: string, stage: Contact["stage"]) => update<Contact>("contacts", id, { stage, stage_at: now() });

/* ============================= shared reads ============================= */

export async function listSharedReads(): Promise<SharedRead[]> {
  const rows = await list<SharedRead>("shared_reads", { column: "created_at", ascending: false });
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export const getSharedRead = (id: string) => find<SharedRead>("shared_reads", id);
export function createSharedRead(actor: Actor, input: { url: string; title: string; note: string | null; event_id: string | null }) {
  return insert<SharedRead>("shared_reads", { ...input, shared_by: actor.id, read_by: [], created_at: now() });
}
export const updateSharedRead = (id: string, patch: Partial<Pick<SharedRead, "read_by" | "title" | "note" | "main">>) => update<SharedRead>("shared_reads", id, patch);

/** Make one reading the event's main one (and no other). */
export async function setMainRead(read: SharedRead) {
  if (read.event_id) for (const r of (await listSharedReads()).filter((x) => x.event_id === read.event_id && x.main && x.id !== read.id)) await updateSharedRead(r.id, { main: false });
  return updateSharedRead(read.id, { main: true });
}
export const deleteSharedRead = (id: string) => remove("shared_reads", id);
