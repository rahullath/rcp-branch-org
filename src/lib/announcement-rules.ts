import type { Announcement } from "./types";

type Parsed = Pick<Announcement, "title" | "body" | "link" | "link_label" | "deadline" | "ends_on" | "tag" | "urgent" | "signed_by">;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Check an announcement from the form: trimmed, bounded, with a real https link and real days. */
export function parseAnnouncement(body: Record<string, unknown> | null): { value: Parsed } | { error: string } {
  const title = str(body?.title, 120);
  if (!title) return { error: "Give the announcement a title" };
  const link = str(body?.link, 500);
  if (link && !/^https:\/\/\S+$/.test(link)) return { error: "The link should start with https://" };
  const day = (v: unknown, what: string) => {
    const d = str(v, 10);
    if (d && (!DAY.test(d) || Number.isNaN(Date.parse(d)))) throw new Error(`${what} isn't a date`);
    return d;
  };
  try {
    const tag = str(body?.tag, 30);
    if (tag && !/^[a-z][a-z-]{0,29}$/.test(tag)) return { error: "That tag isn't valid" };
    return {
      value: {
        title,
        body: typeof body?.body === "string" ? body.body.trim().slice(0, 4000) : "",
        link,
        link_label: link ? (str(body?.link_label, 40) ?? "Open the link") : null,
        deadline: day(body?.deadline, "The deadline"),
        ends_on: day(body?.ends_on, "The hide-after day"),
        tag,
        urgent: body?.urgent === true,
        signed_by: str(body?.signed_by, 80),
      },
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Today in the UK, as YYYY-MM-DD. */
export const ukToday = (now = Date.now()) => new Date(now).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** Still worth showing: not removed, and before its hide-after day (or 3 days past its deadline). */
export function isLive(a: Pick<Announcement, "archived" | "deadline" | "ends_on">, today = ukToday()): boolean {
  if (a.archived) return false;
  const end = a.ends_on ?? (a.deadline ? addDays(a.deadline, 3) : null);
  return !end || today <= end;
}

/** Whole days until the deadline day is over: 0 on the day itself, negative once it has passed. */
export function daysLeft(deadline: string, today = ukToday()): number {
  return Math.round((Date.parse(`${deadline}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400_000);
}
