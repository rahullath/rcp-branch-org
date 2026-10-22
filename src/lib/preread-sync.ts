import type { Actor } from "./auth";
import type { AgendaItem, Event, PrepLink } from "./types";
import { isSupabaseConfigured } from "./config";
import { createAdminClient } from "./supabase/server";
import { getEvent, listAgenda, listEvents, listRsvps, updateAgendaItem } from "./data";
import { createSharedRead, deleteSharedRead, listSharedReads, updateSharedRead } from "./data-extras";
import { allMemberIds, sendPush } from "./push";
import { expectsReading, PREREAD_TYPES } from "./preread";
export { linkKind } from "./preread";

/*
 * One reading list per meeting. A branch meeting's prep links (on its
 * discussion item: what the programme counts as "Text ✓ / Audio ✓") and its
 * "Read or listen before" list are the same thing: prep links become tracked
 * reads (inbox, nudges, who's read it), and a reading added on the event
 * goes onto the discussion item's prep.
 */

/** Everyone who should get it: a branch meeting's whole branch bar "can't"; otherwise those going or maybe. */
export async function readersFor(actor: Actor, event: Event) {
  const rsvps = (await listRsvps()).filter((r) => r.event_id === event.id);
  if (PREREAD_TYPES.includes(event.event_type)) {
    return (await allMemberIds(event.branch_id ?? actor.branch?.id ?? null)).filter((id) => expectsReading(event, rsvps.find((r) => r.user_id === id)?.status));
  }
  return rsvps.filter((r) => expectsReading(event, r.status)).map((r) => r.user_id);
}

const meetingItems = (items: AgendaItem[], eventId: string) => items.filter((i) => i.event_id === eventId && i.section === "political" && !i.archived);

/** Prep links on the meeting's discussion items → tracked reads (added and removed to match). One push for anything new. */
export async function syncPrepReads(actor: Actor, eventId: string | null | undefined) {
  if (!eventId) return;
  const event = await getEvent(eventId);
  if (!event || event.archived || Date.parse(event.start_time) < Date.now()) return;
  const [items, reads] = await Promise.all([listAgenda(), listSharedReads()]);
  const mine = meetingItems(items, eventId);
  if (!mine.length) return;
  const links = new Map<string, PrepLink>();
  for (const i of mine) for (const l of i.prep_links ?? []) if (l.url) links.set(l.url, l);
  const here = reads.filter((r) => r.event_id === eventId);
  const created: string[] = [];
  for (const [url, l] of links) {
    const existing = here.find((r) => r.url === url);
    if (existing) {
      // Renamed on the agenda: the reading follows.
      if (l.label && existing.title !== l.label) await updateSharedRead(existing.id, { title: l.label.slice(0, 200) });
      continue;
    }
    await createSharedRead(actor, { url, title: (l.label || url).slice(0, 200), note: null, event_id: eventId });
    created.push(l.label || url);
  }
  for (const r of here) if (!links.has(r.url)) await deleteSharedRead(r.id);
  // Only the first reading for a meeting is news; later ones are "also good".
  if (created.length && here.length === 0) {
    const ids = (await readersFor(actor, event)).filter((id) => id !== actor.id);
    await sendPush(ids, "lead_updates", {
      title: `Before ${event.title.split(" — ")[0]}`,
      body: "Something to read or listen to beforehand. It's in your inbox.",
      url: "/inbox",
      tag: `prep-${eventId}`,
      actions: [{ action: "open", title: "Open" }],
    }).catch(() => 0);
  }
}

/** After an agenda import: every upcoming meeting with prep links. */
export async function syncAllPrepReads(actor: Actor) {
  const [events, items] = await Promise.all([listEvents({}, true), listAgenda()]);
  const now = Date.now();
  for (const e of events) if (Date.parse(e.start_time) > now && meetingItems(items, e.id).some((i) => (i.prep_links ?? []).length)) await syncPrepReads(actor, e.id);
}

/** A reading added (or removed) on the event → the discussion item's prep, so the programme stays right. */
export async function mirrorToPrep(eventId: string, link: PrepLink, remove = false) {
  const item = meetingItems(await listAgenda(), eventId)[0];
  if (!item) return;
  const cur = item.prep_links ?? [];
  const next = remove ? cur.filter((l) => l.url !== link.url) : cur.some((l) => l.url === link.url) ? cur : [...cur, link];
  if (next.length === cur.length && !remove) return;
  if (remove && next.length === cur.length) return;
  // Agenda items are officer-edit under RLS; a comrade adding a reading goes through the service role.
  if (isSupabaseConfigured) await createAdminClient()?.from("agenda_items").update({ prep_links: next }).eq("id", item.id);
  else await updateAgendaItem(item.id, { prep_links: next });
}
