"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { del, patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { hasAnyRole } from "@/lib/permissions";
import type { AgendaItem, Event, TopicIdea } from "@/lib/types";
import { programme } from "@/lib/programme";
import { Spinner } from "@/components/ui";
import { ProgrammeRow } from "@/components/v2/programme-row";
import { fmtDay } from "@/components/v2/primitives";
import { useToast } from "@/components/v2/toast";

/**
 * The whole branch programme: every branch meeting's discussion topic,
 * lead-off and prep. It's read off the meetings' agendas, so it's planned by
 * importing the agenda doc (or on the Agenda page) — there's nothing
 * separate to keep in sync.
 */
export default function ProgrammePage() {
  const [now] = useState(() => Date.now());
  const actor = useActor();
  const toast = useToast();
  const { data: events, loading } = useData<Event[]>("/api/events");
  const { data: agenda, setData: setAgenda } = useData<AgendaItem[]>("/api/agenda");
  const [showPast, setShowPast] = useState(false);
  const prog = useMemo(() => programme(events ?? [], agenda ?? [], now), [events, agenda, now]);
  const canPlan = hasAnyRole(actor, "general_secretary", "organizer", "education_officer");

  async function lead(itemId: string) {
    setAgenda((p) => (p ?? []).map((i) => (i.id === itemId ? { ...i, leadoff_name: actor?.name ?? "You" } : i)));
    try {
      await post(`/api/agenda/${itemId}/lead`, {});
      toast("You're leading off · it's on the agenda");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
      revalidate("/api/agenda");
    }
  }
  async function help(itemId: string) {
    setAgenda((p) => (p ?? []).map((i) => (i.id === itemId ? { ...i, prep_with_id: actor?.id ?? null } : i)));
    try {
      await post(`/api/agenda/${itemId}/prep`, { with_id: actor?.id });
      toast("You're helping them prep · it's in your inbox");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
      revalidate("/api/agenda");
    }
  }


  function copy() {
    const lines = prog.upcoming.map((e) => {
      const lead = e.item?.leadoff_name?.replace(/^Comrade\s+/i, "");
      return `${fmtDay(e.event.start_time)} — ${e.item?.title ?? "topic TBC"}${lead ? ` (lead-off: ${lead})` : " (lead-off needed)"}`;
    });
    navigator.clipboard.writeText(["Branch programme", ...lines].join("\n")).then(() => toast("Programme copied for WhatsApp"));
  }

  if (loading && !events) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="v2 pg">
      <div className="ph">
        <Link className="btn-ic" href="/education" aria-label="Back to education">
          <ArrowLeft size={18} strokeWidth={2.25} />
        </Link>
        <div className="grow min0">
          <h1 style={{ fontSize: 22 }}>Branch programme</h1>
          <p className="sub">One topic a meeting · a lead-off · one text and one audio.</p>
        </div>
        <button type="button" className="btn-ic" aria-label="Copy the programme for WhatsApp" onClick={copy}>
          <Copy size={17} strokeWidth={2.25} />
        </button>
      </div>

      {canPlan && (
        <Link className="linkcard" href="/import">
          <span className="lc-k">Plan ahead</span>
          <span className="t">Import the agenda doc</span>
          <span className="small">Its Branch Programme table sets the topic and lead-off for each date.</span>
        </Link>
      )}

      <div className="stack8">
        {prog.upcoming.map((e) => (
          <ProgrammeRow key={e.event.id} entry={e} onLead={lead} onHelp={help} />
        ))}
        {prog.upcoming.length === 0 && <p className="nothing">No branch meetings scheduled.</p>}
      </div>

      <TopicIdeas
        canPlan={canPlan}
        open={prog.upcoming.filter((e) => !e.item).map((e) => e.event)}
        openMeetings={(events ?? []).filter((e) => e.event_type === "open_meeting" && !e.archived && e.status !== "off" && Date.parse(e.start_time) > now).sort((a, b) => a.start_time.localeCompare(b.start_time))}
        onUsed={() => revalidate("/api/agenda")}
      />

      {prog.past.length > 0 && (
        <section>
          <button type="button" className="dayh" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
            Past topics <span>{prog.past.length} · {showPast ? "hide" : "show"}</span>
          </button>
          {showPast && (
            <div className="stack8">
              {prog.past.map((e) => (
                <ProgrammeRow key={e.event.id} entry={e} past />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Ideas for branch discussions and open meetings — not reading groups.
 * Anyone suggests one or says they're interested; an organiser puts it on a
 * meeting that has no topic yet.
 */
function TopicIdeas({ canPlan, open, openMeetings, onUsed }: { canPlan: boolean; open: Event[]; openMeetings: Event[]; onUsed: () => void }) {
  const actor = useActor();
  const toast = useToast();
  const { data, setData } = useData<TopicIdea[]>("/api/topic-ideas");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TopicIdea["kind"]>("branch");
  const ideas = (data ?? []).filter((t) => !t.used_event_id).sort((a, b) => (b.interested?.length ?? 0) - (a.interested?.length ?? 0));
  const me = actor?.id ?? "";
  const isOfficer = !!actor?.role.some((r) => r !== "member");

  async function run(fn: () => Promise<TopicIdea | unknown>, msg: string) {
    try {
      await fn();
      toast(msg);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    }
    revalidate("/api/topic-ideas");
  }

  return (
    <section>
      <div className="row between" style={{ alignItems: "baseline" }}>
        <h4 className="dayh">
          Topic ideas <span>{ideas.length}</span>
        </h4>
        {!adding && (
          <button type="button" className="link small" onClick={() => setAdding(true)}>
            Suggest a topic
          </button>
        )}
      </div>
      {adding && (
        <form
          className="ask stack6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const created = await post<TopicIdea>("/api/topic-ideas", { title, kind }).catch(() => null);
            if (created) setData((p) => [...(p ?? []), created]);
            setTitle("");
            setAdding(false);
            toast("Added to the ideas");
          }}
        >
          <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The housing crisis" aria-label="Topic" autoFocus />
          <span className="tabs2">
            <button type="button" className={kind === "branch" ? "on" : ""} onClick={() => setKind("branch")}>
              Branch discussion
            </button>
            <button type="button" className={kind === "open_meeting" ? "on" : ""} onClick={() => setKind("open_meeting")}>
              Open meeting
            </button>
          </span>
          <div className="row gap8">
            <button type="submit" className="btn btn-p btn-sm" disabled={!title.trim()}>
              Add
            </button>
            <button type="button" className="btn btn-o btn-sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="matlist">
        {ideas.map((t) => {
          const mine = t.interested?.includes(me);
          return (
            <div key={t.id} className="mat-r" style={{ flexWrap: "wrap", gap: 8 }}>
              <span className="grow min0">
                <span className="lc-k">{t.kind === "open_meeting" ? "Open meeting" : "Branch discussion"}</span>
                <span className="t" style={{ display: "block" }}>
                  {t.title}
                </span>
                <span className="small">{t.interested?.length ? `${t.interested.length} interested` : "No one yet"}</span>
              </span>
              <span className="row gap6 wrap">
                <button
                  type="button"
                  className={"btn btn-sm " + (mine ? "btn-p" : "btn-o")}
                  aria-pressed={mine}
                  onClick={() => {
                    setData((p) => (p ?? []).map((x) => (x.id === t.id ? { ...x, interested: mine ? x.interested.filter((i) => i !== me) : [...x.interested, me] } : x)));
                    void run(() => patch(`/api/topic-ideas/${t.id}`, { interested: !mine }), mine ? "Removed" : "Noted");
                  }}
                >
                  Interested
                </button>
                {canPlan && (t.kind === "open_meeting" ? openMeetings : open).length > 0 && (
                  <select
                    className="inp"
                    style={{ height: 32, width: "auto", fontSize: 12 }}
                    value=""
                    aria-label={`Put ${t.title} on a meeting`}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      void run(() => patch(`/api/topic-ideas/${t.id}`, { event_id: e.target.value }), "On the programme").then(onUsed);
                    }}
                  >
                    <option value="">Use for…</option>
                    {(t.kind === "open_meeting" ? openMeetings : open).map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {t.kind === "open_meeting" ? `${ev.title.split(" — ")[0]} · ` : ""}
                        {fmtDay(ev.start_time)}
                      </option>
                    ))}
                  </select>
                )}
                {(t.created_by === me || isOfficer) && (
                  <button
                    type="button"
                    className="link small"
                    onClick={() => {
                      if (!window.confirm(`Remove "${t.title}"?`)) return;
                      setData((p) => (p ?? []).filter((x) => x.id !== t.id));
                      void run(() => del(`/api/topic-ideas/${t.id}`), "Removed");
                    }}
                  >
                    Remove
                  </button>
                )}
              </span>
            </div>
          );
        })}
        {ideas.length === 0 && <p className="small">No ideas yet.</p>}
      </div>
    </section>
  );
}
