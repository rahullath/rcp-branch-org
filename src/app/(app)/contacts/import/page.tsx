"use client";

import { ImportHint } from "@/components/v2/import-hint";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { post } from "@/lib/client";
import { revalidate } from "@/lib/hooks";
import { CONTACT_TIERS, type ContactTier } from "@/lib/types";
import { formatPhone, looksLikePhone, normalizePhone, parseContactLines } from "@/lib/phone";
import { CONTACT_SOURCES } from "@/components/v2/sheets";
import { useToast } from "@/components/v2/toast";

type Row = { key: number; on: boolean; name: string; phone: string; notes: string; tier: ContactTier };

/**
 * Bring in contacts from a notes app or a chat: one per line, name and
 * number, anything else becomes the note. Check the list, set how keen each
 * one is, import. They become your contacts. Too messy to read? The Import
 * page has a prompt that tidies notes with any AI chat first.
 */
export default function ImportContactsPage() {
  const toast = useToast();
  const router = useRouter();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState("other");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key: number, patch: Partial<Row>) => setRows((p) => (p ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const ready = (rows ?? []).filter((r) => r.on && r.name.trim());

  return (
    <div className="v2 pg">
      <div className="ph">
        <Link className="btn-ic" href="/contacts" aria-label="Back to contacts">
          <ArrowLeft size={18} strokeWidth={2.25} />
        </Link>
        <div className="grow min0">
          <h1 style={{ fontSize: 22 }}>Import contacts</h1>
          <p className="sub">One per line: name, number, anything else is the note.</p>
        </div>
      </div>

      <ImportHint />

      {!rows ? (
        <>
          <textarea
            className="inp"
            style={{ height: 220, padding: 10, fontSize: 13, lineHeight: 1.45, resize: "vertical" }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Name, number, a note — one person per line"}
            aria-label="Contacts, one per line"
          />
          <button
            type="button"
            className="btn btn-p"
            disabled={!text.trim()}
            onClick={() => setRows(parseContactLines(text).map((c, i) => ({ key: i, on: true, name: c.name, phone: c.phone ? formatPhone(c.phone) : "", notes: c.notes ?? "", tier: "potential" })))}
          >
            Check
          </button>
          <p className="small">
            Notes too messy for this? <Link className="link" href="/import">Import → tidy with AI</Link> turns any dump into something the app reads.
          </p>
        </>
      ) : (
        <>
          <select className="inp" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Where you met them">
            {CONTACT_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                Met at: {s.label}
              </option>
            ))}
          </select>
          <div className="matlist">
            {rows.map((r) => {
              const n = normalizePhone(r.phone);
              return (
                <div key={r.key} className="mat-r" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8, opacity: r.on ? 1 : 0.5 }}>
                  <input type="checkbox" checked={r.on} onChange={(e) => set(r.key, { on: e.target.checked })} aria-label="Include" style={{ marginTop: 10 }} />
                  <span className="grow min0 stack6">
                    <input className="inp" value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} aria-label="Name" />
                    <input
                      className="inp"
                      type="tel"
                      value={r.phone}
                      onChange={(e) => set(r.key, { phone: e.target.value })}
                      onBlur={() => n && set(r.key, { phone: formatPhone(n) })}
                      placeholder="+44 number (optional)"
                      aria-label="Number"
                    />
                    {n && !looksLikePhone(n) && <span className="small red">Check this number</span>}
                    <input className="inp" value={r.notes} onChange={(e) => set(r.key, { notes: e.target.value })} placeholder="Note" aria-label="Note" />
                    <span className="tabs3">
                      {CONTACT_TIERS.map((t) => (
                        <button key={t.value} type="button" className={r.tier === t.value ? "on" : ""} onClick={() => set(r.key, { tier: t.value })}>
                          {t.label}
                        </button>
                      ))}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <button type="button" className={"consent" + (ok ? " on" : "")} onClick={() => setOk(!ok)} aria-pressed={ok}>
            <span className="box">{ok && <Check size={14} strokeWidth={2.5} />}</span>
            <span>They were all OK with me noting that we met.</span>
          </button>
          <div className="row gap8">
            <button type="button" className="btn btn-o grow" onClick={() => setRows(null)} disabled={busy}>
              Edit text
            </button>
            <button
              type="button"
              className="btn btn-p grow"
              disabled={busy || !ok || ready.length === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await post<{ created: number; skipped: number }>("/api/contacts/bulk", {
                    consent: true,
                    rows: ready.map((r) => ({ name: r.name.trim(), phone: normalizePhone(r.phone), notes: r.notes.trim(), tier: r.tier, source })),
                  });
                  revalidate("/api/contacts", "/api/inbox");
                  toast(`${res.created} imported${res.skipped ? ` · ${res.skipped} already in your contacts` : ""}`);
                  router.push("/contacts");
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Couldn't import");
                  setBusy(false);
                }
              }}
            >
              Import {ready.length}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
