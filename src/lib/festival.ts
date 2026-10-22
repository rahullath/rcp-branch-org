import type { Festival } from "./types";

/** How far ahead the Home card starts showing. */
export const FESTIVAL_SHOW_DAYS = 60;

/** Days until it starts (0 = today or it has begun), or null when it isn't time to show it (too early, or over). */
export function festivalCountdown(now: number, f: Pick<Festival, "start_date" | "end_date"> | null | undefined): number | null {
  if (!f) return null;
  const start = Date.parse(`${f.start_date}T00:00:00Z`);
  const end = Date.parse(`${f.end_date}T23:59:59Z`);
  if (now > end) return null;
  const days = Math.ceil((start - now) / 86400_000);
  if (days > FESTIVAL_SHOW_DAYS) return null;
  return Math.max(0, days);
}

const MONTH = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

/** "13–15 Nov", "30 Oct–2 Nov", or "13 Nov" for a single day. */
export function festivalDates(f: Pick<Festival, "start_date" | "end_date">): string {
  const a = new Date(`${f.start_date}T12:00:00Z`);
  const b = new Date(`${f.end_date}T12:00:00Z`);
  if (f.start_date === f.end_date) return `${a.getUTCDate()} ${MONTH(a)}`;
  return MONTH(a) === MONTH(b) ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTH(b)}` : `${a.getUTCDate()} ${MONTH(a)}–${b.getUTCDate()} ${MONTH(b)}`;
}

/** Days left until the end of a deadline day: 0 on the day itself, negative once it has passed. */
export function daysUntil(day: string, now: number): number {
  const end = Date.parse(`${day}T23:59:59Z`);
  return Math.floor((end - now) / 86400_000);
}
