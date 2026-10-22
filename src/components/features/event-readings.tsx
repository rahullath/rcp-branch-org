"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { del, patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import type { Event, SharedRead } from "@/lib/types";
import type { FeedItem } from "@/lib/feeds";
import { ALL_RESOURCES } from "@/data/resources";
import { didRead, linkKind, mainRead } from "@/lib/preread";
import { SectionHead } from "./primitives";

const PREREAD_NOTE: Partial<Record<Event["event_type"], string>> = {
  branch: "Do one of these before the meeting.",
  reading_group: "Do one of these before the session.",
};
import { useToast } from "./toast";

/**
 * What to read before this. One main reading (what everyone's asked to do)
 * and the rest as "also good"; doing any one counts. The lead sees one line
 * of how many have, with the names folded away.
 */
export function EventReadings({
  event,
  live,
  canAdd,
  canManage = canAdd,
  showWho,
  expected,
}: {
  event: Event;
  live: boolean;
  canAdd: boolean;
  /** Pick the main one, remove others' links: the lead and officers. */
  canManage?: boolean;
  /** The lead / officers see how many have done one. */
  showWho: boolean;
  /** Who's expected to have read it: for a branch meeting everyone who hasn't said can't; otherwise those going. */
  expected: { id: string; name: string }[];
}) {
  const actor = useActor();
  const toast = useToast();
  const { data, setData } = useData<SharedRead[]>("/api/reads");
  const reads = (data ?? []).filter((r) => r.event_id === event.id);
  if (!reads.length && !(canAdd && live)) return null;
  const main = mainRead(reads);
  const others = reads.filter((r) => r.id !== main?.id);
  const done = !!actor && didRead(reads, actor.id);
  const notYet = expected.filter((p) => !didRead(reads, p.id));
  const first = (n: string) => n.replace(/^Comrade\s+/i, "").split(" ")[0];

  const open = (r: SharedRead) => !done && void patch(`/api/reads/${r.id}`, { read: true }).then(() => revalidate("/api/reads", "/api/inbox"));
  const remove = (r: SharedRead) =>
    (r.shared_by === actor?.id || canManage) && (
      <button
        type="button"
        className="btn-ic sm"
        aria-label={`Remove ${r.title}`}
        onClick={() => {
          setData((p) => (p ?? []).filter((x) => x.id !== r.id));
          void del(`/api/reads/${r.id}`).catch(() => revalidate("/api/reads"));
        }}
      >
        <X size={16} />
      </button>
    );

  return (
    <section>
      <SectionHead title="Read or listen before" />
      {PREREAD_NOTE[event.event_type] && reads.length > 0 && (
        <p className="small" style={{ marginTop: 0 }}>
          {PREREAD_NOTE[event.event_type]}
        </p>
      )}
      {main && (
        <div className="li">
          <div className="grow min0">
            <a className="t link" href={main.url} target="_blank" rel="noopener noreferrer" onClick={() => open(main)}>
              {main.title}
            </a>
            <p className="small">
              {KIND_WORD[linkKind(main.url) ?? "article"]}
              {done ? " · you've done one" : ""}
            </p>
          </div>
          {remove(main)}
        </div>
      )}
      {others.length > 0 && (
        <div className="stack6 mt8">
          <p className="small" style={{ margin: 0, fontWeight: 700 }}>
            Also good
          </p>
          {others.map((r) => (
            <div key={r.id} className="row gap8" style={{ alignItems: "center" }}>
              <a className="link grow min0 trunc" href={r.url} target="_blank" rel="noopener noreferrer" onClick={() => open(r)} style={{ fontSize: 14 }}>
                {r.title}
              </a>
              <span className="small muted">{KIND_WORD[linkKind(r.url) ?? "article"]}</span>
              {canManage && (
                <button
                  type="button"
                  className="link small"
                  onClick={() => {
                    setData((p) => (p ?? []).map((x) => (x.event_id === event.id ? { ...x, main: x.id === r.id } : x)));
                    void patch(`/api/reads/${r.id}`, { main: true })
                      .then(() => toast("That's the main one now"))
                      .catch(() => revalidate("/api/reads"));
                  }}
                >
                  Make main
                </button>
              )}
              {remove(r)}
            </div>
          ))}
        </div>
      )}
      {showWho && live && main && expected.length > 0 && (
        <details className="mt8">
          <summary className="small" style={{ cursor: "pointer" }}>
            {expected.length - notYet.length} of {expected.length} have done one
          </summary>
          {notYet.length > 0 && <p className="small muted" style={{ margin: "4px 0 0" }}>Not yet: {notYet.map((p) => first(p.name)).join(", ")}</p>}
        </details>
      )}
      {canAdd && live && <AddReading eventId={event.id} have={reads.map((r) => r.url)} onAdded={(r) => setData((p) => [r, ...(p ?? [])])} />}
    </section>
  );
}

const KIND_WORD: Record<string, string> = { article: "Article", youtube: "Video", video: "Video", spotify: "Listen", podcast: "Listen" };

/**
 * Search the branch library and everything marxist.com / communist.red have
 * published, or paste a link. What's added is the meeting's prep too, so the
 * programme counts it.
 */
function AddReading({ eventId, have, onAdded }: { eventId: string; have: string[]; onAdded: (r: SharedRead) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLink = /^https?:\/\//.test(q.trim());
  const { data: found, loading } = useData<{ items: FeedItem[] }>(!isLink && searched.length >= 3 ? `/api/resources/search?q=${encodeURIComponent(searched)}` : null);
  const term = searched.toLowerCase();
  const library = !isLink && term.length >= 2 ? ALL_RESOURCES.filter((r) => r.title.toLowerCase().includes(term)).slice(0, 5) : [];
  const results = [
    ...library.map((r) => ({ title: r.title, url: r.url, kind: r.kind as string, source: "Branch library" })),
    ...(found?.items ?? []).map((r) => ({ title: r.title, url: r.url, kind: r.kind as string, source: r.source })),
  ]
    .filter((r, i, all) => all.findIndex((x) => x.url === r.url) === i && !have.includes(r.url))
    .slice(0, 8);

  function type(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSearched(v.trim()), 300);
  }

  async function add(url: string, title?: string) {
    try {
      const created = await post<SharedRead>("/api/reads", { url, title: title ?? "", event_id: eventId });
      onAdded(created);
      setQ("");
      setSearched("");
      toast("Added · everyone coming gets it in their inbox");
      revalidate("/api/agenda");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't add it");
    }
  }

  return (
    <div className="stack6 mt8">
      <div className="row gap6">
        <input className="inp grow" value={q} onChange={(e) => type(e.target.value)} placeholder="Search the library, or paste a link" aria-label="Find something to read or listen to" />
        {isLink && (
          <button type="button" className="btn btn-o btn-sm" onClick={() => add(q.trim())}>
            Add
          </button>
        )}
      </div>
      {!isLink && searched.length >= 2 && (
        <div className="stack6">
          {results.map((r) => (
            <div key={r.url} className="li">
              <div className="grow min0">
                <p className="t trunc">{r.title}</p>
                <p className="small">
                  {KIND_WORD[r.kind] ?? "Article"} · {r.source}
                </p>
              </div>
              <button type="button" className="btn btn-o btn-sm" onClick={() => add(r.url, r.title)}>
                Add
              </button>
            </div>
          ))}
          {loading && <p className="small">Searching…</p>}
          {!loading && results.length === 0 && <p className="small">Nothing found. Paste a link instead.</p>}
        </div>
      )}
    </div>
  );
}
