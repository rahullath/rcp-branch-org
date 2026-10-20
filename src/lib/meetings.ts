import type { Event } from "./types";

/**
 * Organisational agenda items close at 18:00 the evening before the
 * meeting, so the chair can order them. Officers can still add after.
 */
export function agendaClosesAt(meeting: Pick<Event, "start_time">): Date {
  const d = new Date(meeting.start_time);
  d.setDate(d.getDate() - 1);
  d.setHours(18, 0, 0, 0);
  return d;
}

export function closesLabel(meeting: Pick<Event, "start_time">) {
  return `${agendaClosesAt(meeting).toLocaleDateString("en-GB", { weekday: "short" })} 18:00`;
}
