import { after } from "next/server";
import type { Actor } from "./auth";
import type { Event } from "./types";
import { eventLead } from "./types";
import { getEvent, listRsvps, updateEvent } from "./data";
import { listEventGuests } from "./data-v2";
import { goingCount, isTentative, reachedTarget } from "./follow-through";
import { notifyEventMoved, notifyEventOff, notifyEventOn } from "./notify";

/*
 * Server side of go/no-go. A tentative event flips to "on" the moment it
 * reaches its number; the lead calling it off tells everyone who'd said
 * going or maybe. Deciding past the deadline is an inbox ask (lib/inbox.ts)
 * plus the morning cron's push.
 */

async function counts(e: Event) {
  const [rsvps, guests] = await Promise.all([listRsvps(), listEventGuests()]);
  const mine = rsvps.filter((r) => r.event_id === e.id);
  return { going: goingCount(e, rsvps, guests), goingIds: mine.filter((r) => r.status === "going").map((r) => r.user_id), maybeIds: mine.filter((r) => r.status === "maybe").map((r) => r.user_id) };
}

/** After an RSVP or a guest change: confirm a tentative event that's reached its number. */
export async function confirmIfReached(eventId: string) {
  const e = await getEvent(eventId);
  if (!e || !isTentative(e)) return;
  const { going, goingIds } = await counts(e);
  if (!reachedTarget(e, going)) return;
  const updated = await updateEvent(e.id, { status: "on" });
  if (updated) after(() => notifyEventOn(updated, [...new Set([...goingIds, eventLead(e)].filter((x): x is string => !!x))], going));
}

/** A lead's edit changed the status: tell the people it affects. */
export async function announceStatusChange(actor: Actor, before: Event, after_: Event) {
  const { going, goingIds, maybeIds } = await counts(after_);
  // Time or place moved: everyone going or maybe hears straight away.
  const moved = before.start_time !== after_.start_time || (before.location ?? "") !== (after_.location ?? "");
  if (moved && after_.status !== "off") after(() => notifyEventMoved(actor, before, after_, [...goingIds, ...maybeIds]));
  if (before.status === after_.status) return;
  if (after_.status === "off") after(() => notifyEventOff(actor, after_, [...goingIds, ...maybeIds]));
  else if (after_.status === "on" && before.status === "tentative") after(() => notifyEventOn(after_, goingIds.filter((id) => id !== actor.id), going));
}
