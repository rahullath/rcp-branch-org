"use client";

import { festivalCountdown, festivalDates } from "@/lib/festival";
import { useFestival } from "@/lib/festival-config";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useData } from "@/lib/hooks";
import type { AgendaItem, Comrade, Event, EventExtras, FollowUp, ReadingGroup, ReadingGroupContact, ReadingGroupMember } from "@/lib/types";
import { mainDiscussion } from "@/lib/types";
import { QUIET_DAYS } from "@/lib/follow-through";
import { byStartAsc, dayDiff, isUpcoming } from "@/lib/dates";
import { groupStats } from "@/lib/reading-groups";
import { useActor } from "@/lib/actor-context";
import { useRsvps } from "@/lib/use-rsvps";
import { Spinner } from "@/components/ui";
import { AskCard } from "@/components/features/ask-card";
import { useInbox } from "@/components/features/use-inbox";
import { Chev, firstPart, fmtLongDay, fmtTime, fmtWeekday, SectionHead, StateTag, usePeople } from "@/components/features/primitives";

/**
 * This Week: the top ask, answerable right here; today's events; then two
 * links (the next branch meeting's agenda, this week's reading). Nothing to tick.
 */
export default function HomePage() {
  const [now] = useState(() => Date.now());
  const { festival } = useFestival();
  const festivalDays = festivalCountdown(now, festival);
  const actor = useActor();
  const { data: followUps } = useData<FollowUp[]>("/api/follow-ups");
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  const myPeople = (followUps ?? [])
    .filter((f) => f.follower_id === actor?.id)
    .sort((a, b) => Date.parse(a.last_touched_at ?? a.created_at) - Date.parse(b.last_touched_at ?? b.created_at));
  const quietCount = myPeople.filter((f) => now - Date.parse(f.last_touched_at ?? f.created_at) >= QUIET_DAYS * 86400_000).length;
  const { data: events, loading } = useData<Event[]>("/api/events");
  const { data: extras } = useData<EventExtras>("/api/event-extras");
  const { data: agenda } = useData<AgendaItem[]>("/api/agenda");
  const { data: groups } = useData<ReadingGroup[]>("/api/reading-groups");
  const { data: members } = useData<ReadingGroupMember[]>("/api/reading-group-members");
  const { data: groupContacts } = useData<ReadingGroupContact[]>("/api/reading-group-contacts");
  const { data: inbox, setData: setInbox } = useInbox();
  const { mine, goingCount } = useRsvps();
  const { me } = usePeople();

  const upcoming = useMemo(() => (events ?? []).filter((e) => isUpcoming(e, now)).sort(byStartAsc), [events, now]);
  const meeting = upcoming.find((e) => e.event_type === "branch");
  // The meeting has its own card below, so it isn't listed twice.
  const today = upcoming.filter((e) => dayDiff(e.start_time, now) === 0 && e.id !== meeting?.id);
  const later = upcoming.filter((e) => {
    const d = dayDiff(e.start_time, now);
    return d > 0 && d < 7 && e.id !== meeting?.id;
  });
  const meetingItems = (agenda ?? []).filter((i) => !!meeting && i.event_id === meeting.id).length;
  const topic = meeting ? (mainDiscussion(agenda ?? [], meeting.id) ?? null) : null;
  const running = (groups ?? []).filter((g) => !g.archived && g.status !== "finished");
  const myGroups = running.filter((g) => (members ?? []).some((m) => m.group_id === g.id && m.user_id === me));
  const openGroups = running.filter((g) => !groupStats(g, members ?? [], groupContacts ?? []).full);
  const asks = inbox?.asks ?? [];
  const meetingToday = !!meeting && dayDiff(meeting.start_time, now) === 0;
  // The one ask shown here: something only you can answer, before "bring someone".
  const topAsk = asks.find((a) => a.kind !== "invite-contacts" && a.kind !== "set-week") ?? asks[0];

  const meetingCard = meeting && (
        <Link className="linkcard" href={`/events/${meeting.id}`}>
          <span className="lc-k">
            Branch meeting · {dayDiff(meeting.start_time, now) === 0 ? "today" : fmtWeekday(meeting.start_time)} {fmtTime(meeting.start_time)}
            {mine(meeting.id)?.status === "going" ? " · you're going" : ""}
          </span>
          <span className="t">{topic ? topic.title : `${meetingItems} item${meetingItems === 1 ? "" : "s"} on the agenda`}</span>
          <span className="small">
            {[topic ? (topic.leadoff_name ? `Lead-off ${topic.leadoff_name.replace(/^Comrade\s+/i, "")}` : "Lead-off needed") : null, meeting.location ? firstPart(meeting.location) : "Place TBC"].filter(Boolean).join(" · ")}
          </span>
          <Chev />
        </Link>
  );

  if (loading && !events) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="screen pg">
      <div className="ph">
        <div>
          <h1>This Week</h1>
          <p className="sub">{fmtLongDay(new Date(now).toISOString())}</p>
        </div>
      </div>

      {actor?.namePending && (
        <Link className="ask" href="/settings" style={{ borderColor: "var(--red)" }}>
          <span className="ask-k">One thing first</span>
          <span className="t">Tell the branch your name and initials</span>
          <span className="small" style={{ display: "block" }}>
            Set your name and initials so people (and imported agendas) know it&apos;s you.
          </span>
        </Link>
      )}

      {asks.length > 0 && (
        <section className="askbox">
          <Link className="askbox-h" href="/inbox">
            <b>
              {asks.length} need{asks.length === 1 ? "s" : ""} your answer
            </b>
            <span>
              See all
              <ChevronRight size={16} strokeWidth={2.25} />
            </span>
          </Link>
          <AskCard ask={topAsk} onDone={(k) => setInbox((p) => (p ? { ...p, asks: p.asks.filter((a) => a.k !== k) } : p))} />
        </section>
      )}

      <section>
        <SectionHead title="Today" />
        {meetingToday && <div style={{ marginBottom: today.length ? 8 : 0 }}>{meetingCard}</div>}
        {today.length === 0 ? (
          meetingToday ? null :
          <p className="small">Nothing on today.</p>
        ) : (
          <div className="list">
            {today.map((e) => {
              const role = extras?.roles.find((r) => r.event_id === e.id && r.user_id === me);
              return (
                <Link key={e.id} className="evrow" href={`/events/${e.id}`}>
                  <span className="evtime one">{fmtTime(e.start_time)}</span>
                  <span className="grow min0">
                    <span className="t trunc">{e.title}</span>
                    <span className="small trunc">
                      {role ? role.role : "Meet " + fmtTime(e.meetup_time ?? e.start_time)} · {firstPart(e.location || "TBC")}
                    </span>
                  </span>
                  <StateTag status={mine(e.id)?.status} />
                </Link>
              );
            })}
          </div>
        )}
      </section>


      {meeting && !meetingToday && meetingCard}

      <section>
        <div className="sh">
          <h2>Later this week</h2>
          <Link className="link" href="/events">
            All events
          </Link>
        </div>
        {later.length === 0 ? (
          <p className="small">Nothing else this week.</p>
        ) : (
          <div className="list">
            {later.map((e) => (
              <Link key={e.id} className="evrow" href={`/events/${e.id}`}>
                <span className="evtime">
                  {fmtWeekday(e.start_time)}
                  <br />
                  <b>{fmtTime(e.start_time)}</b>
                </span>
                <span className="grow min0">
                  <span className="t trunc">{e.title}</span>
                  <span className="small trunc">
                    {goingCount(e.id)} going{e.target ? ` · need ${e.target}` : ""}
                  </span>
                </span>
                <StateTag status={mine(e.id)?.status} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {festival && festivalDays !== null && (
        <>
          <a className="linkcard" href={festival.url ?? "/festival"} target="_blank" rel="noopener noreferrer">
            <span className="lc-k">{festival.name} · {festivalDates(festival)}</span>
            <span className="t">{festivalDays > 0 ? `${festivalDays} day${festivalDays === 1 ? "" : "s"} to go` : "It's on now"}</span>
            <span className="small">{festival.location ? `${festival.location} · ` : ""}tickets and the programme. Bring your contacts.</span>
            <Chev />
          </a>
          <Link className="link small" href="/graphic?festival=1" style={{ display: "block", margin: "-4px 0 12px" }}>
            Make a festival graphic with a ticket QR
          </Link>
        </>
      )}

      {myPeople.length > 0 && (
        <Link className="linkcard" href="/follow-ups">
          <span className="lc-k">Your people · {myPeople.length}</span>
          <span className="t">
            {myPeople
              .slice(0, 3)
              .map((f) => (comrades ?? []).find((c) => c.id === f.person_id)?.name.split(/\s+/)[0] ?? "Someone")
              .join(", ")}
            {myPeople.length > 3 ? ` +${myPeople.length - 3}` : ""}
          </span>
          <span className={"small" + (quietCount ? " red" : "")}>{quietCount ? `${quietCount} gone quiet — drop them a message` : "Everyone's had a catch-up recently"}</span>
          <Chev />
        </Link>
      )}

      {myGroups.length > 0 ? (
        <Link className="linkcard" href="/education">
          <span className="lc-k">Your reading group{myGroups.length > 1 ? "s" : ""}</span>
          <span className="t">{myGroups.map((g) => g.title).join(" · ")}</span>
          <span className="small">{myGroups.map((g) => g.cadence || g.current_chapter).filter(Boolean).join(" · ") || "Open for details"}</span>
          <Chev />
        </Link>
      ) : (
        openGroups.length > 0 && (
          <Link className="linkcard" href="/education">
            <span className="lc-k">Reading groups</span>
            <span className="t">
              {openGroups.length} group{openGroups.length === 1 ? " has" : "s have"} space
            </span>
            <span className="small">{openGroups.slice(0, 3).map((g) => g.title).join(" · ")}</span>
            <Chev />
          </Link>
        )
      )}
    </div>
  );
}
