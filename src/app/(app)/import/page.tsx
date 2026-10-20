"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy } from "lucide-react";
import { post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { londonDay } from "@/lib/follow-through";
import { importPrompt, MODULE_LABEL, type ImportModule, type JsonImportLine } from "@/lib/import-prompt";
import type { Branch, ImportRequest } from "@/lib/types";
import { SectionHead } from "@/components/v2/primitives";
import { useToast } from "@/components/v2/toast";
import { ImportLines, pickedRows, startOff } from "@/components/v2/import-lines";

type Preview = { lines: JsonImportLine[]; warnings: string[] };
type Sent = Omit<ImportRequest, "data"> & { rows: number; modules: string[] };

/**
 * One place to bring things in. Messy notes → copy the prompt, paste it and
 * the notes into any AI chat, paste its JSON back here, check, import. The
 * app matches names to people and skips what it already has. Your contacts
 * go straight in; an officer's other rows go to the admin to check first.
 */
export default function ImportPage() {
  const actor = useActor();
  const toast = useToast();
  const { data: branch } = useData<Branch | null>("/api/branches");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const isOfficer = !!actor?.role.some((r) => r !== "member");
  const reviewed = isOfficer && !actor?.isAdmin;
  const { data: sent, refresh: refreshSent } = useData<Sent[]>(reviewed ? "/api/import/requests" : null);

  async function copyPrompt() {
    await navigator.clipboard.writeText(importPrompt(londonDay(Date.now()), branch?.name ?? "the branch"));
    toast("Prompt copied — paste it into any AI chat, then your notes under it");
  }

  async function check() {
    setBusy(true);
    try {
      const res = await post<Preview>("/api/import/json", { data: text });
      setPreview(res);
      setOff(startOff(res.lines));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't read that");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!preview) return;
    const only = pickedRows(preview.lines, off);
    setBusy(true);
    try {
      const res = await post<{ sent?: boolean }>("/api/import/json", { data: text, apply: true, only, note });
      revalidate("/api/contacts", "/api/events", "/api/agenda-actions", "/api/follow-ups", "/api/materials", "/api/pledges", "/api/reading-groups", "/api/locations", "/api/comrades", "/api/inbox");
      const contacts = only.contacts?.length ?? 0;
      if (res.sent) {
        toast(`${contacts ? `${contacts} contacts added · ` : ""}the rest is with the admin to check`);
        refreshSent();
      } else toast(`Imported ${Object.values(only).reduce((n, a) => n + (a?.length ?? 0), 0)}`);
      setPreview(null);
      setText("");
      setNote("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't import");
    } finally {
      setBusy(false);
    }
  }

  const picked = preview ? pickedRows(preview.lines, off) : {};
  const count = Object.values(picked).reduce((n, a) => n + (a?.length ?? 0), 0);
  const forReview = reviewed && Object.entries(picked).some(([m, a]) => m !== "contacts" && a?.length);

  return (
    <div className="v2 pg">
      <div className="ph">
        <div>
          <h1>Import</h1>
          <p className="sub">Get notes, lists and chats into the app without retyping.</p>
        </div>
      </div>

      <section>
        <SectionHead title="Everything at once" />
        <ol className="small stack6" style={{ paddingLeft: 18, margin: "0 0 10px" }}>
          <li>Copy the prompt and paste it into any AI chat (ChatGPT, Claude, Gemini…).</li>
          <li>Under it, paste your notes: minutes, lists, stock counts, names and numbers.</li>
          <li>Paste the JSON it replies with below, check it, import.</li>
        </ol>
        <button type="button" className="btn btn-p" onClick={copyPrompt} style={{ width: "100%" }}>
          <Copy size={16} /> Copy prompt
        </button>
        {!isOfficer && <p className="small mt8">As a member you can import your own contacts this way; events, stock and the rest need an officer.</p>}
      </section>

      <section>
        <SectionHead title="Paste the AI's reply" />
        {!preview ? (
          <>
            <textarea
              className="inp"
              style={{ width: "100%", height: 200, padding: 10, fontSize: 12.5, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'{ "contacts": [ … ], "events": [ … ] }'}
              aria-label="JSON from the AI"
            />
            <button type="button" className="btn btn-p mt8" style={{ width: "100%" }} disabled={busy || !text.trim()} onClick={check}>
              Check
            </button>
          </>
        ) : (
          <>
            {preview.warnings.map((w) => (
              <p key={w} className="small red">
                {w}
              </p>
            ))}
            {preview.lines.length === 0 && <p className="small">Nothing in there the app can use.</p>}
            <ImportLines lines={preview.lines} off={off} setOff={setOff} />
            {forReview && (
              <>
                <p className="small mt8">Your contacts go in now. The rest goes to the admin, who checks it against what&apos;s already there (the same thing can be written two ways).</p>
                <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the admin should know (optional)" aria-label="Note for the admin" />
              </>
            )}
            <div className="row gap8 mt8">
              <button type="button" className="btn btn-o grow" disabled={busy} onClick={() => setPreview(null)}>
                Back
              </button>
              <button type="button" className="btn btn-p grow" disabled={busy || count === 0} onClick={apply}>
                {forReview ? `Send ${count} for review` : `Import ${count}`}
              </button>
            </div>
          </>
        )}
      </section>
      {!!sent?.length && (
        <section>
          <SectionHead title="Sent for review" />
          <div className="stack6">
            {sent.slice(0, 6).map((r) => (
              <div key={r.id} className="li">
                <div className="grow min0">
                  <p className="t">
                    {r.rows} {r.rows === 1 ? "thing" : "things"} · {r.modules.map((m) => MODULE_LABEL[m as ImportModule] ?? m).join(", ")}
                  </p>
                  <p className="small">
                    {r.status === "pending" ? "Waiting for the admin" : r.status === "approved" ? `In · ${r.result?.imported ?? r.rows} added` : "Not imported"}
                    {r.reply ? ` · “${r.reply}”` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="Or one kind at a time" />
        <div className="stack6">
          <Link className="li li-link" href="/contacts/import">
            <div className="grow min0">
              <p className="t">Contacts</p>
              <p className="small">Names and numbers, one per line. Set how keen each one is.</p>
            </div>
          </Link>
          {isOfficer && (
            <>
              <Link className="li li-link" href="/agenda/import">
                <div className="grow min0">
                  <p className="t">Agenda doc</p>
                  <p className="small">A branch or BC agenda, with its owners and actions.</p>
                </div>
              </Link>
              <Link className="li li-link" href="/agenda/actions">
                <div className="grow min0">
                  <p className="t">A list of actions</p>
                  <p className="small">“DP to send article by Thursday” lines from minutes or chat.</p>
                </div>
              </Link>
            </>
          )}
        </div>
      </section>


    </div>
  );
}
