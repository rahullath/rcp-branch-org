"use client";

import Link from "next/link";
import type { Ask } from "@/lib/types";
import { relativeDaysAgo } from "@/lib/utils";
import { Spinner } from "@/components/ui";
import { AskCard } from "@/components/v2/ask-card";
import { useInbox } from "@/components/v2/use-inbox";
import { firstPart, usePeople } from "@/components/v2/primitives";

const GROUPS: [string, Ask["kind"][]][] = [
  ["Decide", ["decide", "candidate-review", "role-request", "import-request"]],
  ["Set up", ["setup"]],
  ["Events", ["rsvp"]],
  ["Bring someone", ["invite-contacts"]],
  ["To read", ["read"]],
  ["Polls", ["poll"]],
  ["Reading groups", ["rg-invite", "rg-request"]],
  ["Bring list", ["bring-reminder", "bring-gap", "bring", "material"]],
  ["To do", ["action", "away-clash", "invite-check", "report"]],
  ["Up for grabs", ["open-task"]],
  ["Your people", ["quiet", "pair"]],
  ["You", ["set-week"]],
];

/**
 * Everything waiting on you, grouped and answerable in place. Nobody writes
 * these — they exist because something is missing your answer.
 */
export default function InboxPage() {
  const { data, loading, setData } = useInbox();
  const { name, ini } = usePeople();
  const asks = data?.asks ?? [];
  const done = (k: string) => setData((p) => (p ? { ...p, asks: p.asks.filter((a) => a.k !== k) } : p));

  if (loading && !data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="v2 pg">
      <div className="ph">
        <div>
          <h1>Inbox</h1>
          <p className="sub">{asks.length ? `${asks.length} waiting on you.` : "Nothing waiting on you."}</p>
        </div>
      </div>
      {asks.length === 0 && <p className="nothing">All answered.</p>}
      {GROUPS.map(([label, kinds]) => {
        const list = asks.filter((a) => kinds.includes(a.kind));
        if (list.length === 0) return null;
        return (
          <section key={label}>
            <h4 className="dayh">
              {label} <span>{list.length}</span>
            </h4>
            <div className="stack8">
              {list.map((a) => (
                <AskCard key={a.k} ask={a} onDone={done} />
              ))}
            </div>
          </section>
        );
      })}
      {(data?.updates.length ?? 0) > 0 && (
        <section>
          <h4 className="dayh">Updates from leads</h4>
          <div className="list">
            {data!.updates.map((u) => (
              <Link key={u.id} className="li li-link" href={`/events/${u.event_id}`}>
                <span className="ini">{ini(u.author_id)}</span>
                <span className="grow min0">
                  <span className="t">
                    {name(u.author_id)} · {firstPart(u.event.title, " — ")}
                  </span>
                  <span className="small" style={{ display: "block" }}>
                    {u.text}
                  </span>
                </span>
                <span className="small">{agoShort(u.created_at)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function agoShort(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h`;
  return relativeDaysAgo(iso);
}
