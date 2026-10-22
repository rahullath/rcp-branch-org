"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { useData } from "@/lib/hooks";
import { post } from "@/lib/client";
import type { Event, EventExtras, EventGuest, EventType } from "@/lib/types";
import { byStartAsc, byStartDesc, dayDiff, isUpcoming } from "@/lib/dates";
import { useRsvps } from "@/lib/use-rsvps";
import { EventModal } from "@/components/event-modal";
import { Spinner } from "@/components/ui";
import { EVENT_TYPE_META } from "@/lib/types";
import { firstPart, fmtDayNum, fmtMonth, fmtTime, fmtWeekday, StateTag } from "@/components/features/primitives";
import { useToast } from "@/components/features/toast";
import { CalendarLinks } from "@/components/features/calendar-links";

const FILTERS: [string, EventType[] | null][] = [
  ["All", null],
  ["Outreach", ["uni_stall", "paper_sale", "mobilization", "phonebank", "postering"]],
  ["Meetings", ["open_meeting", "branch", "committee", "one_on_one"]],
  ["Education", ["reading_group"]],
  ["Social", ["social"]],
];

const PAST_PAGE = 15;

/** Each card says what the event is short of — people, items, roles. Red means it needs someone. */
export default function EventsPage() {
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState("All");
  const [showPast, setShowPast] = useState(false);
  const [pastShown, setPastShown] = useState(PAST_PAGE);
  const [showAdd, setShowAdd] = useState(false);
  const { data: events, loading, setData } = useData<Event[]>("/api/events");
  const { data: extras } = useData<EventExtras>("/api/event-extras");
  const { data: guests } = useData<EventGuest[]>("/api/event-guests");
  const { mine, goingCount } = useRsvps();
  const toast = useToast();

  const types = FILTERS.find(([k]) => k === filter)?.[1] ?? null;
  const { upcoming, past } = useMemo(() => {
    const rows = (events ?? []).filter((e) => !types || types.includes(e.event_type));
    return {
      upcoming: rows.filter((e) => isUpcoming(e, now)).sort(byStartAsc),
      past: rows.filter((e) => !isUpcoming(e, now)).sort(byStartDesc),
    };
  }, [events, types, now]);

  async function addEvent(input: Partial<Event>) {
    const created = await post<Event>("/api/events", input);
    setData([created, ...(events ?? [])]);
    setShowAdd(false);
    toast("Event made · everyone gets one notification");
  }

  const card = (e: Event, isPast = false) => {
    const open = (extras?.bring ?? []).filter((b) => b.event_id === e.id && !b.claimed_by).length;
    const roleOpen = (extras?.roles ?? []).some((r) => r.event_id === e.id && !r.user_id);
    const g = goingCount(e.id) + (guests ?? []).filter((x) => x.event_id === e.id && x.status === "going").length;
    const short = !!e.target && g < e.target;
    return (
      <Link key={e.id} className={"evcard" + (isPast ? " past" : "")} href={`/events/${e.id}`}>
        <span className={"dateblk" + (!isPast && dayDiff(e.start_time, now) === 0 ? " today" : "")}>
          <b>{fmtDayNum(e.start_time)}</b>
          <span>{isPast ? fmtMonth(e.start_time) : fmtWeekday(e.start_time)}</span>
        </span>
        <span className="grow min0">
          <span className="kicker">
            {EVENT_TYPE_META[e.event_type]?.label ?? e.event_type}
            {e.status === "tentative" && !isPast && <span className="red"> · only if {e.target} go</span>}
            {e.status === "off" && <span className="red"> · called off</span>}
            {e.scope && e.scope !== "branch" && <span> · {e.scope === "national" ? "national" : "district"}</span>}
          </span>
          <span className="t" style={{ display: "block", textDecoration: e.status === "off" ? "line-through" : undefined }}>
            {e.title}
          </span>
          <span className="small" style={{ display: "block" }}>
            {fmtTime(e.start_time)} · {firstPart(e.location || "TBC")}
          </span>
          {isPast ? (
            <span className="evstat">
              <span>{g} went</span>
            </span>
          ) : (
            <span className="evstat">
              <span className={short ? "warn" : ""}>
                {g}
                {e.target ? ` of ${e.target}` : ""} going
              </span>
              {open > 0 && <span className="warn">{open} to bring</span>}
              {roleOpen && <span className="warn">role open</span>}
            </span>
          )}
        </span>
        {!isPast && <StateTag status={mine(e.id)?.status} />}
      </Link>
    );
  };

  return (
    <div className="screen pg">
      <div className="ph">
        <div>
          <h1>Events</h1>
          <p className="sub">What&apos;s coming up.</p>
        </div>
        <button type="button" className="btn btn-p btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={16} strokeWidth={2.25} />
          New
        </button>
      </div>
      <div className="chips">
        {FILTERS.map(([k]) => (
          <button
            key={k}
            type="button"
            className={"chip" + (filter === k ? " on" : "")}
            onClick={() => {
              setFilter(k);
              setPastShown(PAST_PAGE);
            }}
          >
            {k}
          </button>
        ))}
      </div>

      {loading && !events ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : upcoming.length === 0 ? (
        <p className="nothing">Nothing coming up{filter !== "All" ? " here" : ""}.</p>
      ) : (
        <div className="stack8">{upcoming.map((e) => card(e))}</div>
      )}

      <button type="button" className="li li-link" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
        <span className="grow t">Past events</span>
        <span className="small">{past.length}</span>
        <ChevronRight size={16} strokeWidth={2.25} style={{ transform: showPast ? "rotate(90deg)" : undefined }} />
      </button>
      {showPast && (
        <div className="stack8">
          {past.slice(0, pastShown).map((e) => card(e, true))}
          {past.length > pastShown && (
            <button type="button" className="btn btn-o btn-sm" onClick={() => setPastShown((n) => n + PAST_PAGE)}>
              Show earlier ({past.length - pastShown} more)
            </button>
          )}
        </div>
      )}

      <section className="ask">
        <span className="ask-k">Every event in your calendar, kept up to date</span>
        <CalendarLinks compact />
      </section>

      {showAdd && <EventModal onClose={() => setShowAdd(false)} onSave={addEvent} />}
    </div>
  );
}
