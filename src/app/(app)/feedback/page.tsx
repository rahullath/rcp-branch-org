"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { useData } from "@/lib/hooks";
import { del, patch, post } from "@/lib/client";
import { useActor } from "@/lib/actor-context";
import type { Feedback } from "@/lib/types";
import { fmtDay, usePeople } from "@/components/v2/primitives";
import { useToast } from "@/components/v2/toast";

const KINDS: { value: Feedback["kind"]; label: string; hint: string }[] = [
  { value: "bug", label: "Broken", hint: "What did you tap, what happened, what did you expect?" },
  { value: "confusing", label: "Confusing", hint: "What were you trying to do?" },
  { value: "idea", label: "Idea", hint: "What would make this easier for the branch?" },
  { value: "works", label: "Works well", hint: "What's actually useful? (So it doesn't get broken.)" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<Feedback["kind"], string>;

/**
 * While everyone tries the app: throw a note at it. Everyone sees the list,
 * so the same bug isn't sent five times — add a "me too" in a new note if it
 * matters. The secretary marks things fixed.
 */
export default function FeedbackPage() {
  const params = useSearchParams();
  const from = params.get("from");
  const actor = useActor();
  const toast = useToast();
  const { name } = usePeople();
  const { data, setData } = useData<Feedback[]>("/api/feedback");
  const [kind, setKind] = useState<Feedback["kind"]>("bug");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<"open" | "done" | "all">("open");
  const [replying, setReplying] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  // Triage is the app's developer's job (admin), not the branch secretary's.
  const isAdmin = !!actor?.isAdmin;

  const rows = (data ?? []).filter((f) => (show === "all" ? true : show === "open" ? f.status === "open" : f.status !== "open"));
  const openCount = (data ?? []).filter((f) => f.status === "open").length;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const created = await post<Feedback>("/api/feedback", { kind, text, page: from });
      setData((p) => [created, ...(p ?? [])]);
      setText("");
      toast("Thanks — it's on the list");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  }

  async function update(f: Feedback, body: Partial<Feedback>) {
    try {
      const updated = await patch<Feedback>(`/api/feedback/${f.id}`, body);
      setData((p) => (p ?? []).map((x) => (x.id === f.id ? updated : x)));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save");
    }
  }

  return (
    <div className="v2 pg">
      <div className="ph">
        <div>
          <h1>Feedback</h1>
          <p className="sub">We&apos;re all trying it out. Anything broken, confusing or good — throw it here.</p>
        </div>
      </div>

      <form className="ask stack6" onSubmit={send}>
        <span className="tabs4">
          {KINDS.map((k) => (
            <button key={k.value} type="button" className={kind === k.value ? "on" : ""} onClick={() => setKind(k.value)}>
              {k.label}
            </button>
          ))}
        </span>
        <textarea
          className="inp"
          style={{ height: 110, padding: 10, resize: "vertical" }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={KINDS.find((k) => k.value === kind)?.hint}
          aria-label="Your note"
        />
        {from && <p className="small" style={{ margin: 0 }}>About: {from}</p>}
        <button type="submit" className="btn btn-p" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>

      <div className="chips">
        {(
          [
            ["open", `Open · ${openCount}`],
            ["done", "Sorted"],
            ["all", "All"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className={"chip" + (show === k ? " on" : "")} onClick={() => setShow(k)}>
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 && <p className="nothing">{show === "open" ? "Nothing open." : "Nothing here yet."}</p>}
      <div className="stack6">
        {rows.map((f) => {
          const mine = f.user_id === actor?.id;
          return (
            <div key={f.id} className="li" style={{ alignItems: "flex-start", opacity: f.status === "open" ? 1 : 0.65 }}>
              <div className="grow min0">
                <p className={"lc-k" + (f.kind === "works" ? "" : "")}>
                  {KIND_LABEL[f.kind]}
                  {f.status === "fixed" ? " · fixed" : f.status === "wontfix" ? " · not doing" : ""}
                </p>
                <p className="t" style={{ whiteSpace: "pre-wrap", fontWeight: 500 }}>
                  {f.text}
                </p>
                <p className="small">
                  {name(f.user_id)} · {fmtDay(f.created_at)}
                  {f.page ? ` · ${f.page}` : ""}
                  {f.device ? ` · ${f.device}` : ""}
                </p>
                {f.reply && <p className="small" style={{ borderLeft: "3px solid var(--red)", paddingLeft: 8 }}>{f.reply}</p>}
                {replying === f.id && (
                  <div className="row gap6 mt6">
                    <input className="inp grow" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply" aria-label="Reply" autoFocus />
                    <button
                      type="button"
                      className="btn btn-p btn-sm"
                      onClick={() => {
                        void update(f, { reply });
                        setReplying(null);
                      }}
                    >
                      Save
                    </button>
                  </div>
                )}
                {(isAdmin || mine) && (
                  <div className="row gap8 wrap mt6">
                    {f.status === "open" ? (
                      <>
                        <button type="button" className="btn btn-o btn-sm" onClick={() => update(f, { status: "fixed" })}>
                          <Check size={14} /> Fixed
                        </button>
                        {isAdmin && (
                          <button type="button" className="link small" onClick={() => update(f, { status: "wontfix" })}>
                            Not doing
                          </button>
                        )}
                      </>
                    ) : (
                      <button type="button" className="link small" onClick={() => update(f, { status: "open" })}>
                        Reopen
                      </button>
                    )}
                    {isAdmin && (
                      <button type="button" className="link small" onClick={() => (setReplying(f.id), setReply(f.reply ?? ""))}>
                        Reply
                      </button>
                    )}
                  </div>
                )}
              </div>
              {(mine || isAdmin) && (
                <button
                  type="button"
                  className="btn-ic sm"
                  aria-label="Delete"
                  onClick={async () => {
                    if (!window.confirm("Delete this note?")) return;
                    await del(`/api/feedback/${f.id}`);
                    setData((p) => (p ?? []).filter((x) => x.id !== f.id));
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
