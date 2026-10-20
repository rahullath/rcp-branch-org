import type { Event, PrepLink, Rsvp, SharedRead } from "./types";

/*
 * Pre-reads (and pre-listens). For branch meetings and reading groups the
 * whole branch is expected to have done it unless they've said they can't
 * come: the day before, whoever hasn't gets one nudge, and whoever follows
 * them up is asked to check in. For anything else (a paper stall's
 * articles) only the lead sees who hasn't — no nudges, it isn't school.
 */

export const PREREAD_TYPES: Event["event_type"][] = ["branch", "reading_group"];

/** Is this person expected to have read the event's pre-read? */
export function expectsReading(e: Pick<Event, "event_type">, rsvp: Rsvp["status"] | string | null | undefined) {
  if (PREREAD_TYPES.includes(e.event_type)) return rsvp !== "no";
  return rsvp === "going" || rsvp === "maybe";
}

/** Article, YouTube, Spotify or podcast — from the link. */
export function linkKind(url: string): PrepLink["kind"] {
  if (/youtu\.?be/.test(url)) return "youtube";
  if (/spotify\.com/.test(url)) return "spotify";
  if (/podcast|anchor\.fm|soundcloud/.test(url)) return "podcast";
  return "article";
}

/** The one to do: marked main, else the first added. */
export function mainRead<T extends Pick<SharedRead, "main" | "created_at">>(reads: T[]): T | undefined {
  return reads.find((r) => r.main) ?? [...reads].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
}

/** Done the pre-read: any one of the event's readings (or shared one of them). */
export const didRead = (reads: Pick<SharedRead, "read_by" | "shared_by">[], userId: string) => reads.some((r) => r.read_by.includes(userId) || r.shared_by === userId);
