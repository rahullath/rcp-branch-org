"use client";

import { useState } from "react";
import { patch } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { isCandidate } from "@/lib/candidates";
import { publicOrigin } from "@/lib/share-url";
import type { Branch, Comrade } from "@/lib/types";
import type { PortalRow } from "@/lib/portal-match";
import { Button, Card, CardHeader } from "@/components/ui";

type Reply = { configured: boolean; error?: string; rows?: PortalRow[] };

const fmt = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * The party portal next to the app, for officers: who's a member but not on
 * the app yet, and candidacy dates that differ. Reads the portal only; the
 * buttons change the app, never the portal. Hidden until the portal is set up.
 */
export function PortalCard() {
  const { data } = useData<Reply>("/api/portal/members");
  const { data: comrades, setData: setComrades } = useData<Comrade[]>("/api/comrades");
  const { data: branch } = useData<Branch | null>("/api/branches");
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  if (!data?.configured) return null;
  if (data.error) {
    return (
      <Card>
        <CardHeader title="Party portal" icon="sync_problem" />
        <p className="px-4 pb-4 text-sm text-error">{data.error}</p>
      </Card>
    );
  }
  const rows = data.rows ?? [];
  const notOnApp = rows.filter((r) => !r.profileId);
  const byId = new Map((comrades ?? []).map((c) => [c.id, c]));

  // Where the portal and the app disagree about someone's candidacy.
  const checks = rows.flatMap((r) => {
    const c = r.comradeId ? byId.get(r.comradeId) : undefined;
    if (!c) return [];
    const appUntil = isCandidate(c) ? c.candidate_until : null;
    if (appUntil === r.candidacyUntil) return [];
    if (r.candidacyUntil && !appUntil) return [{ r, c, text: `Candidate on the portal until ${fmt(r.candidacyUntil)}, not marked here`, label: "Mark as candidate", body: { candidacy: "until", until: r.candidacyUntil } }];
    if (r.candidacyUntil && appUntil) return [{ r, c, text: `Review ${fmt(appUntil)} here, ${fmt(r.candidacyUntil)} on the portal`, label: "Use portal date", body: { candidacy: "until", until: r.candidacyUntil } }];
    return [{ r, c, text: "Full member on the portal, still a candidate here", label: "Mark full member", body: { candidacy: "member" } }];
  });

  async function invite(r: PortalRow) {
    const link = branch?.join_code ? `${publicOrigin()}/join/${branch.join_code}` : `${publicOrigin()}/login`;
    const text = `Hi ${r.name.split(/\s+/)[0]}, the branch uses an app for what's on, readings and paper sales: ${link} (sign in with ${r.email}).`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(r.portalId);
    } catch {
      setMsg("Couldn't copy on this browser");
    }
  }

  async function apply(c: Comrade, body: Record<string, unknown>) {
    setMsg("");
    try {
      const updated = await patch<Comrade>(`/api/comrades/${c.id}`, body);
      setComrades((prev) => (prev ?? []).map((x) => (x.id === c.id ? { ...x, ...updated } : x)));
      revalidate("/api/inbox");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  return (
    <Card>
      <CardHeader title="Party portal" subtitle={`${rows.length} members · ${rows.length - notOnApp.length} on the app`} icon="badge" />
      <div className="space-y-4 px-4 pb-4 text-sm">
        {msg && <p className="font-medium text-error">{msg}</p>}
        <div className="space-y-2">
          <p className="font-semibold text-on-surface">Not on the app yet{notOnApp.length ? ` · ${notOnApp.length}` : ""}</p>
          {notOnApp.length === 0 && <p className="text-on-surface-variant">Everyone on the portal is on the app.</p>}
          {notOnApp.map((r) => (
            <div key={r.portalId} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-on-surface">{r.name}</p>
                <p className="truncate text-xs text-on-surface-variant">{r.email}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => invite(r)}>
                {copied === r.portalId ? "Copied" : "Copy invite"}
              </Button>
            </div>
          ))}
        </div>
        {checks.length > 0 && (
          <div className="space-y-2">
            <p className="font-semibold text-on-surface">Candidacy to check · {checks.length}</p>
            {checks.map(({ r, c, text, label, body }) => (
              <div key={r.portalId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-on-surface">{c.name}</p>
                  <p className="text-xs text-on-surface-variant">{text}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => apply(c, body)}>
                  {label}
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-on-surface-variant">Read from the portal. Nothing here changes it.</p>
      </div>
    </Card>
  );
}
