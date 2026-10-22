"use client";

import { ImportHint } from "@/components/v2/import-hint";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileUp } from "lucide-react";
import { post } from "@/lib/client";
import { revalidate } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { hasAnyRole } from "@/lib/permissions";
import type { ImportResult, PlanLine } from "@/lib/agenda-import-apply";
import { fmtDay, usePeople } from "@/components/v2/primitives";
import { useToast } from "@/components/v2/toast";

const CHANGE_LABEL: Record<PlanLine["change"], string> = { create: "New", update: "Update", same: "Same", skip: "Skipped" };
const KIND_LABEL: Record<PlanLine["kind"], string> = {
  meeting: "Meeting",
  political: "Political",
  organizational: "Organisational",
  paper: "Paper",
  programme: "Programme",
  "follow-up": "Follow-up",
};

/**
 * Bring the agenda doc in as it's already written. Paste it (or upload the
 * .txt/.pdf), check what will be created or updated, then import. Importing
 * the same doc again only fills in what changed.
 */
export default function ImportAgendaPage() {
  const actor = useActor();
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  // Answers for names the app hasn't seen: raw → full name or member account.
  const [hints, setHints] = useState<Record<string, { name: string; profile_id: string }>>({});
  const { profiles } = usePeople();
  const allowed = hasAnyRole(actor, "general_secretary", "organizer", "education_officer");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    setPlan(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/imports/agenda", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't read that file");
      setText(body.text);
      await check(body.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function check(source = text) {
    setBusy(true);
    setError("");
    try {
      setPlan(await post<ImportResult>("/api/imports/agenda", { text: source }));
    } catch (e) {
      setPlan(null);
      setError(e instanceof Error ? e.message : "Couldn't read that agenda");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const people = Object.entries(hints).map(([raw, h]) => ({ raw, name: h.name, profile_id: h.profile_id }));
      const result = await post<ImportResult>("/api/imports/agenda", { text, apply: true, people });
      const n = result.lines.filter((l) => l.change === "create" || l.change === "update").length;
      revalidate("/api/events", "/api/agenda", "/api/agenda-actions", "/api/inbox");
      toast(`Imported · ${n} change${n === 1 ? "" : "s"}`);
      router.push("/agenda");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className="v2 pg">
        <p className="nothing">Importing agendas is for organisers, the education officer and the secretary.</p>
      </div>
    );
  }

  const changes = plan?.lines.filter((l) => l.change === "create" || l.change === "update").length ?? 0;
  const groups = new Map<string, PlanLine[]>();
  for (const l of plan?.lines ?? []) {
    const key = l.kind === "follow-up" ? "follow" : (l.date ?? "undated");
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const order = [...groups.keys()].sort((a, b) => (a === "follow" ? 1 : b === "follow" ? -1 : a === "undated" ? 1 : b === "undated" ? -1 : a.localeCompare(b)));

  return (
    <div className="v2 pg">
      <div className="ph">
        <Link className="btn-ic" href="/agenda" aria-label="Back to agenda">
          <ArrowLeft size={18} strokeWidth={2.25} />
        </Link>
        <div className="grow min0">
          <h1 style={{ fontSize: 22 }}>Import agenda</h1>
          <p className="sub">Paste the agenda doc or upload it. Nothing is saved until you import.</p>
        </div>
      </div>

      <ImportHint />

      <div className="row gap8">
        <button type="button" className="btn btn-o btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          <FileUp size={16} strokeWidth={2.25} />
          Upload .txt or .pdf
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.pdf,text/plain,application/pdf"
          hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </div>

      <textarea
        className="inp"
        style={{ height: 220, padding: 10, fontSize: 13, lineHeight: 1.45, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPlan(null);
        }}
        placeholder={"Branch Agenda\n12th October 18:30 - 20:30 (meet 18:00)\nChair: KL\nMinutes: JB\nPolitical Discussion (60): …"}
        aria-label="Agenda text"
      />
      {error && <p className="small red" style={{ margin: 0 }}>{error}</p>}
      {!plan && (
        <button type="button" className="btn btn-p" disabled={busy || !text.trim()} onClick={() => check()}>
          Check
        </button>
      )}

      {plan && (
        <>
          {plan.warnings.length > 0 && (
            <div className="ask" style={{ borderColor: "var(--red)" }}>
              <span className="ask-k">Check these</span>
              {plan.warnings.map((w) => (
                <p key={w} className="small" style={{ margin: 0, color: "var(--ink)" }}>
                  {w}
                </p>
              ))}
            </div>
          )}
          {(plan.people ?? []).some((p) => p.status !== "member") && (
            <section>
              <h4 className="dayh">Who&apos;s who</h4>
              <p className="small" style={{ margin: "0 0 8px" }}>
                Names without an account are kept as written. Say who new ones are — their follow-ups wait for them and move to their inbox once they join.
              </p>
              <div className="matlist">
                {plan.people
                  .filter((p) => p.status !== "member")
                  .map((p) => {
                    const h = hints[p.raw] ?? { name: "", profile_id: "" };
                    const set = (next: Partial<typeof h>) => setHints((all) => ({ ...all, [p.raw]: { ...h, ...next } }));
                    return (
                      <div key={p.raw} className="mat-r" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                        <span className="grow min0">
                          <span className="t">{p.raw}</span>
                          <span className="small" style={{ display: "block" }}>
                            {p.status === "known" ? `${p.name} · no account yet` : "New name"}
                          </span>
                        </span>
                        {p.status === "new" && (
                          <span className="stack6" style={{ width: "100%" }}>
                            <input
                              className="inp"
                              placeholder="Full name (optional)"
                              value={h.name}
                              disabled={!!h.profile_id}
                              onChange={(e) => set({ name: e.target.value })}
                              aria-label={`Full name for ${p.raw}`}
                            />
                            <select className="inp" value={h.profile_id} onChange={(e) => set({ profile_id: e.target.value })} aria-label={`Is ${p.raw} a member?`}>
                              <option value="">No account yet</option>
                              {profiles.map((m) => (
                                <option key={m.id} value={m.id}>
                                  It&apos;s {m.name}
                                </option>
                              ))}
                            </select>
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          )}
          {order.map((key) => (
            <section key={key}>
              <h4 className="dayh">{key === "follow" ? "Follow-ups" : key === "undated" ? "Not scheduled" : fmtDay(`${key}T12:00:00Z`)}</h4>
              <div className="matlist">
                {groups.get(key)!.map((l, i) => (
                  <div key={i} className="mat-r" style={{ alignItems: "flex-start" }}>
                    <span className="grow min0">
                      <span className="kicker" style={{ display: "block", color: "var(--muted)" }}>
                        {KIND_LABEL[l.kind]}
                      </span>
                      <span className="t">{l.label}</span>
                      {l.detail && (
                        <span className="small" style={{ display: "block" }}>
                          {l.detail}
                        </span>
                      )}
                    </span>
                    <span className={"state" + (l.change === "create" ? " going" : l.change === "update" ? " maybe" : "")}>{CHANGE_LABEL[l.change]}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <div className="row gap8">
            <button type="button" className="btn btn-o grow" onClick={() => setPlan(null)} disabled={busy}>
              Edit text
            </button>
            <button type="button" className="btn btn-p grow" onClick={apply} disabled={busy || changes === 0}>
              {changes === 0 ? "Nothing new" : `Import ${changes} change${changes === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
