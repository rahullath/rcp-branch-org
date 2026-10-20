import type { AgendaItem, Event, EventExtras, Rsvp, SharedRead } from "./types";
import { mainDiscussion } from "./types";

/*
 * "Is everything set up?" for whoever leads an event, a few days before.
 * Every check is read off what's already in the app (a place, a chair, a
 * reading, the bring list), so nobody ticks anything. The only thing the
 * app can't see is whether it was posted in the branch chat; that's the
 * card's one button, and pressing it is the record.
 */

/** How long before the start the lead is asked. */
export const SETUP_WINDOW_H: Partial<Record<Event["event_type"], number>> = {
  paper_sale: 48,
  uni_stall: 48,
  branch: 96,
  open_meeting: 168,
  social: 120,
};

export interface SetupCheck {
  label: string;
  ok: boolean;
}

export interface SetupSources {
  rsvps: Pick<Rsvp, "event_id" | "user_id" | "status">[];
  extras: Pick<EventExtras, "bring">;
  agendaItems?: AgendaItem[];
  reads?: SharedRead[];
}

export function setupChecks(e: Event, src: SetupSources): SetupCheck[] {
  const going = src.rsvps.filter((r) => r.event_id === e.id && r.status === "going").length;
  const checks: SetupCheck[] = [{ label: e.location ? `Place: ${e.location.split(",")[0]}` : "Where is it?", ok: !!e.location?.trim() }];
  if (e.event_type === "branch") {
    const topic = mainDiscussion(src.agendaItems ?? [], e.id);
    checks.push(
      { label: topic?.leadoff_name ? `Lead-off: ${topic.leadoff_name}` : "Someone to lead off", ok: !!topic?.leadoff_name },
      { label: "Chair and minutes", ok: !!e.chair_id && !!e.minutes_id },
      { label: "Something to read", ok: (src.reads ?? []).some((r) => r.event_id === e.id) },
    );
  }
  if (e.event_type === "paper_sale" || e.event_type === "uni_stall") {
    const open = src.extras.bring.filter((b) => b.event_id === e.id && !b.claimed_by).length;
    checks.push(
      { label: going >= 2 ? `${going} going` : `At least two going (${going} so far)`, ok: going >= 2 },
      { label: open ? `${open} on the bring list not taken` : "Bring list covered", ok: open === 0 },
    );
  }
  return checks;
}

/** In the lead's window: close enough to sort out, not so close it's too late. */
export function inSetupWindow(e: Event, now: number) {
  const h = SETUP_WINDOW_H[e.event_type];
  const until = Date.parse(e.start_time) - now;
  return !!h && until > 2 * 3600_000 && until <= h * 3600_000;
}

/** The inbox dismissal key that records "posted in the branch chat". */
export const postedKey = (eventId: string) => `posted-${eventId}`;
