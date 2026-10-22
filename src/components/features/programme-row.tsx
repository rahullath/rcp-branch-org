"use client";

import Link from "next/link";
import type { ProgrammeEntry } from "@/lib/programme";
import { fmtDayNum, fmtMonth, fmtWeekday, usePeople } from "./primitives";

/**
 * One meeting in the programme: date, topic, lead-off, and whether the
 * 1 text + 1 audio is there. "I'll lead" appears when nobody is down yet;
 * once someone is, anyone experienced can offer to help them prepare.
 */
export function ProgrammeRow({ entry, past, onLead, onHelp }: { entry: ProgrammeEntry; past?: boolean; onLead?: (itemId: string) => void; onHelp?: (itemId: string) => void }) {
  const { event, item } = entry;
  const { me, name, full, ini } = usePeople();
  const lead = item?.leadoff_name?.replace(/^Comrade\s+/i, "");
  // name(me) is "You"; compare with the full name, first name or initials the agenda might use.
  const myNames = me ? [full(me), full(me)?.split(/\s+/)[0], ini(me)].filter(Boolean).map((x) => x!.toLowerCase()) : [];
  const leadIsMe = !!lead && myNames.includes(lead.toLowerCase());
  return (
    <div className={"evcard" + (past ? " past" : "")}>
      <Link href={`/events/${event.id}`} className={"dateblk"} aria-label={`Open the meeting on ${fmtWeekday(event.start_time)}`}>
        <b>{fmtDayNum(event.start_time)}</b>
        <span>{fmtMonth(event.start_time)}</span>
      </Link>
      <Link href={`/events/${event.id}`} className="grow min0">
        <span className="t" style={{ display: "block" }}>
          {item ? item.title : <span className="muted">Topic to be set</span>}
        </span>
        <span className="small" style={{ display: "block" }}>
          {item ? (lead ? `Lead-off: ${lead}` : "Lead-off needed") : `${fmtWeekday(event.start_time)} · branch meeting`}
          {item?.prep_with_id ? ` · prep with ${name(item.prep_with_id)}` : ""}
        </span>
        {item && !past && (
          <span className="evstat">
            <span className={entry.hasText ? "" : "warn"}>{entry.hasText ? "Text ✓" : "Needs a text"}</span>
            <span className={entry.hasAudio ? "" : "warn"}>{entry.hasAudio ? "Audio ✓" : "Needs audio"}</span>
            {entry.idom && <span>IDOM</span>}
          </span>
        )}
      </Link>
      {item && !item.leadoff_name && !past && onLead && (
        <button type="button" className="btn btn-o btn-sm" onClick={() => onLead(item.id)}>
          I&apos;ll lead
        </button>
      )}
      {item && item.leadoff_name && !item.prep_with_id && !past && onHelp && !leadIsMe && (
        <button type="button" className="btn btn-o btn-sm" onClick={() => onHelp(item.id)} title="Go through the reading and main points with them beforehand">
          Help prep
        </button>
      )}
    </div>
  );
}
