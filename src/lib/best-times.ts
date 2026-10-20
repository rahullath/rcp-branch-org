import type { Availability, DaySlot, Event, Weekday } from "./types";
import { WEEKDAYS } from "./types";
import { londonDay } from "./follow-through";
import { awayOn } from "./tasks";

/*
 * When most people can make a sale. Everyone's usual week (Settings →
 * when you're usually free) gives morning / afternoon / evening per day; this
 * walks the next fortnight, drops anyone away that day and any slot that
 * already has a sale, and ranks what's left by how many are free.
 */

/** The start time a slot turns into when you plan it. */
export const SLOT_START: Record<DaySlot, string> = { am: "11:00", aft: "14:00", eve: "18:00" };
export const SLOT_WORD: Record<DaySlot, string> = { am: "morning", aft: "afternoon", eve: "evening" };
const SLOTS: DaySlot[] = ["am", "aft", "eve"];

export interface BestTime {
  /** YYYY-MM-DD (London). */
  date: string;
  slot: DaySlot;
  /** Who's free, user ids. */
  people: string[];
}

const weekdayOf = (date: string): Weekday => WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7];
const plusDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const slotOfHour = (h: number): DaySlot => (h < 12 ? "am" : h < 17 ? "aft" : "eve");

/** Who's usually free in a weekday slot: the grid, or the older "paper sale days" (daytime). */
function freeIn(avail: Availability[], userId: string, day: Weekday, slot: DaySlot) {
  const rows = avail.filter((a) => a.user_id === userId);
  const grid = rows.find((a) => a.activity === "general" && (a.slots?.length ?? 0) > 0);
  if (grid) return (grid.slots ?? []).includes(`${day}:${slot}`);
  return slot !== "eve" && rows.some((a) => a.activity === "paper_sale" && a.days.includes(day));
}

export function bestTimes(avail: Availability[], userIds: string[], sales: Pick<Event, "start_time">[], now: number, opts: { days?: number; min?: number; limit?: number } = {}): BestTime[] {
  const { days = 14, min = 2, limit = 3 } = opts;
  const today = londonDay(now);
  const taken = new Set(
    sales.map((e) => {
      const d = new Date(e.start_time);
      const hour = Number(d.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }));
      return `${londonDay(d.getTime())}:${slotOfHour(hour)}`;
    }),
  );
  const out: BestTime[] = [];
  // From tomorrow: a same-day sale is too late to organise from here.
  for (let i = 1; i <= days; i++) {
    const date = plusDays(today, i);
    const day = weekdayOf(date);
    for (const slot of SLOTS) {
      if (taken.has(`${date}:${slot}`)) continue;
      const people = userIds.filter((id) => freeIn(avail, id, day, slot) && !awayOn(avail, id, date));
      if (people.length >= min) out.push({ date, slot, people });
    }
  }
  // Real alternatives: each weekday slot once (not "Saturday afternoon" twice) and one per date.
  const picked: BestTime[] = [];
  for (const t of out.sort((a, b) => b.people.length - a.people.length || a.date.localeCompare(b.date))) {
    if (picked.some((p) => p.date === t.date || (weekdayOf(p.date) === weekdayOf(t.date) && p.slot === t.slot))) continue;
    picked.push(t);
    if (picked.length === limit) break;
  }
  return picked;
}

/** "2026-10-24", "am" → an ISO start for the event form (local time). */
export const slotStart = (t: Pick<BestTime, "date" | "slot">) => new Date(`${t.date}T${SLOT_START[t.slot]}:00`).toISOString();
