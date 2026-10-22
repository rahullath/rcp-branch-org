import type { Event, Session } from "./types";

/** The reading-group event a session is: linked by `session_id`, else same-day reading group. */
export function sessionEvent(s: Session, events: Event[]): Event | undefined {
  return (
    events.find((e) => e.session_id === s.id && !e.archived) ??
    events.find((e) => e.event_type === "reading_group" && !e.archived && !!s.session_date && e.start_time.slice(0, 10) === s.session_date)
  );
}
