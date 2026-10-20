"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Copy, Send } from "lucide-react";
import { patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { dueState } from "@/lib/follow-through";
import { awayOn, doneSince, isOpenTask, lastBranchMeeting, nextMeetingGaps, OPEN_STALE_DAYS, ROTA_LABEL, rota, type RotaRole } from "@/lib/tasks";
import type { AgendaAction, AgendaItem, Comrade, Event, EventExtras, Material } from "@/lib/types";
import { waLink } from "@/lib/utils";
import { SectionHead, fmtDay, usePeople } from "@/components/v2/primitives";
import { useToast } from "@/components/v2/toast";
import { HolderPicker } from "@/components/v2/holder-picker";
import { useWorkload } from "@/components/v2/workload";
import { usePhones } from "@/components/v2/phones";

const dayIso = (d: string) => `${d}T12:00:00Z`;

/**
 * Spreading the work around. What's up for grabs (anyone can take it), your
 * own tasks with an easy way to hand one on, who's got room, who hasn't had
 * a go at chairing, and what everyone got done since the last branch.
 */
export default function TasksPage() {
  return (
    <Suspense>
      <Tasks />
    </Suspense>
  );
}

function Tasks() {
  const actor = useActor();
  const toast = useToast();
  const params = useSearchParams();
  const { name, profiles } = usePeople();
  const { load, hint, today, now, actions, followUps, events, availability } = useWorkload();
  const { data: items } = useData<AgendaItem[]>("/api/agenda");
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  const { data: extras } = useData<EventExtras>("/api/event-extras");
  const { data: materials } = useData<Material[]>("/api/materials");
  const [handing, setHanding] = useState<string | null>(params.get("hand"));
  const [asking, setAsking] = useState(false);
  const isOfficer = !!actor?.role.some((r) => r !== "member");

  const all = actions ?? [];
  const open = all.filter(isOpenTask).sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
  const mine = all.filter((a) => !a.done && a.owner_id === actor?.id).sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
  const meeting = useMemo(() => nextMeetingGaps(events ?? [], now), [events, now]);
  // Bring-list items and on-the-day roles nobody has taken, for events in the next week.
  const soon = new Map((events ?? []).filter((e) => !e.archived && e.status !== "off" && Date.parse(e.start_time) > now && Date.parse(e.start_time) - now < 7 * 86400_000).map((e) => [e.id, e]));
  const bringGaps = (extras?.bring ?? []).filter((b) => !b.claimed_by && soon.has(b.event_id));
  const roleGaps = (extras?.roles ?? []).filter((r) => !r.user_id && soon.has(r.event_id));
  const leadGaps = (items ?? []).filter((i) => i.section === "political" && !i.archived && !i.leadoff_name && i.meeting_date && i.meeting_date >= today).slice(0, 3);

  const refresh = () => revalidate("/api/agenda-actions", "/api/inbox");

  async function claim(a: AgendaAction) {
    try {
      await patch(`/api/agenda-actions/${a.id}`, { claim: true });
      toast("It's yours · thank you");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't take it");
    }
    refresh();
  }

  async function volunteer(e: Event, role: "chair" | "minutes") {
    try {
      await post(`/api/events/${e.id}/volunteer`, { role });
      toast(role === "chair" ? "You're chairing · thank you" : "You're taking minutes · thank you");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't put you down");
    }
    revalidate("/api/events");
  }

  async function lead(i: AgendaItem) {
    try {
      await post(`/api/agenda/${i.id}/lead`, {});
      toast("You're leading off · prep links are on the programme");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't put you down");
    }
    revalidate("/api/agenda");
  }

  const upForGrabs = open.length + (meeting?.gaps.length ?? 0) + leadGaps.length + bringGaps.length + roleGaps.length;

  async function bringIt(id: string) {
    try {
      await patch(`/api/bring/${id}`, { claim: true });
      toast("You're bringing it · you'll get a reminder the day before");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save");
    }
    revalidate("/api/event-extras", "/api/inbox", "/api/materials");
  }

  async function takeRole(id: string) {
    try {
      await patch(`/api/roles/${id}`, { claim: true });
      toast("It's yours · the lead can see it");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save");
    }
    revalidate("/api/event-extras");
  }

  return (
    <div className="v2 pg">
      <div className="ph">
        <div className="grow min0">
          <h1>Tasks</h1>
          <p className="sub">What needs doing, and who&apos;s got room.</p>
        </div>
        <button type="button" className="btn btn-p btn-sm" onClick={() => setAsking((v) => !v)}>
          Add a task
        </button>
      </div>

      {asking && <AddTask officer={isOfficer} hint={hint} onDone={() => setAsking(false)} />}

      <section>
        <SectionHead title="Up for grabs" />
        {upForGrabs === 0 && <p className="nothing">Nothing open. If you need a hand with something, ask the branch.</p>}
        <div className="stack6">
          {open.map((a) => {
            const days = Math.floor((now - Date.parse(a.open_since ?? a.created_at)) / 86400_000);
            return (
              <div key={a.id} className="li" style={{ flexWrap: "wrap" }}>
                <div className="grow min0">
                  <p className="t">{a.text}</p>
                  <p className="small">
                    {a.handed_from ? `From ${name(a.handed_from)}${a.hand_note ? `: “${a.hand_note}”` : ""}` : `Asked by ${name(a.created_by ?? "")}`}
                    {a.due_date ? ` · by ${fmtDay(dayIso(a.due_date))}` : ""}
                    {days >= OPEN_STALE_DAYS ? <span className="red"> · open {days} days</span> : null}
                  </p>
                </div>
                <button type="button" className="btn btn-p btn-sm" onClick={() => claim(a)}>
                  I&apos;ll do it
                </button>
              </div>
            );
          })}
          {meeting?.gaps.map((role) => (
            <div key={role} className="li" style={{ flexWrap: "wrap" }}>
              <div className="grow min0">
                <p className="t">{role === "chair" ? "Chair" : "Take minutes at"} branch, {fmtDay(meeting.event.start_time)}</p>
                <p className="small">{role === "chair" ? "Keep time, bring people in, sum up the actions." : "Note decisions and who's doing what. The actions go into people's inboxes."}</p>
              </div>
              <button type="button" className="btn btn-p btn-sm" onClick={() => volunteer(meeting.event, role)}>
                {role === "chair" ? "I'll chair" : "I'll do it"}
              </button>
            </div>
          ))}
          {bringGaps.map((b) => {
            const ev = soon.get(b.event_id)!;
            return (
              <div key={b.id} className="li" style={{ flexWrap: "wrap" }}>
                <div className="grow min0">
                  <p className="t">
                    Bring {(materials ?? []).find((m) => m.id === b.material_id)?.name ?? b.label ?? "an item"}
                    {b.qty ? ` (${b.qty})` : ""}
                  </p>
                  <p className="small">
                    <Link className="link" href={`/events/${ev.id}`}>
                      {ev.title.split(" — ")[0]}
                    </Link>{" "}
                    · {fmtDay(ev.start_time)}
                  </p>
                </div>
                <button type="button" className="btn btn-p btn-sm" onClick={() => bringIt(b.id)}>
                  I&apos;ll bring it
                </button>
              </div>
            );
          })}
          {roleGaps.map((r) => {
            const ev = soon.get(r.event_id)!;
            return (
              <div key={r.id} className="li" style={{ flexWrap: "wrap" }}>
                <div className="grow min0">
                  <p className="t">{r.role}</p>
                  <p className="small">
                    <Link className="link" href={`/events/${ev.id}`}>
                      {ev.title.split(" — ")[0]}
                    </Link>{" "}
                    · {fmtDay(ev.start_time)}
                  </p>
                </div>
                <button type="button" className="btn btn-p btn-sm" onClick={() => takeRole(r.id)}>
                  I&apos;ll do it
                </button>
              </div>
            );
          })}
          {leadGaps.map((i) => (
            <div key={i.id} className="li" style={{ flexWrap: "wrap" }}>
              <div className="grow min0">
                <p className="t">Lead off: {i.title}</p>
                <p className="small">{i.meeting_date ? fmtDay(dayIso(i.meeting_date)) : ""} · 15 minutes to open the discussion. Prep links are on the programme.</p>
              </div>
              <button type="button" className="btn btn-p btn-sm" onClick={() => lead(i)}>
                I&apos;ll lead
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="Yours" />
        {mine.length === 0 && <p className="nothing">Nothing on you right now. Said you&apos;d do something? Add a task so it doesn&apos;t slip.</p>}
        <div className="stack6">
          {mine.map((a) => {
            const state = dueState(a, today);
            const away = a.due_date && actor ? awayOn(availability ?? [], actor.id, a.due_date) : null;
            return handing === a.id ? (
              <HandOn key={a.id} action={a} hint={hint} onDone={() => setHanding(null)} />
            ) : (
              <div key={a.id} className="li" style={{ flexWrap: "wrap" }}>
                <div className="grow min0">
                  <p className="t">{a.text}</p>
                  <p className="small">
                    {a.due_date ? <span className={state === "overdue" ? "red" : ""}>{state === "overdue" ? "Was due" : "By"} {fmtDay(dayIso(a.due_date))}</span> : "No date"}
                    {away ? <span className="red"> · you&apos;re away then</span> : null}
                    {a.source ? ` · ${a.source}` : ""}
                    {a.handed_from && a.handed_from !== actor?.id ? ` · from ${name(a.handed_from)}${a.hand_note ? `: “${a.hand_note}”` : ""}` : ""}
                  </p>
                </div>
                <div className="row gap6">
                  <button
                    type="button"
                    className="btn btn-p btn-sm"
                    onClick={async () => {
                      await patch(`/api/agenda-actions/${a.id}`, { done: true }).catch(() => undefined);
                      toast("Done");
                      refresh();
                    }}
                  >
                    Done
                  </button>
                  <button type="button" className="btn btn-o btn-sm" onClick={() => setHanding(a.id)}>
                    Hand on
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <DoneSince actions={all} events={events ?? []} followUps={followUps ?? []} comrades={comrades ?? []} now={now} />

      {isOfficer && (
        // Who has room and who hasn't had a go: for officers picking someone, folded away otherwise.
        <details className="organise">
          <summary>Who&apos;s got room · who hasn&apos;t had a go</summary>
          <div className="stack8 mt8">
          <section>
          <SectionHead title="Who's carrying what" />
          <p className="small" style={{ marginTop: 0 }}>
            Open tasks, people they follow up, and events they lead in the next two weeks. Before giving someone another job, look here.
          </p>
          <div className="stack6">
            {[...profiles]
              .map((p) => ({ p, l: load.get(p.id) }))
              .filter(({ l }) => weight(l) > 0)
              .sort((a, b) => weight(b.l) - weight(a.l) || a.p.name.localeCompare(b.p.name))
              .map(({ p, l }) => (
                <div key={p.id} className="li">
                  <div className="grow min0">
                    <p className="t">{p.name}</p>
                    <p className="small">
                      {l?.tasks ?? 0} {l?.tasks === 1 ? "task" : "tasks"}{l?.overdue ? <span className="red"> ({l.overdue} overdue)</span> : null} · {l?.followUps ?? 0} {l?.followUps === 1 ? "person" : "people"} · leading {l?.leading ?? 0}
                      {l?.away ? <span className="red"> · {hint(p.id).split(" · ").find((x) => x.startsWith("away"))}</span> : null}
                    </p>
                  </div>
                  <LoadBar w={weight(l)} />
                </div>
              ))}
          </div>
            {profiles.some((p) => weight(load.get(p.id)) === 0) && (
              <p className="small mt6">
                Nothing on:{" "}
                {profiles
                  .filter((p) => weight(load.get(p.id)) === 0)
                  .map((p) => p.name.replace(/^Comrade\s+/i, "").split(" ")[0])
                  .join(", ")}
              </p>
            )}
          </section>
          <Rotation meeting={meeting?.event ?? null} items={items ?? []} />
          </div>
        </details>
      )}
    </div>
  );
}

const weight = (l?: { tasks: number; overdue: number; followUps: number; leading: number }) => (l ? l.tasks + l.overdue + l.leading * 2 + l.followUps * 0.5 : 0);

function LoadBar({ w }: { w: number }) {
  const pct = Math.min(100, Math.round((w / 10) * 100));
  return (
    <span aria-hidden style={{ width: 56, height: 6, borderRadius: 3, background: "var(--line, #e5e5e5)", overflow: "hidden", flex: "none" }}>
      <span style={{ display: "block", height: "100%", width: `${pct}%`, background: pct >= 70 ? "var(--red)" : "var(--ink, #111)" }} />
    </span>
  );
}

/**
 * A task for yourself, an open ask to the branch ("Can anyone…?"), or, for
 * officers, one given straight to someone, with their load beside each name.
 */
function AddTask({ officer, hint, onDone }: { officer: boolean; hint: (id: string) => string; onDone: () => void }) {
  const toast = useToast();
  const actor = useActor();
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [who, setWho] = useState<"me" | "branch" | "someone">("me");
  const [person, setPerson] = useState("");
  const ready = !!text.trim() && (who !== "someone" || !!person);
  return (
    <form
      className="ask stack6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        const to =
          who === "me"
            ? { owner_id: actor?.id }
            : who === "branch"
              ? { open: true, source: "Asked the branch" }
              : person.startsWith("c:")
                ? { owner_comrade_id: person.slice(2), source: `From ${actor?.name.split(" ")[0] ?? "an officer"}` }
                : { owner_id: person.slice(2), source: `From ${actor?.name.split(" ")[0] ?? "an officer"}` };
        try {
          await post("/api/agenda-actions", { text: text.trim(), due_date: due || null, ...to });
          revalidate("/api/agenda-actions", "/api/inbox");
          toast(who === "me" ? "Added · it's under Yours" : who === "branch" ? "Asked · it's in everyone's inbox until someone takes it" : "Given · it's in their inbox");
          onDone();
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't add it");
        }
      }}
    >
      <span className="ask-k">Add a task</span>
      <input className="inp" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Pick up the banner from Selly Oak" aria-label="What needs doing" autoFocus />
      <div className={officer ? "tabs3" : "tabs2"} role="tablist" aria-label="Who's doing it">
        {(["me", "branch", ...(officer ? (["someone"] as const) : [])] as const).map((w) => (
          <button key={w} type="button" role="tab" aria-selected={who === w} className={who === w ? "on" : ""} onClick={() => setWho(w)}>
            {w === "me" ? "Me" : w === "branch" ? "Anyone" : "Someone"}
          </button>
        ))}
      </div>
      {who === "someone" && <HolderPicker value={person} onChange={setPerson} empty="Who's doing it?" hint={(id) => (id === actor?.id ? "" : hint(id))} label="Give it to" />}
      <div className="row gap8">
        <input className="inp" type="date" style={{ width: 150 }} value={due} onChange={(e) => setDue(e.target.value)} aria-label="By when" />
        <button type="submit" className="btn btn-p btn-sm grow" disabled={!ready}>
          {who === "branch" ? "Ask" : "Add"}
        </button>
        <button type="button" className="btn btn-o btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
      <p className="small" style={{ margin: 0 }}>
        {who === "me"
          ? "It sits under Yours with a reminder if it has a date. Can't get to it later? Hand it on."
          : who === "branch"
            ? `Anyone can take it. If nobody has in ${OPEN_STALE_DAYS} days, the general secretary sees it.`
            : "It goes in their inbox. Check who's carrying what below before you pick."}
      </p>
    </form>
  );
}

/** Hand a task on: back to the branch, or to someone with room. A note helps whoever picks it up. */
function HandOn({ action, hint, onDone }: { action: AgendaAction; hint: (id: string) => string; onDone: () => void }) {
  const toast = useToast();
  const actor = useActor();
  const [to, setTo] = useState("branch");
  const [note, setNote] = useState("");
  return (
    <form
      className="ask stack6"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await patch(`/api/agenda-actions/${action.id}`, { hand_on: to || "branch", note });
          revalidate("/api/agenda-actions", "/api/inbox");
          toast(to === "branch" ? "Handed back · it's up for grabs" : "Handed on · it's in their inbox");
          onDone();
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't hand it on");
        }
      }}
    >
      <span className="ask-k">Hand on</span>
      <p className="t" style={{ margin: 0 }}>
        {action.text}
      </p>
      <p className="small" style={{ margin: 0 }}>
        Can&apos;t get to it? That&apos;s fine. Better now than when it&apos;s late.
      </p>
      <HolderPicker value={to === "branch" ? "" : to} onChange={(v) => setTo(v || "branch")} empty="Back to the branch (anyone can take it)" hint={(id) => (id === actor?.id ? "" : hint(id))} label="Hand it to" />
      <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where you got to, who to ask (optional)" aria-label="Note" />
      <div className="row gap8">
        <button type="submit" className="btn btn-p btn-sm grow">
          Hand on
        </button>
        <button type="button" className="btn btn-o btn-sm" onClick={onDone}>
          Keep it
        </button>
      </div>
    </form>
  );
}

/**
 * Who hasn't had a go: chairing, minutes and lead-offs, least recent first.
 * The point is to ask them (and help them do it), not to assign.
 */
function Rotation({ meeting, items }: { meeting: Event | null; items: AgendaItem[] }) {
  const toast = useToast();
  const { profiles } = usePeople();
  const { ofProfile } = usePhones();
  const { events, availability, now } = useWorkload();
  const [role, setRole] = useState<RotaRole>("chair");
  const day = meeting?.start_time.slice(0, 10);
  const list = rota(role, profiles, events ?? [], items, now)
    .filter((r) => !(day && awayOn(availability ?? [], r.id, day)))
    .filter((r) => !meeting || (r.id !== meeting.chair_id && r.id !== meeting.minutes_id))
    .slice(0, 4);
  const slotOpen = meeting && role !== "leadoff" && !(role === "chair" ? meeting.chair_id : meeting.minutes_id);
  const what = role === "chair" ? "chair" : role === "minutes" ? "take minutes at" : "lead off a discussion at";

  return (
    <section>
      <SectionHead title="Who hasn't had a go" />
      <div className="row gap6" role="tablist">
        {(Object.keys(ROTA_LABEL) as RotaRole[]).map((r) => (
          <button key={r} type="button" role="tab" aria-selected={role === r} className={"btn btn-sm " + (role === r ? "btn-p" : "btn-o")} onClick={() => setRole(r)}>
            {ROTA_LABEL[r]}
          </button>
        ))}
      </div>
      <p className="small">
        Least recent first. Ask them, and offer to go through it with them beforehand.
        {meeting && role !== "leadoff" ? ` Next branch: ${fmtDay(meeting.start_time)}${slotOpen ? "" : " (filled)"}.` : ""}
      </p>
      <div className="stack6">
        {list.map((r) => {
          const phone = ofProfile(r.id);
          const msg = `Hi ${r.name.split(" ")[0]}, would you ${what} ${role === "leadoff" ? "an upcoming branch meeting" : `branch on ${meeting ? fmtDay(meeting.start_time) : "the next meeting"}`}? Happy to go through it with you first.`;
          return (
            <div key={r.id} className="li" style={{ flexWrap: "wrap" }}>
              <div className="grow min0">
                <p className="t">{r.name}</p>
                <p className="small">{r.last ? `Last ${fmtDay(dayIso(r.last))} · ${r.times}×` : "Never yet"}</p>
              </div>
              <div className="row gap6">
                {phone ? (
                  <a className="btn btn-o btn-sm" href={waLink(phone, msg)} target="_blank" rel="noopener noreferrer">
                    <Send size={14} /> Ask
                  </a>
                ) : (
                  <button type="button" className="btn btn-o btn-sm" onClick={() => navigator.clipboard.writeText(msg).then(() => toast("Message copied"))}>
                    <Copy size={14} /> Ask
                  </button>
                )}
                {slotOpen && (
                  <button
                    type="button"
                    className="btn btn-o btn-sm"
                    onClick={async () => {
                      try {
                        await patch(`/api/events/${meeting.id}`, { [role === "chair" ? "chair_id" : "minutes_id"]: r.id });
                        toast(`${r.name.split(" ")[0]} is down to ${role === "chair" ? "chair" : "take minutes"}`);
                        revalidate("/api/events");
                      } catch (e) {
                        toast(e instanceof Error ? e.message : "Couldn't save");
                      }
                    }}
                  >
                    They said yes
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {role === "leadoff" && (
        <p className="small mt6">
          Topics without a lead-off are on the{" "}
          <Link className="link" href="/programme">
            programme
          </Link>
          .
        </p>
      )}
    </section>
  );
}

/** What got done since the last branch meeting — to read out, so the work is seen. */
function DoneSince({ actions, events, followUps, comrades, now }: { actions: AgendaAction[]; events: Event[]; followUps: Parameters<typeof doneSince>[2]["followUps"]; comrades: Comrade[]; now: number }) {
  const toast = useToast();
  const { profiles } = usePeople();
  const last = lastBranchMeeting(events, now);
  const since = last ? Date.parse(last.start_time) : now - 14 * 86400_000;
  const { data: progress } = useData<{ people: { owner_id: string; talked: number; came: number; joined: number; invited: number }[]; totals: Record<string, number> }>(
    `/api/contacts/progress?since=${new Date(since).toISOString().slice(0, 10)}`,
  );
  const rows = doneSince(since, now, { actions, events, followUps, profiles, comrades, progress: progress?.people ?? [] });
  const heading = last ? `Since branch on ${fmtDay(last.start_time)}` : "The last two weeks";
  const text = `Done ${heading.toLowerCase()}:\n` + rows.map((r) => `• ${r.name}: ${r.items.join("; ")}`).join("\n");
  return (
    <section>
      <SectionHead title="Done since last branch" action={rows.length ? "Copy" : undefined} onAction={() => navigator.clipboard.writeText(text).then(() => toast("Copied · paste it into the minutes or the chat"))} />
      <p className="small" style={{ marginTop: 0 }}>
        {heading}. Read it out at the meeting. It&apos;s easy to only mention what didn&apos;t happen.
      </p>
      {progress && progress.totals.met > 0 && (
        <p className="small">
          Branch contacts: {progress.totals.met} met · {progress.totals.talked} talked · {progress.totals.came} came to something · <b>{progress.totals.joined} joined</b>
        </p>
      )}
      {rows.length === 0 && <p className="nothing">Nothing ticked off yet.</p>}
      <div className="stack6">
        {rows.map((r) => (
          <div key={r.name} className="li">
            <div className="grow min0">
              <p className="t">{r.name}</p>
              <p className="small">{r.items.join(" · ")}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
