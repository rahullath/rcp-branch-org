import type { Event, Session } from "./types";

/** The only branch-wide scheduled series; the rest of `sessions` are personal reading tracks. */
export const SCHEDULED_SERIES_ID = "classics";

/** Sessions complete themselves once their date has passed — nobody marks a week done. */
export function sessionDone(s: Session, now = Date.now()) {
  if (s.completed) return true;
  if (!s.session_date) return false;
  const end = new Date(`${s.session_date}T23:59:59`).getTime();
  return end < now;
}

export function scheduledSessions(sessions: Session[]) {
  return sessions.filter((s) => s.series_id === SCHEDULED_SERIES_ID).sort((a, b) => a.position - b.position);
}

export function nextSession(sessions: Session[], now = Date.now()): Session | undefined {
  return scheduledSessions(sessions).find((s) => !sessionDone(s, now));
}

/** The reading-group event a session is: linked by `session_id`, else same-day reading group. */
export function sessionEvent(s: Session, events: Event[]): Event | undefined {
  return (
    events.find((e) => e.session_id === s.id && !e.archived) ??
    events.find((e) => e.event_type === "reading_group" && !e.archived && !!s.session_date && e.start_time.slice(0, 10) === s.session_date)
  );
}
