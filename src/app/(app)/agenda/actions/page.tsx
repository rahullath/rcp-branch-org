"use client";

import { ImportHint } from "@/components/v2/import-hint";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { isUpcoming, byStartAsc } from "@/lib/dates";
import type { Comrade, Event } from "@/lib/types";
import { fmtDay, usePeople } from "@/components/v2/primitives";
import { useToast } from "@/components/v2/toast";
import { useWorkload } from "@/components/v2/workload";

type Who = { raw: string; name: string; status: "member" | "known" | "new" | "all"; profile_id: string | null; comrade_id: string | null };
type Row = { key: number; text: string; due: string | null; line: string; who: Who[]; on: boolean };

/**
 * The actions that float around a BC or the chat and never happen — pasted
 * in, they become tasks with a person and a date, in that person's inbox.
 * "DP to send the article", "BN to buy spray by Sunday", "(JB)" at the end.
 */
export default function CaptureActionsPage() {
  const actor = useActor();
  const toast = useToast();
  const router = useRouter();
  const { profiles } = usePeople();
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  const { data: events } = useData<Event[]>("/api/events");
  const [now] = useState(() => Date.now());
  const [text, setText] = useState("");
  const [source, setSource] = useState(() => `BC ${fmtDay(new Date().toISOString()).split(" ").slice(1).join(" ")}`);
  const [eventId, setEventId] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isOfficer = !!actor?.role.some((r) => r !== "member");
  const upcoming = useMemo(() => (events ?? []).filter((e) => isUpcoming(e, now) && e.status !== "off").sort(byStartAsc).slice(0, 15), [events, now]);
  const noApp = (comrades ?? []).filter((c) => !c.profile_id);
  const { hint } = useWorkload();

  async function check() {
    setBusy(true);
    setError("");
    try {
      const res = await post<{ rows: Omit<Row, "on">[] }>("/api/agenda-actions/capture", { text });
      setRows(res.rows.map((r) => ({ ...r, who: r.who.filter((w) => w.status !== "all"), on: r.who.length > 0 })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!rows) return;
    setBusy(true);
    try {
      const body = rows
        .filter((r) => r.on && r.who.length > 0)
        .map((r) => ({
          text: r.text,
          due: r.due,
          owners: r.who.map((w) => (w.profile_id ? { profile_id: w.profile_id } : w.comrade_id ? { comrade_id: w.comrade_id } : { name: w.raw })),
        }));
      const res = await post<{ created: number }>("/api/agenda-actions/capture", { rows: body, source, event_id: eventId || null });
      revalidate("/api/agenda-actions", "/api/inbox", "/api/comrades");
      toast(`${res.created} action${res.created === 1 ? "" : "s"} saved · each is in its owner's inbox`);
      router.push("/agenda");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      setBusy(false);
    }
  }

  const setRow = (key: number, patch: Partial<Row>) => setRows((p) => (p ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const ready = (rows ?? []).filter((r) => r.on && r.who.length > 0).length;

  if (!isOfficer) {
    return (
      <div className="v2 pg">
        <p className="nothing">Recording actions in bulk is for officers. Ask the minutes taker.</p>
      </div>
    );
  }

  return (
    <div className="v2 pg">
      <div className="ph">
        <Link className="btn-ic" href="/agenda" aria-label="Back to agenda">
          <ArrowLeft size={18} strokeWidth={2.25} />
        </Link>
        <div className="grow min0">
          <h1 style={{ fontSize: 22 }}>Paste actions</h1>
          <p className="sub">From a BC, the minutes or the chat. Each becomes a task with a person and a date.</p>
        </div>
      </div>

      <ImportHint />

      {!rows && (
        <>
          <textarea
            className="inp"
            style={{ height: 200, padding: 10, fontSize: 13, lineHeight: 1.45, resize: "vertical" }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"1) DP to send article to JB on student work\n2) BN to buy spray for Sunday postering\nChris to message the organiser by Wednesday\nPlan the order for LB to collect from CC by Thursday (JB)"}
            aria-label="Actions"
          />
          {error && <p className="small red" style={{ margin: 0 }}>{error}</p>}
          <button type="button" className="btn btn-p" disabled={busy || !text.trim()} onClick={check}>
            Check
          </button>
        </>
      )}

      {rows && (
        <>
          <div className="row gap8">
            <input className="inp grow" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Where from — BC 7 Oct" aria-label="Where these came from" />
          </div>
          <select className="inp" value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Prep for an event">
            <option value="">Not for one event</option>
            {upcoming.map((e) => (
              <option key={e.id} value={e.id}>
                Prep for: {e.title} · {fmtDay(e.start_time)}
              </option>
            ))}
          </select>
          <div className="matlist">
            {rows.map((r) => (
              <div key={r.key} className="mat-r" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8, opacity: r.on ? 1 : 0.55 }}>
                <input type="checkbox" checked={r.on} onChange={(e) => setRow(r.key, { on: e.target.checked })} aria-label="Include" style={{ marginTop: 10 }} />
                <span className="grow min0 stack6">
                  <input className="inp" value={r.text} onChange={(e) => setRow(r.key, { text: e.target.value })} aria-label="Action" />
                  <span className="row gap8 wrap">
                    {r.who.map((w, i) => (
                      <span key={i} className={"whop" + (w.status === "member" ? "" : " maybe")}>
                        {w.status === "member" ? w.name.replace(/^Comrade\s+/i, "") : w.status === "known" ? `${w.name} · no app` : `New: ${w.raw}`}
                        <button type="button" aria-label={`Remove ${w.raw}`} onClick={() => setRow(r.key, { who: r.who.filter((_, j) => j !== i) })}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <select
                      className="inp"
                      style={{ width: "auto", minWidth: 110 }}
                      value=""
                      onChange={(e) => {
                        const [kind, id] = e.target.value.split(":");
                        if (!id) return;
                        const who: Who =
                          kind === "p"
                            ? { raw: id, name: profiles.find((p) => p.id === id)?.name ?? "", status: "member", profile_id: id, comrade_id: null }
                            : { raw: id, name: noApp.find((c) => c.id === id)?.name ?? "", status: "known", profile_id: null, comrade_id: id };
                        setRow(r.key, { who: [...r.who, who], on: true });
                      }}
                      aria-label="Add who"
                    >
                      <option value="">{r.who.length ? "+ someone" : "Who?"}</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={`p:${p.id}`}>
                          {p.name}
                          {hint(p.id) ? ` · ${hint(p.id)}` : ""}
                        </option>
                      ))}
                      {noApp.map((c) => (
                        <option key={c.id} value={`c:${c.id}`}>
                          {c.name} (no app)
                        </option>
                      ))}
                    </select>
                    <input
                      className="inp"
                      type="date"
                      style={{ width: 140 }}
                      value={r.due ?? ""}
                      onChange={(e) => setRow(r.key, { due: e.target.value || null })}
                      aria-label="By when"
                    />
                  </span>
                  {!r.due && r.on && <span className="small">No date yet — tasks without one get buried.</span>}
                </span>
              </div>
            ))}
          </div>
          {error && <p className="small red" style={{ margin: 0 }}>{error}</p>}
          <div className="row gap8">
            <button type="button" className="btn btn-o grow" onClick={() => setRows(null)} disabled={busy}>
              Edit text
            </button>
            <button type="button" className="btn btn-p grow" onClick={save} disabled={busy || ready === 0}>
              Save {ready} action{ready === 1 ? "" : "s"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
