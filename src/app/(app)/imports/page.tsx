"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { patch } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { useProfiles } from "@/lib/profiles-context";
import { MODULE_LABEL, type ImportModule, type JsonImportLine } from "@/lib/import-prompt";
import type { ImportRequest } from "@/lib/types";
import { relativeDaysAgo } from "@/lib/utils";
import { SectionHead } from "@/components/features/primitives";
import { useToast } from "@/components/features/toast";
import { ImportLines, lineKey, pickedRows } from "@/components/features/import-lines";

type Summary = Omit<ImportRequest, "data"> & { rows: number; modules: string[] };
type Detail = { request: ImportRequest; lines: JsonImportLine[]; warnings: string[] };

/**
 * Officers' imports wait here for the admin. Each row shows anything that
 * looks like it's already in the app; only a person can tell "France and
 * Spain protests" is the "European revolutions" talk, so nothing goes in
 * until you tick it and approve.
 */
export default function ImportReviewsPage() {
  return (
    <Suspense>
      <Reviews />
    </Suspense>
  );
}

function Reviews() {
  const actor = useActor();
  const { profiles } = useProfiles();
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(params.get("id"));
  const { data, refresh } = useData<Summary[]>(actor?.isAdmin ? "/api/import/requests" : null);
  const name = (id: string | null | undefined) => profiles.find((p) => p.id === id)?.name ?? "Someone";

  if (actor && !actor.isAdmin) {
    return (
      <div className="screen pg">
        <p className="nothing">
          Only the admin reviews imports. Yours are on the{" "}
          <Link className="link" href="/import">
            Import
          </Link>{" "}
          page.
        </p>
      </div>
    );
  }

  const pending = (data ?? []).filter((r) => r.status === "pending");
  const done = (data ?? []).filter((r) => r.status !== "pending").slice(0, 10);

  return (
    <div className="screen pg">
      <div className="ph">
        <div>
          <h1>Import reviews</h1>
          <p className="sub">Check officers&apos; imports against what&apos;s already here.</p>
        </div>
      </div>

      <section>
        <SectionHead title="Waiting" />
        {pending.length === 0 && <p className="nothing">Nothing to check.</p>}
        <div className="stack8">
          {pending.map((r) =>
            open === r.id ? (
              <Review
                key={r.id}
                id={r.id}
                from={name(r.user_id)}
                onDone={() => {
                  setOpen(null);
                  refresh();
                }}
              />
            ) : (
              <button key={r.id} type="button" className="li li-link" style={{ textAlign: "left", width: "100%" }} onClick={() => setOpen(r.id)}>
                <div className="grow min0">
                  <p className="t">
                    {name(r.user_id)} · {r.rows} {r.rows === 1 ? "thing" : "things"}
                  </p>
                  <p className="small">
                    {r.modules.map((m) => MODULE_LABEL[m as ImportModule] ?? m).join(", ")} · {relativeDaysAgo(r.created_at)}
                    {r.note ? ` · “${r.note}”` : ""}
                  </p>
                </div>
              </button>
            ),
          )}
        </div>
      </section>

      {done.length > 0 && (
        <section>
          <SectionHead title="Done" />
          <div className="stack6">
            {done.map((r) => (
              <div key={r.id} className="li">
                <div className="grow min0">
                  <p className="t">
                    {name(r.user_id)} · {r.status === "approved" ? `${r.result?.imported ?? 0} added` : "declined"}
                  </p>
                  <p className="small">
                    {r.modules.map((m) => MODULE_LABEL[m as ImportModule] ?? m).join(", ")} · {relativeDaysAgo(r.decided_at ?? r.created_at)}
                    {r.reply ? ` · “${r.reply}”` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Review({ id, from, onDone }: { id: string; from: string; onDone: () => void }) {
  const toast = useToast();
  const { data } = useData<Detail>(`/api/import/requests/${id}`);
  const [off, setOff] = useState<Set<string> | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  if (!data) return <p className="small">Loading…</p>;
  // Start from what the sender ticked, minus anything that's already here or looks like it.
  const sent = data.request.only_rows ?? {};
  const current = off ?? new Set(data.lines.filter((l) => l.change === "skip" || l.similar?.length || !(sent[l.module] ?? []).includes(l.index)).map(lineKey));
  const only = pickedRows(data.lines, current);
  const count = Object.values(only).reduce((n, a) => n + (a?.length ?? 0), 0);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      await patch(`/api/import/requests/${id}`, { approve, only, reply });
      revalidate("/api/events", "/api/agenda-actions", "/api/follow-ups", "/api/materials", "/api/pledges", "/api/reading-groups", "/api/locations", "/api/comrades", "/api/inbox");
      toast(approve ? `Imported ${count}` : "Declined");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't do that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ask stack6">
      <span className="ask-k">From {from}</span>
      {data.request.note && <p className="small">“{data.request.note}”</p>}
      {data.warnings.map((w) => (
        <p key={w} className="small red">
          {w}
        </p>
      ))}
      <ImportLines lines={data.lines} off={current} setOff={(fn) => setOff(fn(current))} />
      <input className="inp mt8" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Note back to them (optional)" aria-label="Note back" />
      <div className="row gap8">
        <button type="button" className="btn btn-o grow" disabled={busy} onClick={() => decide(false)}>
          Decline
        </button>
        <button type="button" className="btn btn-p grow" disabled={busy || count === 0} onClick={() => decide(true)}>
          Import {count}
        </button>
      </div>
    </div>
  );
}
