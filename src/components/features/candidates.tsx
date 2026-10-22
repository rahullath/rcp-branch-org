"use client";

import { useState } from "react";
import { patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { candidacyProgress, isCandidate } from "@/lib/candidates";
import { londonDay } from "@/lib/follow-through";
import type { AgendaAction, Comrade, Event, EventExtras, FollowUp, Rsvp } from "@/lib/types";
import { SectionHead, fmtDay, usePeople } from "./primitives";
import { useToast } from "./toast";

/**
 * Candidates: the first three months (or longer if extended). Each one shows
 * their record so far: jobs given and done, roles tried, branch meetings
 * attended and pre-reads done. Give them something to do in one tap. Officers
 * and whoever follows them up see this; the review lands in the GS's inbox a
 * week before it's due.
 */
/** Good first things to try, one tap to give. */
const FIRST_JOBS = ["Sell papers at the next stall", "Take minutes at branch once", "Lead off part of a discussion", "Bring a contact to a meeting"];

export function Candidates({ followUps }: { followUps: FollowUp[] }) {
  const actor = useActor();
  const toast = useToast();
  const { name } = usePeople();
  const [now] = useState(() => Date.now());
  const today = londonDay(now);
  const { data: comrades, setData: setComrades } = useData<Comrade[]>("/api/comrades");
  const { data: actions } = useData<AgendaAction[]>("/api/agenda-actions");
  const { data: events } = useData<Event[]>("/api/events");
  const { data: rsvps } = useData<Rsvp[]>("/api/rsvps");
  const { data: extras } = useData<EventExtras>("/api/event-extras");
  const [adding, setAdding] = useState(false);
  const [giving, setGiving] = useState<string | null>(null);
  const [job, setJob] = useState("");
  const isOfficer = !!actor?.role.some((r) => r !== "member");

  const followerOf = (c: Comrade) => followUps.find((f) => f.active && f.person_id === c.id);
  const all = (comrades ?? []).filter(isCandidate);
  const visible = all.filter((c) => isOfficer || followerOf(c)?.follower_id === actor?.id || followerOf(c)?.with_id === actor?.id);
  if (!isOfficer && visible.length === 0) return null;

  async function candidacy(c: Comrade, body: Record<string, unknown>, message: string) {
    try {
      const updated = await patch<Comrade>(`/api/comrades/${c.id}`, body);
      setComrades((p) => (p ?? []).map((x) => (x.id === c.id ? { ...x, ...updated } : x)));
      toast(message);
      revalidate("/api/inbox");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  async function give(c: Comrade) {
    if (!job.trim()) return;
    try {
      await post("/api/agenda-actions", { text: job.trim(), ...(c.profile_id ? { owner_id: c.profile_id } : { owner_comrade_id: c.id }), source: "Candidacy" });
      revalidate("/api/agenda-actions", "/api/inbox");
      toast(c.profile_id ? `Given to ${c.name.split(" ")[0]} · it's in their inbox` : `Given to ${c.name.split(" ")[0]} · they're not on the app, so tell them`);
      setGiving(null);
      setJob("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  /** What they've done since starting their candidacy, as a few short chips. */
  function record(c: Comrade): { label: string; weak?: boolean }[] {
    const since = c.candidate_since ?? "";
    const theirs = (actions ?? []).filter((a) => (c.profile_id && a.owner_id === c.profile_id) || a.owner_comrade_id === c.id);
    const recent = theirs.filter((a) => a.created_at.slice(0, 10) >= since);
    const done = recent.filter((a) => a.done).length;
    const open = recent.filter((a) => !a.done).length;
    const jobs = recent.length === 0 ? { label: "no jobs yet", weak: true } : { label: `${done}/${recent.length} jobs done${open ? ` · ${open} open` : ""}` };
    if (!c.profile_id) return [jobs, { label: "not on the app", weak: true }];
    const pid = c.profile_id;
    const past = (events ?? []).filter((e) => !e.archived && e.status !== "off" && e.start_time.slice(0, 10) >= since && Date.parse(e.start_time) < now);
    const branch = past.filter((e) => e.event_type === "branch");
    const cameBranch = branch.filter((e) => (rsvps ?? []).some((r) => r.event_id === e.id && r.user_id === pid && r.status === "going")).length;
    const activity = past.filter((e) => e.event_type !== "branch" && (rsvps ?? []).some((r) => r.event_id === e.id && r.user_id === pid && r.status === "going")).length;
    const roles =
      (extras?.roles ?? []).filter((r) => r.user_id === pid && past.some((e) => e.id === r.event_id)).length +
      past.filter((e) => e.chair_id === pid || e.minutes_id === pid).length;
    return [
      ...(branch.length ? [{ label: `branch ${cameBranch}/${branch.length}`, weak: cameBranch < branch.length }] : []),
      { label: activity ? `${activity} sale${activity === 1 ? " or event" : "s or events"}` : "no sales yet", weak: !activity },
      jobs,
      ...(roles ? [{ label: `${roles} role${roles === 1 ? "" : "s"}` }] : []),
    ];
  }

  const others = (comrades ?? []).filter((c) => !isCandidate(c) && !c.left_at).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section>
      <SectionHead title={`Candidates · ${visible.length}`} action={isOfficer ? (adding ? "Done" : "Add") : undefined} onAction={() => setAdding((v) => !v)} />
      <p className="small" style={{ marginTop: 0 }}>
        Three months to try things out. Give them jobs, keep in touch, decide together at the review.
      </p>
      {adding && (
        <select
          className="inp"
          value=""
          aria-label="Make someone a candidate"
          onChange={(e) => {
            const c = others.find((x) => x.id === e.target.value);
            if (c) void candidacy(c, { candidacy: "start" }, `${c.name.split(" ")[0]} is a candidate · review in 3 months`);
          }}
        >
          <option value="">Make someone a candidate (from today)…</option>
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <div className="stack8 mt8">
        {visible.length === 0 && <p className="nothing">No candidates right now.</p>}
        {visible
          .sort((a, b) => (a.candidate_until ?? "").localeCompare(b.candidate_until ?? ""))
          .map((c) => {
            const prog = candidacyProgress(c, today);
            const f = followerOf(c);
            const due = prog && prog.daysLeft <= 7;
            const reviewSoon = !!prog && prog.daysLeft <= 14;
            const pct = prog ? Math.round((prog.week / prog.total) * 100) : 0;
            const review = (
              <div className="row gap6 wrap" style={{ alignItems: "center" }}>
                <button type="button" className="btn btn-p btn-sm" onClick={() => candidacy(c, { candidacy: "member" }, `${c.name.split(" ")[0]} is a full member`)}>
                  Full member
                </button>
                <button type="button" className="btn btn-o btn-sm" onClick={() => candidacy(c, { candidacy: "extend", months: 1 }, "Extended a month")}>
                  Extend a month
                </button>
                <button
                  type="button"
                  className="link small muted"
                  onClick={() => {
                    if (window.confirm(`Mark ${c.name.split(" ")[0]} as having left?`)) void candidacy(c, { candidacy: "left" }, "Marked as left");
                  }}
                >
                  Left
                </button>
              </div>
            );
            return (
              <div key={c.id} className="ask stack6" style={due ? { borderColor: "var(--red)" } : undefined}>
                <div className="row between" style={{ alignItems: "baseline" }}>
                  <p className="t" style={{ margin: 0 }}>
                    {c.name}
                  </p>
                  <span className={"small" + (due ? " red" : "")}>{c.candidate_until ? `review ${fmtDay(`${c.candidate_until}T12:00:00Z`)}` : ""}</span>
                </div>
                {prog && (
                  <div title={`Week ${prog.week} of ${prog.total}`}>
                    <div style={{ height: 4, background: "var(--line)" }}>
                      <div style={{ height: 4, width: `${pct}%`, background: due ? "var(--red)" : "var(--ink)" }} />
                    </div>
                    <p className="small muted" style={{ margin: "4px 0 0" }}>
                      Week {prog.week} of {prog.total} · {f ? `followed up by ${f.follower_id ? name(f.follower_id) : "someone not on the app"}${f.with_id ? ` with ${name(f.with_id)}` : ""}` : ""}
                      {!f && <span className="red">nobody follows them up yet</span>}
                    </p>
                  </div>
                )}
                <div className="row gap6 wrap">
                  {record(c).map((r) => (
                    <span key={r.label} className="small" style={{ padding: "2px 8px", border: "1px solid var(--line)", color: r.weak ? "var(--muted)" : "var(--ink)" }}>
                      {r.label}
                    </span>
                  ))}
                </div>
                {giving === c.id ? (
                  <div className="stack6">
                    <div className="row gap6 wrap">
                      {FIRST_JOBS.map((j) => (
                        <button key={j} type="button" className="btn btn-o btn-sm" onClick={() => setJob(j)} aria-pressed={job === j}>
                          {j}
                        </button>
                      ))}
                    </div>
                    <form
                      className="row gap6"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void give(c);
                      }}
                    >
                      <input className="inp grow" value={job} onChange={(e) => setJob(e.target.value)} placeholder="Or write one" aria-label="Job" autoFocus />
                      <button type="submit" className="btn btn-p btn-sm" disabled={!job.trim()}>
                        Give
                      </button>
                      <button type="button" className="link small" onClick={() => setGiving(null)}>
                        Cancel
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="row gap6 wrap" style={{ alignItems: "center" }}>
                    <button type="button" className="btn btn-o btn-sm" onClick={() => (setGiving(c.id), setJob(""))}>
                      Give a job
                    </button>
                  </div>
                )}
                {isOfficer && reviewSoon && review}
                {isOfficer && (
                  <details>
                    <summary className="small muted" style={{ cursor: "pointer" }}>
                      {reviewSoon ? "Dates" : "Review & dates"}
                    </summary>
                    <div className="stack6 mt6">
                      {!reviewSoon && review}
                      <label className="small muted row gap6" style={{ alignItems: "center" }}>
                        Started
                        <input
                          type="date"
                          className="inp"
                          style={{ width: 150, height: 30, padding: "0 6px" }}
                          value={c.candidate_since ?? ""}
                          onChange={(e) => e.target.value && void candidacy(c, { candidacy: "since", since: e.target.value }, "Start date changed · review moves with it")}
                          aria-label="Candidacy started"
                        />
                      </label>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
}
