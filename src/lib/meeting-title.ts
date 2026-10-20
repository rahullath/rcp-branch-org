import type { AgendaItem, Event } from "./types";
import { getEvent, listAgenda, updateEvent } from "./data";

/*
 * A branch meeting is named after its political discussion — "Reform or
 * Revolution", not "Branch meeting". The "Branch" label already says what
 * kind of event it is. Titles someone typed by hand are left alone.
 */

const GENERIC = /^(branch( meeting)?s?\b.*|meeting)$/i;

/** The meeting's topic: its main political item (not burning questions). */
export function meetingTopic(eventId: string, items: AgendaItem[]): string | null {
  const pol = items
    .filter((i) => i.event_id === eventId && i.section === "political" && !i.archived && !/^burning questions/i.test(i.title))
    .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
  return pol[0]?.title.trim() || null;
}

/** Whether a title is ours to replace: generic, or the topic it was given before. */
export function isAutoTitle(title: string, previousTopics: string[] = []) {
  const t = title.trim();
  return GENERIC.test(t) || previousTopics.some((p) => p.trim().toLowerCase() === t.toLowerCase());
}

/** After a political item changes: rename the branch meeting to its topic. */
export async function syncMeetingTitle(eventId: string | null | undefined, previousTopic?: string | null) {
  if (!eventId) return null;
  const event = await getEvent(eventId);
  if (!event || event.event_type !== "branch") return null;
  const topic = meetingTopic(event.id, await listAgenda());
  if (!topic || topic === event.title) return event;
  if (!isAutoTitle(event.title, previousTopic ? [previousTopic] : [])) return event;
  return updateEvent(event.id, { title: topic } as Partial<Event>);
}
