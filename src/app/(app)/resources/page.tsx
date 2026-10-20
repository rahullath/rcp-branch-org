"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink, Newspaper, PlayCircle, Podcast, Search, Send } from "lucide-react";
import { useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { TOPIC_LIBRARY } from "@/data/resources";
import { MORE_LINKS, PREP_LINKS, type ResourceSource } from "@/data/resource-sources";
import type { FeedItem } from "@/lib/feeds";
import { fmtDay, SectionHead } from "@/components/v2/primitives";
import { SendSheet } from "@/components/v2/send-sheet";
import { patch } from "@/lib/client";
import { useToast } from "@/components/v2/toast";

const ICON = { "communist-red": Newspaper, "marxist-com": Newspaper, youtube: PlayCircle, podcasts: Podcast } as const;

/**
 * Resources: the party's outlets up top, what they've just published (read
 * from their own feeds), search across everything they've ever published,
 * and the branch's topic prep lists. Anything can be sent straight to the
 * people you're bringing in.
 */
export default function ResourcesPage() {
  const actor = useActor();
  const { data: sources } = useData<ResourceSource[]>("/api/resources/sources");
  const { data: latest, loading } = useData<{ items: FeedItem[] }>("/api/resources/latest");
  const [query, setQuery] = useState("");
  // Debounced: what's actually searched, set a moment after typing stops.
  const [searched, setSearched] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: found, loading: searching } = useData<{ items: FeedItem[] }>(searched.length >= 2 ? `/api/resources/search?q=${encodeURIComponent(searched)}` : null);
  const results = searched.length >= 2 ? (found?.items ?? []) : null;
  const [sending, setSending] = useState<{ title: string; url: string } | null>(null);
  const [filter, setFilter] = useState<"all" | FeedItem["kind"]>("all");

  function type(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSearched(v.trim()), 300);
  }

  const topics = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? TOPIC_LIBRARY.filter((t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)) : TOPIC_LIBRARY;
  }, [query]);

  const items = (latest?.items ?? []).filter((i) => filter === "all" || i.kind === filter);

  return (
    <div className="v2 pg">
      <div className="ph">
        <div>
          <h1>Resources</h1>
          <p className="sub">Articles, videos and podcasts to read and share.</p>
        </div>
      </div>

      <div className="hero-grid">
        {(sources ?? []).map((s) => {
          const Icon = ICON[s.key as keyof typeof ICON] ?? Newspaper;
          return (
            <a key={s.key} className={"hero-tile hero-" + s.key} href={s.url} target="_blank" rel="noopener noreferrer">
              <Icon size={22} strokeWidth={2.25} />
              <b>{s.label}</b>
              <span>{s.blurb}</span>
            </a>
          );
        })}
      </div>
      <div className="row gap8 wrap">
        {MORE_LINKS.map((l) => (
          <a key={l.url} className="chip" href={l.url} target="_blank" rel="noopener noreferrer">
            {l.label}
          </a>
        ))}
      </div>

      <section>
        <SectionHead title="Prep, podcasts, writing for the paper" />
        <div className="stack6">
          {PREP_LINKS.map((l) => (
            <a key={l.url} className="li li-link" href={l.url} target="_blank" rel="noopener noreferrer">
              <div className="grow min0">
                <p className="t">{l.label}</p>
                <p className="small">{l.blurb}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      <label className="row gap8 inp" style={{ alignItems: "center", padding: "0 12px" }}>
        <Search size={16} />
        <input
          className="grow"
          style={{ border: 0, outline: 0, background: "transparent", height: 42 }}
          value={query}
          onChange={(e) => type(e.target.value)}
          placeholder="Search everything — e.g. Syriza, Rojava, wage labour"
          aria-label="Search resources"
        />
      </label>

      {results ? (
        <section>
          <SectionHead title={searching ? "Searching…" : `Found · ${results.length}`} />
          <ItemList items={results} onSend={setSending} />
          {topics.length > 0 && (
            <>
              <h4 className="dayh mt12">Branch topics</h4>
              <Topics topics={topics} onSend={setSending} />
            </>
          )}
        </section>
      ) : (
        <>
          <section>
            <SectionHead title="Latest" />
            <div className="tabs4">
              {(["all", "article", "video", "podcast"] as const).map((k) => (
                <button key={k} type="button" className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
                  {k === "all" ? "All" : k === "article" ? "Articles" : k === "video" ? "Videos" : "Podcasts"}
                </button>
              ))}
            </div>
            {loading && !latest ? <p className="small">Loading what&apos;s new…</p> : <ItemList items={items.slice(0, 20)} onSend={setSending} />}
            {!loading && items.length === 0 && <p className="small">Nothing loaded from {filter === "all" ? "the feeds" : "this feed"} right now — the outlets above still work.</p>}
          </section>

          <section>
            <SectionHead title="Branch topics" />
            <p className="small" style={{ margin: "0 0 6px" }}>Prep lists for the discussions the branch runs.</p>
            <Topics topics={topics} onSend={setSending} />
          </section>

          {actor?.isAdmin && <SourcesEditor sources={sources ?? []} />}
        </>
      )}

      {sending && <SendSheet item={sending} onClose={() => setSending(null)} />}
    </div>
  );
}

function ItemList({ items, onSend }: { items: FeedItem[]; onSend: (i: { title: string; url: string }) => void }) {
  return (
    <div className="list">
      {items.map((i) => (
        <div key={i.url} className="li">
          <a className="grow min0" href={i.url} target="_blank" rel="noopener noreferrer">
            <span className="t" style={{ display: "block" }}>
              {i.title}
            </span>
            <span className="small">
              {i.source}
              {i.date ? ` · ${fmtDay(i.date)}` : ""}
            </span>
          </a>
          <button type="button" className="btn-ic sm" aria-label={`Send ${i.title}`} onClick={() => onSend(i)}>
            <Send size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Topics({ topics, onSend }: { topics: typeof TOPIC_LIBRARY; onSend: (i: { title: string; url: string }) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="matlist">
      {topics.map((t) => (
        <div key={t.title} className={"mat" + (open === t.title ? " open" : "")}>
          <button type="button" className="mat-r" onClick={() => setOpen(open === t.title ? null : t.title)} aria-expanded={open === t.title}>
            <span className="grow min0">
              <span className="t">{t.title}</span>
              {t.description && (
                <span className="small" style={{ display: "block" }}>
                  {t.description}
                </span>
              )}
            </span>
            <span className="small">{t.prep.length}</span>
          </button>
          {open === t.title && (
            <div className="mat-x">
              {t.prep.map((p) => (
                <div key={p.url} className="row gap8" style={{ alignItems: "center" }}>
                  <a className="grow link" href={p.url} target="_blank" rel="noopener noreferrer">
                    {p.title}
                  </a>
                  <button type="button" className="btn-ic sm" aria-label={`Send ${p.title}`} onClick={() => onSend(p)}>
                    <Send size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Officers: correct an outlet's link or paste its feed (the podcast RSS, a YouTube feed). */
function SourcesEditor({ sources }: { sources: ResourceSource[] }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  if (!show) {
    return (
      <button type="button" className="link" style={{ textAlign: "left" }} onClick={() => setShow(true)}>
        Fix a link or add a feed (officers)
      </button>
    );
  }
  return (
    <section className="stack8">
      <SectionHead title="Outlets" />
      {sources.map((s) => (
        <SourceRow key={s.key} source={s} onSaved={() => toast(`${s.label} saved`)} />
      ))}
    </section>
  );
}

function SourceRow({ source, onSaved }: { source: ResourceSource; onSaved: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState(source.url);
  const [feed, setFeed] = useState(source.feed ?? "");
  return (
    <form
      className="ask stack6"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await patch("/api/resources/sources", { key: source.key, url, feed });
          onSaved();
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't save");
        }
      }}
    >
      <span className="ask-k">
        {source.label} <ExternalLink size={11} />
      </span>
      <input className="inp" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link" aria-label={`${source.label} link`} />
      <input className="inp" value={feed} onChange={(e) => setFeed(e.target.value)} placeholder="RSS feed (optional)" aria-label={`${source.label} feed`} />
      <button type="submit" className="btn btn-o btn-sm">
        Save
      </button>
    </form>
  );
}
