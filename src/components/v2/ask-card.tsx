"use client";

import Link from "next/link";
import { useState } from "react";
import { patch, post } from "@/lib/client";
import { revalidate } from "@/lib/hooks";
import { ROLE_LABEL, type Ask } from "@/lib/types";
import { useRsvps } from "@/components/rsvp-buttons";
import { fmtDay, fmtTime, firstPart, Rsvp, usePeople } from "./primitives";
import { dueState, londonDay } from "@/lib/follow-through";
import { useToast } from "./toast";
import { useSheets } from "./sheets";
import { oneToOneLink, useInviteContact } from "./invite-people";
import { shareUrl } from "@/lib/share-url";
import { postedKey } from "@/lib/setup";
import { useActor } from "@/lib/actor-context";

/**
 * One inbox item, answerable in place. The same card shows on This Week
 * (top ask) and in the Inbox. `onDone` removes it optimistically; the
 * server-derived inbox agrees on the next refresh.
 */
export function AskCard({ ask, onDone }: { ask: Ask; onDone: (key: string) => void }) {
  const toast = useToast();
  const { name, nameIn } = usePeople();
  const { mine, respond } = useRsvps();
  const { openReport } = useSheets();
  const [now] = useState(() => Date.now());

  async function run(fn: () => Promise<unknown>, message?: string, urls: string[] = []) {
    onDone(ask.k);
    try {
      await fn();
      if (message) toast(message);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save that");
    }
    revalidate("/api/inbox", ...urls);
  }

  const notMe = () => run(() => post("/api/inbox/dismiss", { key: ask.k }));

  if (ask.kind === "rsvp") {
    const e = ask.event;
    return (
      <div className="ask">
        <Link className="ask-top" href={`/events/${e.id}`}>
          <span className="ask-k">Event · {fmtDay(e.start_time)}</span>
          <span className="t">{e.title}</span>
          <span className="small" style={{ display: "block" }}>
            {fmtTime(e.start_time)} · {e.location || "Place TBC"}
          </span>
        </Link>
        <Rsvp
          value={mine(e.id)?.status}
          onChange={(v) => {
            onDone(ask.k);
            void respond(e.id, v);
          }}
        />
      </div>
    );
  }

  if (ask.kind === "poll") {
    const p = ask.poll;
    const total = ask.votes.length;
    return (
      <div className="ask">
        <div>
          <span className="ask-k">
            Poll · {name(p.created_by)}
            {p.closes_at && ` · closes ${new Date(p.closes_at).toLocaleDateString("en-GB", { weekday: "short" })}`}
          </span>
          <p className="t">{p.question}</p>
        </div>
        <div className="stack6">
          {p.options.map((o) => {
            const n = ask.votes.filter((v) => v.option === o).length;
            return (
              <button
                key={o}
                type="button"
                className="pollopt"
                onClick={() => run(() => post(`/api/polls/${p.id}/vote`, { option: o }), "Voted · " + o, ["/api/polls"])}
              >
                <span className="pollbar" style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                <span className="pl">{o}</span>
                <span className="pc">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (ask.kind === "bring") {
    const m = ask.material;
    const label = m?.name ?? ask.item.label ?? "Item";
    const where = m
      ? m.status === "missing"
        ? "Missing"
        : m.holder_id
          ? "Now: with " + nameIn(m.holder_id)
          : "Now: " + (m.holder_label ?? "Branch cupboard")
      : "";
    return (
      <div className="ask">
        <div>
          <span className="ask-k">Bring list · {firstPart(ask.event.title, " — ")}</span>
          <p className="t">
            {label}
            {ask.item.qty ? ` (${ask.item.qty})` : ""}
          </p>
          {where && <p className="small">{where}</p>}
        </div>
        <div className="row gap8">
          <button
            type="button"
            className="btn btn-p btn-sm grow"
            onClick={() =>
              run(() => patch(`/api/bring/${ask.item.id}`, { claim: true }), "You're bringing " + label, ["/api/event-extras", "/api/materials", "/api/material-moves"])
            }
          >
            I&apos;ll bring it
          </button>
          <button type="button" className="btn btn-o btn-sm" onClick={notMe}>
            Not me
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "bring-reminder") {
    const label = ask.material?.name ?? ask.item.label ?? "Item";
    return (
      <div className="ask">
        <div>
          <span className="ask-k">You&apos;re bringing · {fmtDay(ask.event.start_time)}</span>
          <p className="t">
            {label}
            {ask.item.qty ? ` (${ask.item.qty})` : ""}
          </p>
          <p className="small">For {firstPart(ask.event.title, " — ")} at {fmtTime(ask.event.start_time)}. If you can&apos;t now, say so and it goes back on the list.</p>
        </div>
        <div className="row gap8">
          <button type="button" className="btn btn-p btn-sm grow" onClick={notMe}>
            Packed
          </button>
          <button
            type="button"
            className="btn btn-o btn-sm"
            onClick={() => run(() => patch(`/api/bring/${ask.item.id}`, { claim: false }), "Back on the list · the lead can see it", ["/api/event-extras"])}
          >
            Can&apos;t now
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "bring-gap") {
    return (
      <div className="ask" style={{ borderColor: "var(--red)" }}>
        <Link className="ask-top" href={`/events/${ask.event.id}`}>
          <span className="ask-k red">Nobody&apos;s bringing · {fmtDay(ask.event.start_time)}</span>
          <span className="t">{ask.items.map((i) => i.label).join(", ")}</span>
          <span className="small" style={{ display: "block" }}>
            For {firstPart(ask.event.title, " — ")}. Ask someone going, or bring it yourself.
          </span>
        </Link>
        <div className="row gap8">
          <Link className="btn btn-p btn-sm grow" href={`/events/${ask.event.id}`}>
            Open the event
          </Link>
          <button type="button" className="btn btn-o btn-sm" onClick={notMe}>
            Sorted
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "invite-check") {
    return <InviteCheck ask={ask} onDone={() => onDone(ask.k)} />;
  }

  if (ask.kind === "candidate-review") {
    const c = ask.person;
    const first = c.name.split(" ")[0];
    const decide = (candidacy: string, message: string) => run(() => patch(`/api/comrades/${c.id}`, { candidacy, months: 1 }), message, ["/api/comrades"]);
    return (
      <div className="ask">
        <div>
          <span className="ask-k">{ask.daysLeft < 0 ? `Candidacy review overdue · ${-ask.daysLeft} days` : `Candidacy review · ${ask.daysLeft === 0 ? "today" : `in ${ask.daysLeft} days`}`}</span>
          <p className="t">{c.name}</p>
          <p className="small">Candidate since {fmtDay(`${c.candidate_since}T12:00:00Z`)}. Talk it through with them, then decide. Their record is on Follow-ups.</p>
        </div>
        <div className="row gap6 wrap">
          <button type="button" className="btn btn-p btn-sm grow" onClick={() => decide("member", `${first} is a full member`)}>
            Full member
          </button>
          <button type="button" className="btn btn-o btn-sm" onClick={() => decide("extend", `Extended a month`)}>
            Extend a month
          </button>
          <button
            type="button"
            className="btn btn-o btn-sm"
            onClick={() => {
              if (window.confirm(`Mark ${first} as having left?`)) void decide("left", "Marked as left");
            }}
          >
            Left
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "set-week") {
    return (
      <div className="ask">
        <div>
          <span className="ask-k">Your usual week</span>
          <p className="t">When are you usually free?</p>
          <p className="small">Tap the mornings, afternoons and evenings that usually work. Sales get planned for when most people can make them.</p>
        </div>
        <div className="row gap8">
          <Link className="btn btn-p btn-sm grow" href="/availability">
            Set my week
          </Link>
          <button type="button" className="btn btn-o btn-sm" onClick={notMe}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "setup") {
    return <SetupCard ask={ask} onSkip={notMe} />;
  }

  if (ask.kind === "invite-contacts") {
    return <InviteContacts ask={ask} onSkip={notMe} />;
  }

  if (ask.kind === "read") {
    const r = ask.read;
    const markRead = () => run(() => patch(`/api/reads/${r.id}`, { read: true }), undefined, ["/api/reads"]);
    return (
      <div className="ask">
        <div>
          <span className="ask-k">{ask.event ? `Before ${firstPart(ask.event.title, " — ")} · ${fmtDay(ask.event.start_time)}` : `${name(r.shared_by ?? "")} shared`}</span>
          <p className="t">{r.title}</p>
          {r.note && <p className="small">“{r.note}”</p>}
          {ask.others && ask.event ? (
            <p className="small">
              Or any of{" "}
              <Link className="link" href={`/events/${ask.event.id}`}>
                {ask.others} other{ask.others === 1 ? "" : "s"}
              </Link>
              . One is enough.
            </p>
          ) : null}
        </div>
        <div className="row gap8">
          <a className="btn btn-p btn-sm grow" href={r.url} target="_blank" rel="noopener noreferrer" onClick={() => void markRead()}>
            Read / listen
          </a>
          <button type="button" className="btn btn-o btn-sm" onClick={notMe}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "pair") {
    return (
      <div className="ask">
        <div>
          <span className="ask-k">{ask.role === "lead-off" ? `Helping prep${ask.when ? ` · ${fmtDay(`${ask.when}T12:00:00Z`)}` : ""}` : "Going along"}</span>
          <p className="t">{ask.role === "lead-off" ? ask.what : `With ${name(ask.who ?? "")} to see ${ask.what}`}</p>
          <p className="small">
            {ask.role === "lead-off"
              ? "Go through the reading and the main points with them before the meeting."
              : "Show them how you'd do it; next time they lead and you give feedback."}
          </p>
        </div>
        <div className="row gap8">
          <Link className="btn btn-o btn-sm grow" href={ask.href}>
            Open
          </Link>
          <button type="button" className="btn btn-o btn-sm" onClick={notMe}>
            Got it
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "report") {
    return (
      <div className="ask">
        <div>
          <span className="ask-k">Report · {fmtDay(ask.event.start_time)}</span>
          <p className="t">{ask.event.event_type === "reading_group" ? `How did ${ask.event.title} go?` : `How did ${ask.event.title || "the paper sale"} go?`}</p>
          <p className="small">{ask.event.event_type === "reading_group" ? "Who came, what was discussed, what to take further." : "Copies sold, money taken, contacts, and how it went."}</p>
        </div>
        <button type="button" className="btn btn-p btn-sm" onClick={() => openReport(ask)}>
          Write it
        </button>
      </div>
    );
  }

  if (ask.kind === "action") {
    const a = ask.action;
    const state = dueState(a, londonDay(now));
    return (
      <div className="ask">
        <div>
          <span className={"ask-k" + (state === "overdue" ? " red" : "")}>
            {state === "overdue" ? "Overdue" : state === "today" ? "Due today" : "Your action"}
            {a.due_date && state !== "today" ? ` · ${state === "overdue" ? "was due" : "by"} ${fmtDay(`${a.due_date}T12:00:00Z`)}` : ""}
            {a.source ? ` · ${a.source}` : ""}
          </span>
          <p className="t">{a.text}</p>
          {(a.pushed ?? 0) > 0 && <p className="small">Pushed back {a.pushed}× — it&apos;ll come up at branch.</p>}
        </div>
        <div className="row gap8" style={{ alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-p btn-sm"
            onClick={() => run(() => patch(`/api/agenda-actions/${a.id}`, { done: true }), "Done · shows as done on the agenda", ["/api/agenda-actions"])}
          >
            Done
          </button>
          {/* The rarer answers as plain links, so a list of tasks isn't a wall of buttons. */}
          <button
            type="button"
            className="link small"
            onClick={() => run(() => patch(`/api/agenda-actions/${a.id}`, { push: true }), "Pushed a week · it'll ask again", ["/api/agenda-actions"])}
          >
            Push a week
          </button>
          <Link className="link small" href={`/tasks?hand=${a.id}`}>
            Hand on
          </Link>
        </div>
      </div>
    );
  }

  if (ask.kind === "open-task") {
    const a = ask.action;
    return (
      <div className="ask" style={ask.stale ? { borderColor: "var(--red)" } : undefined}>
        <div>
          <span className={"ask-k" + (ask.stale ? " red" : "")}>
            {ask.stale ? `Nobody's taken this · ${ask.days} days` : "Who can take this?"}
            {a.due_date ? ` · by ${fmtDay(`${a.due_date}T12:00:00Z`)}` : ""}
          </span>
          <p className="t">{a.text}</p>
          <p className="small">
            {a.handed_from ? `${name(a.handed_from)} handed it on${a.hand_note ? `: “${a.hand_note}”` : ""}` : `Asked by ${name(a.created_by ?? "")}`}
            {ask.stale ? " · ask someone directly?" : ""}
          </p>
        </div>
        <div className="row gap8">
          <button type="button" className="btn btn-p btn-sm grow" onClick={() => run(() => patch(`/api/agenda-actions/${a.id}`, { claim: true }), "It's yours · thank you", ["/api/agenda-actions"])}>
            I&apos;ll do it
          </button>
          <button type="button" className="btn btn-o btn-sm" onClick={notMe}>
            Not me
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "away-clash") {
    const a = ask.action;
    const after = new Date(`${ask.away.to}T12:00:00Z`);
    after.setUTCDate(after.getUTCDate() + 1);
    const afterDay = after.toISOString().slice(0, 10);
    return (
      <div className="ask">
        <div>
          <span className="ask-k">Due while you&apos;re away · {fmtDay(`${a.due_date}T12:00:00Z`)}</span>
          <p className="t">{a.text}</p>
          <p className="small">Move it to when you&apos;re back, or hand it to someone who&apos;s around.</p>
        </div>
        <div className="row gap8">
          <button type="button" className="btn btn-p btn-sm grow" onClick={() => run(() => patch(`/api/agenda-actions/${a.id}`, { due_date: afterDay }), `Moved to ${fmtDay(`${afterDay}T12:00:00Z`)}`, ["/api/agenda-actions"])}>
            Move to {fmtDay(`${afterDay}T12:00:00Z`)}
          </button>
          <Link className="btn btn-o btn-sm" href={`/tasks?hand=${a.id}`}>
            Hand on
          </Link>
        </div>
      </div>
    );
  }

  if (ask.kind === "decide") {
    const e = ask.event;
    return (
      <div className="ask" style={{ borderColor: "var(--red)" }}>
        <Link className="ask-top" href={`/events/${e.id}`}>
          <span className="ask-k red">Call it · deadline passed</span>
          <span className="t">{e.title}</span>
          <span className="small" style={{ display: "block" }}>
            {ask.going} of {e.target} going · {fmtDay(e.start_time)} {fmtTime(e.start_time)}
          </span>
        </Link>
        <div className="row gap8">
          <button
            type="button"
            className="btn btn-p btn-sm grow"
            onClick={() => run(() => patch(`/api/events/${e.id}`, { status: "off" }), "Called off · everyone going was told", ["/api/events"])}
          >
            Call it off
          </button>
          <button type="button" className="btn btn-o btn-sm" onClick={() => run(() => patch(`/api/events/${e.id}`, { status: "on" }), "It's on · everyone going was told", ["/api/events"])}>
            Keep it on
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "rg-invite") {
    const g = ask.group;
    return (
      <div className="ask">
        <div>
          <span className="ask-k">Reading group · {name(ask.invite.created_by)} invited you</span>
          <p className="t">{g.title}</p>
          <p className="small">{[g.schedule || g.cadence, g.location, g.current_chapter ? `reading ${g.current_chapter}` : null].filter(Boolean).join(" · ") || "Details on Education"}</p>
        </div>
        <div className="row gap8">
          <button
            type="button"
            className="btn btn-p btn-sm grow"
            onClick={() => run(() => patch(`/api/reading-group-invites/${ask.invite.id}`, { accept: true }), "You're in · " + g.title, ["/api/reading-groups", "/api/reading-group-members"])}
          >
            Join
          </button>
          <button type="button" className="btn btn-o btn-sm" onClick={() => run(() => patch(`/api/reading-group-invites/${ask.invite.id}`, { accept: false }), "Said not now")}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "role-request") {
    const r = ask.request;
    return (
      <div className="ask">
        <div>
          <span className="ask-k">Confirm a role</span>
          <p className="t">
            {name(r.user_id)} says they&apos;re {ROLE_LABEL[r.role] ?? r.role}
          </p>
          {r.note && <p className="small">“{r.note}”</p>}
        </div>
        <div className="row gap8">
          <button type="button" className="btn btn-p btn-sm grow" onClick={() => run(() => patch(`/api/role-requests/${r.id}`, { approve: true }), "Confirmed · they have it now", ["/api/profiles"])}>
            Confirm
          </button>
          <button type="button" className="btn btn-o btn-sm" onClick={() => run(() => patch(`/api/role-requests/${r.id}`, { approve: false }), "Said no")}>
            Not right
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "import-request") {
    const r = ask.request;
    return (
      <div className="ask">
        <div>
          <span className="ask-k">Import to check</span>
          <p className="t">
            {name(r.user_id ?? "")} sent {ask.rows} {ask.rows === 1 ? "thing" : "things"} to import
          </p>
          {r.note && <p className="small">“{r.note}”</p>}
        </div>
        <Link className="btn btn-p btn-sm" href={`/imports?id=${r.id}`}>
          Review
        </Link>
      </div>
    );
  }

  if (ask.kind === "quiet") {
    return (
      <div className="ask">
        <div>
          <span className="ask-k">You follow them up</span>
          <p className="t">{ask.person.name}</p>
          <p className="small">{ask.days == null ? "No catch-up logged yet." : `Last spoke ${ask.days} days ago.`} A message or a coffee — then tap.</p>
        </div>
        <div className="row gap8">
          <button
            type="button"
            className="btn btn-p btn-sm grow"
            onClick={() => run(() => patch(`/api/follow-ups/${ask.followUp.id}`, { touch: true }), `Logged · ${ask.person.name.split(/\s+/)[0]}`, ["/api/follow-ups"])}
          >
            Spoke to them
          </button>
          <Link className="btn btn-o btn-sm" href="/follow-ups">
            Hand over
          </Link>
        </div>
      </div>
    );
  }

  if (ask.kind === "rg-request") {
    const g = ask.group;
    return (
      <div className="ask">
        <div>
          <span className="ask-k">Reading group · {g.title}</span>
          <p className="t">{name(ask.invite.user_id)} wants to join</p>
          {ask.invite.note && <p className="small">“{ask.invite.note}”</p>}
        </div>
        <div className="row gap8">
          <button
            type="button"
            className="btn btn-p btn-sm grow"
            onClick={() => run(() => patch(`/api/reading-group-invites/${ask.invite.id}`, { accept: true }), "Added to " + g.title, ["/api/reading-groups", "/api/reading-group-members"])}
          >
            Add them
          </button>
          <button type="button" className="btn btn-o btn-sm" onClick={() => run(() => patch(`/api/reading-group-invites/${ask.invite.id}`, { accept: false }), "Not this time")}>
            Not this one
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "material" && ask.stale) {
    const m = ask.material;
    return (
      <div className="ask">
        <div>
          <span className="ask-k">Materials · with you since {fmtDay(ask.lastMove.created_at)}</span>
          <p className="t">Still got {theName(m.name)}?</p>
        </div>
        <div className="row gap8">
          <button type="button" className="btn btn-o btn-sm grow" onClick={() => run(() => post("/api/inbox/dismiss", { key: ask.k }), "Thanks · nobody will chase it")}>
            Yes, still with me
          </button>
          <button
            type="button"
            className="btn btn-o btn-sm"
            onClick={() => run(() => post(`/api/materials/${m.id}/move`, { kind: "return" }), "Back in the cupboard", ["/api/materials", "/api/material-moves"])}
          >
            Returned it
          </button>
        </div>
      </div>
    );
  }

  if (ask.kind === "material") {
    const m = ask.material;
    return (
      <div className="ask">
        <div>
          <span className="ask-k">Materials · missing</span>
          <p className="t">Still got {theName(m.name)}?</p>
          <p className="small">
            Last logged: you {ask.lastMove.action}, {fmtDay(ask.lastMove.created_at)}.
          </p>
        </div>
        <div className="row gap8">
          <button
            type="button"
            className="btn btn-p btn-sm grow"
            onClick={() =>
              run(() => post(`/api/materials/${m.id}/move`, { kind: "found" }), "Updated · everyone can see it's with you", ["/api/materials", "/api/material-moves"])
            }
          >
            I have them
          </button>
          <button type="button" className="btn btn-o btn-sm" onClick={notMe}>
            Not me
          </button>
        </div>
      </div>
    );
  }

  return null;
}

/** "The Communist #55" → "The Communist #55"; "Flags ×4" → "the flags ×4". */
function theName(name: string) {
  return /^the\s/i.test(name) ? name : `the ${name.toLowerCase()}`;
}

/** After an event: who you invited came, or didn't. "Came" moves them on toward joining. */
function InviteCheck({ ask, onDone }: { ask: Extract<Ask, { kind: "invite-check" }>; onDone: () => void }) {
  const toast = useToast();
  const [left, setLeft] = useState(ask.invites);
  async function mark(id: string, status: "came" | "missed") {
    const next = left.filter((i) => i.id !== id);
    setLeft(next);
    try {
      await patch(`/api/event-invites/${id}`, { status });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    }
    if (next.length === 0) {
      onDone();
      revalidate("/api/inbox", "/api/event-invites", "/api/contacts");
    }
  }
  return (
    <div className="ask">
      <div>
        <span className="ask-k">Did they come? · {firstPart(ask.event.title, " — ")}</span>
        <p className="small">You invited them. Marking who came keeps your contacts list honest.</p>
      </div>
      <div className="stack6">
        {left.map((i) => (
          <div key={i.id} className="row gap6">
            <span className="grow t">{i.name}</span>
            <button type="button" className="btn btn-p btn-sm" onClick={() => mark(i.id, "came")}>
              Came
            </button>
            <button type="button" className="btn btn-o btn-sm" onClick={() => mark(i.id, "missed")}>
              Didn&apos;t
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Bring someone: your contacts nobody's invited to the next meeting yet. One
 * tap opens WhatsApp with the message and the link that explains the
 * meeting; that's the whole job. Or suggest a coffee instead.
 */
function InviteContacts({ ask, onSkip }: { ask: Extract<Ask, { kind: "invite-contacts" }>; onSkip: () => void }) {
  const actor = useActor();
  const invite = useInviteContact();
  const [sent, setSent] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const me = (actor?.name ?? "").replace(/^Comrade\s+/i, "").split(" ")[0];
  const shown = more ? ask.people : ask.people.slice(0, 3);
  return (
    <div className="ask">
      <div>
        <span className="ask-k">
          Bring someone · {fmtDay(ask.event.start_time)}
        </span>
        <p className="t">{firstPart(ask.event.title, " — ")}</p>
        <p className="small">One message each. The link explains the meeting.</p>
      </div>
      <div className="stack6">
        {shown.map((c) => (
          <div key={c.id} className="row gap8" style={{ alignItems: "center" }}>
            <span className="grow min0 trunc">{c.name}</span>
            {sent.includes(c.id) ? (
              <span className="small">Invited</span>
            ) : (
              <>
                <a className="small muted" href={oneToOneLink(c, me)} target="_blank" rel="noopener noreferrer" title="Suggest a coffee instead">
                  coffee?
                </a>
                <button
                  type="button"
                  className="btn btn-p btn-sm"
                  onClick={async () => {
                    if (await invite(ask.event, c)) setSent((p) => [...p, c.id]);
                  }}
                >
                  Invite
                </button>
              </>
            )}
          </div>
        ))}
        {ask.people.length > shown.length && (
          <button type="button" className="link small" style={{ alignSelf: "flex-start" }} onClick={() => setMore(true)}>
            {ask.people.length - shown.length} more
          </button>
        )}
      </div>
      <div className="row gap8">
        <button type="button" className="btn btn-o btn-sm" onClick={onSkip}>
          {sent.length ? "Done" : "Not this time"}
        </button>
      </div>
    </div>
  );
}

/**
 * Before an event you lead: what's set up (read off the app, nothing to
 * tick), and the one thing the app can't do for you: post it in the branch
 * chat. The message carries the link (graphic as its preview, and a button
 * for comrades not on the app yet); pressing it is the record that it's done.
 */
function SetupCard({ ask, onSkip }: { ask: Extract<Ask, { kind: "setup" }>; onSkip: () => void }) {
  const toast = useToast();
  const [posted, setPosted] = useState(ask.posted);
  const e = ask.event;
  const left = ask.checks.filter((c) => !c.ok).length;

  async function postIt() {
    const win = window.open("", "_blank");
    try {
      const [url, branch] = await Promise.all([shareUrl(e.id), fetch("/api/branches").then((r) => r.json()).catch(() => null)]);
      const code = (branch?.data ?? branch)?.join_code as string | undefined;
      const link = code ? `${url}?c=${code}` : url;
      const text = `${firstPart(e.title, " — ")}\n${fmtDay(e.start_time)}, ${fmtTime(e.start_time)}${e.location ? ` · ${firstPart(e.location, ",")}` : ""}\n\nSay if you're coming, and bring someone: ${link}`;
      await navigator.clipboard.writeText(text).catch(() => undefined);
      if (win) win.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
      setPosted(true);
      await post("/api/inbox/dismiss", { key: postedKey(e.id) });
      revalidate("/api/inbox");
      toast("Copied · pick the branch chat");
    } catch (err) {
      win?.close();
      toast(err instanceof Error ? err.message : "Couldn't make the message");
    }
  }

  return (
    <div className="ask">
      <div>
        <span className="ask-k">
          You&apos;re leading · {fmtDay(e.start_time)}
        </span>
        <p className="t">{firstPart(e.title, " — ")}</p>
      </div>
      <div className="stack6">
        {ask.checks.map((c) => (
          <p key={c.label} className="small" style={{ margin: 0 }}>
            <span className={c.ok ? "" : "red"}>{c.ok ? "✓" : "○"}</span> {c.label}
          </p>
        ))}
        <p className="small" style={{ margin: 0 }}>
          <span className={posted ? "" : "red"}>{posted ? "✓" : "○"}</span> Posted in the branch chat
        </p>
      </div>
      <div className="row gap8 wrap">
        {!posted && (
          <button type="button" className="btn btn-p btn-sm grow" onClick={postIt}>
            Copy for the branch chat
          </button>
        )}
        {left > 0 && (
          <Link className="btn btn-o btn-sm" href={`/events/${e.id}`}>
            Sort the rest
          </Link>
        )}
        <button type="button" className="link small" onClick={onSkip}>
          All fine
        </button>
      </div>
    </div>
  );
}
