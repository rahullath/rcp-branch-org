"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { patch } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { DAY_SLOTS, WEEKDAYS, WEEKDAY_LABELS, type AgendaAction, type Availability, type AwayRange } from "@/lib/types";
import { dayAfter } from "@/lib/tasks";
import { Spinner } from "@/components/ui";
import { fmtDay } from "@/components/v2/primitives";
import { useToast } from "@/components/v2/toast";

const ACTIVITY = "general";

/**
 * Your usual week, set once. Polls suggest the slots most people have free;
 * the branch view shows counts only, no names, and is never used to assign
 * anyone. "When you can't" (a day, part of a day, or a stretch) hands back
 * anything you'd signed up for then and tells whoever runs it.
 */
export default function AvailabilityPage() {
  const actor = useActor();
  const toast = useToast();
  const { data: rows, loading, setData } = useData<Availability[]>(`/api/availability?activity=${ACTIVITY}`);
  const [view, setView] = useState<"me" | "br">("me");
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [span, setSpan] = useState<"day" | "part" | "days">("day");
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("17:00");
  const [why, setWhy] = useState("");

  const { data: actions } = useData<AgendaAction[]>("/api/agenda-actions");
  const mine = (rows ?? []).find((r) => r.user_id === actor?.id);
  const slots = mine?.slots ?? [];
  const away = mine?.away ?? [];
  // Your tasks due on days you've said you're away: move them or hand them on now.
  const clashes = (actions ?? []).flatMap((a) => {
    if (a.done || a.owner_id !== actor?.id || !a.due_date) return [];
    const r = away.find((x) => x.from <= a.due_date! && a.due_date! <= x.to);
    return r ? [{ a, back: dayAfter(r.to) }] : [];
  });
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows ?? []) for (const s of r.slots ?? []) c.set(s, (c.get(s) ?? 0) + 1);
    return c;
  }, [rows]);
  const max = Math.max(1, ...counts.values());
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);

  async function save(next: { slots?: string[]; away?: AwayRange[] }, adding = false) {
    if (!actor) return;
    setData((p) => {
      const list = p ?? [];
      const row = list.find((r) => r.user_id === actor.id);
      if (row) return list.map((r) => (r.user_id === actor.id ? { ...r, ...next } : r));
      return [...list, { id: "tmp", user_id: actor.id, activity: ACTIVITY, days: [], slots: [], away: [], updated_at: new Date().toISOString(), ...next }];
    });
    try {
      const res = await patch<{ handedBack?: string[] }>("/api/availability", { activity: ACTIVITY, ...next });
      if (adding) {
        const back = res.handedBack ?? [];
        toast(back.length ? `Saved · stepped you out of ${back.join(", ")} and told whoever runs it` : "Saved");
        if (back.length) revalidate("/api/events", "/api/rsvps", "/api/event-extras", "/api/inbox");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
      revalidate(`/api/availability?activity=${ACTIVITY}`);
    }
  }

  const toggle = (key: string) => save({ slots: slots.includes(key) ? slots.filter((s) => s !== key) : [...slots, key] });

  if (loading && !rows) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const slotLabel = (key: string) => {
    const [d, s] = key.split(":");
    return `${WEEKDAY_LABELS[d as keyof typeof WEEKDAY_LABELS]} ${DAY_SLOTS.find((x) => x.value === s)?.label.toLowerCase()}`;
  };

  return (
    <div className="v2 pg">
      <div className="ph">
        <div>
          <h1>Availability</h1>
          <p className="sub">When you&apos;re usually free.</p>
        </div>
      </div>
      <div className="tabs2">
        <button type="button" className={view === "me" ? "on" : ""} onClick={() => setView("me")}>
          Mine
        </button>
        <button type="button" className={view === "br" ? "on" : ""} onClick={() => setView("br")}>
          Branch
        </button>
      </div>
      <div className="avail" role="grid" aria-label={view === "me" ? "Your usual week" : "How many comrades are usually free"}>
        <span />
        {DAY_SLOTS.map((s) => (
          <span key={s.value} className="avh">
            {s.label}
          </span>
        ))}
        {WEEKDAYS.map((d) => (
          <Fragment key={d}>
            <span className="avd">{WEEKDAY_LABELS[d]}</span>
            {DAY_SLOTS.map((s) => {
              const key = `${d}:${s.value}`;
              if (view === "br") {
                const n = counts.get(key) ?? 0;
                const pct = Math.round((n / max) * 88);
                return (
                  <span key={key} className="avc br" style={{ background: `color-mix(in oklch, var(--red) ${pct}%, #fff)`, color: pct > 50 ? "#fff" : "var(--ink)" }}>
                    {n}
                  </span>
                );
              }
              const on = slots.includes(key);
              return (
                <button key={key} type="button" className={"avc" + (on ? " on" : "")} aria-pressed={on} aria-label={`${WEEKDAY_LABELS[d]} ${s.label}`} onClick={() => toggle(key)}>
                  {on && <Check size={16} strokeWidth={2.5} />}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      <p className="small">
        {view === "me"
          ? "Tap to toggle. When someone starts a date poll, the app suggests the slots most people have free."
          : best.length
            ? `How many comrades are usually free. ${best.map(([k]) => slotLabel(k)).join(" and ")} are the strongest.`
            : "Nobody has set their week yet."}
      </p>

      <div className="li" style={{ alignItems: "flex-start", flexDirection: "column" }}>
        <div className="row w100">
          <div className="grow">
            <p className="t">When you can&apos;t</p>
            <p className="small">
              {away.length
                ? "Anything you'd signed up for then is handed back, and whoever runs it is told."
                : "A day, part of a day, or a stretch (exams, a trip). Anything you'd signed up for then is handed back and the lead is told."}
            </p>
          </div>
          {!adding && (
            <button type="button" className="btn btn-o btn-sm" onClick={() => setAdding(true)}>
              Add
            </button>
          )}
        </div>
        {away.map((a, i) => (
          <div key={i} className="row gap8 w100">
            <span className="grow min0">
              <span className="t" style={{ display: "block" }}>
                {fmtDay(a.from)}
                {a.to !== a.from ? ` – ${fmtDay(a.to)}` : ""}
                {a.start && a.end ? ` · ${a.start}–${a.end}` : a.to === a.from ? " · all day" : ""}
              </span>
              {a.note && <span className="small">{a.note}</span>}
            </span>
            <button type="button" className="btn-ic sm" aria-label="Remove away dates" onClick={() => save({ away: away.filter((_, j) => j !== i) })}>
              <X size={16} />
            </button>
          </div>
        ))}
        {clashes.length > 0 && (
          <div className="stack6 w100">
            <p className="small red" style={{ margin: 0 }}>
              Due while you&apos;re away:
            </p>
            {clashes.map(({ a, back }) => (
              <div key={a.id} className="row gap6 w100 wrap">
                <span className="grow min0 small">
                  {a.text} · {fmtDay(a.due_date!)}
                </span>
                <button
                  type="button"
                  className="btn btn-o btn-sm"
                  onClick={async () => {
                    await patch(`/api/agenda-actions/${a.id}`, { due_date: back }).catch(() => undefined);
                    revalidate("/api/agenda-actions", "/api/inbox");
                    toast(`Moved to ${fmtDay(back)}`);
                  }}
                >
                  Move to {fmtDay(back)}
                </button>
                <Link className="btn btn-o btn-sm" href={`/tasks?hand=${a.id}`}>
                  Hand on
                </Link>
              </div>
            ))}
          </div>
        )}
        {adding && (
          <form
            className="stack6 w100"
            onSubmit={(e) => {
              e.preventDefault();
              const last = span === "days" ? to : from;
              if (!from || !last || last < from) return toast(span === "days" ? "Pick a first and last day" : "Pick the day");
              if (span === "part" && !(start && end && end > start)) return toast("The end time needs to be after the start");
              const range: AwayRange = { from, to: last, ...(span === "part" ? { start, end } : {}), ...(why.trim() ? { note: why.trim().slice(0, 140) } : {}) };
              void save({ away: [...away, range] }, true);
              setAdding(false);
              setFrom("");
              setTo("");
              setWhy("");
            }}
          >
            <div className="tabs3">
              {(
                [
                  ["day", "One day"],
                  ["part", "Part of a day"],
                  ["days", "Several days"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" className={span === v ? "on" : ""} onClick={() => setSpan(v)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="row gap8 wrap">
              <input className="inp grow" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={span === "days" ? "First day" : "Day"} />
              {span === "days" && <input className="inp grow" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="Last day" />}
              {span === "part" && (
                <>
                  <input className="inp" style={{ width: 110 }} type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="From" />
                  <input className="inp" style={{ width: 110 }} type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Until" />
                </>
              )}
            </div>
            <input className="inp" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why (optional), e.g. shift came up, feeling ill" aria-label="Reason" />
            <div className="row gap8">
              <button type="submit" className="btn btn-p btn-sm grow">
                Save
              </button>
              <button type="button" className="btn btn-o btn-sm" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
