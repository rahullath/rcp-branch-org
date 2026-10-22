import type { AgendaItem, Event, PrepLink } from "./types";
import { isUpcoming, startMs } from "./dates";

/*
 * The branch programme is the political discussion at each branch meeting:
 * a topic (a theme — the state, philosophy, racism — through a concrete
 * example), a comrade leading off, and usually one text and one audio/video
 * to prepare with, sometimes built on an IDOM article. It isn't stored
 * separately: it's read off each meeting's political agenda item, so the
 * agenda import and the Agenda page keep it current.
 */

export interface ProgrammeEntry {
  event: Event;
  /** The political discussion item, if the topic is set. */
  item: AgendaItem | null;
  hasText: boolean;
  hasAudio: boolean;
  idom: boolean;
}

const AUDIO: PrepLink["kind"][] = ["youtube", "spotify", "podcast"];

function isDiscussion(i: AgendaItem) {
  return i.section === "political" && !/^burning questions/i.test(i.title);
}

export function programme(events: Event[], agenda: AgendaItem[], now: number) {
  const entries: ProgrammeEntry[] = events
    .filter((e) => e.event_type === "branch" && !e.archived)
    .sort((a, b) => startMs(a) - startMs(b))
    .map((event) => {
      const item = agenda.filter((i) => i.event_id === event.id && !i.archived && isDiscussion(i)).sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))[0] ?? null;
      const links = item?.prep_links ?? [];
      const text = `${item?.title ?? ""} ${links.map((l) => `${l.label} ${l.url}`).join(" ")}`;
      return {
        event,
        item,
        hasText: links.some((l) => !l.kind || l.kind === "article"),
        hasAudio: links.some((l) => !!l.kind && AUDIO.includes(l.kind)),
        idom: /\bidom\b|in defence of marxism/i.test(text),
      };
    });
  return {
    upcoming: entries.filter((e) => isUpcoming(e.event, now)),
    past: entries.filter((e) => !isUpcoming(e.event, now)).reverse(),
  };
}
