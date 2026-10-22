import type { Event } from "./types";

/**
 * Date-awareness for events. Events only store a start time (no end), so an
 * event counts as "still on" for a few hours after it starts — long enough for
 * a 10:00–16:00 stall to stay in "Coming up" all day, short enough that last
 * night's meeting is gone by the morning.
 */
export const EVENT_GRACE_MS = 4 * 3600_000;

export function startMs(e: Pick<Event, "start_time">) {
  return new Date(e.start_time).getTime();
}

export function isUpcoming(e: Pick<Event, "start_time">, now: number) {
  return startMs(e) + EVENT_GRACE_MS >= now;
}

/** Soonest first. */
export function byStartAsc(a: Pick<Event, "start_time">, b: Pick<Event, "start_time">) {
  return startMs(a) - startMs(b);
}

/** Most recent first. */
export function byStartDesc(a: Pick<Event, "start_time">, b: Pick<Event, "start_time">) {
  return startMs(b) - startMs(a);
}

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole calendar days from `now` to `iso` in local time (negative = past). */
export function dayDiff(iso: string, now: number) {
  return Math.round((startOfDay(new Date(iso).getTime()) - startOfDay(now)) / 86400000);
}

/** "Today", "Tomorrow", "Yesterday", or a weekday + date ("Wed 7 Oct"). */
export function dayLabel(iso: string, now: number) {
  const diff = dayDiff(iso, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
