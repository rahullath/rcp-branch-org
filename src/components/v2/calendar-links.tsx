"use client";

import { useState } from "react";
import { CalendarPlus, Copy } from "lucide-react";
import { api } from "@/lib/client";

type Links = { https: string; webcal: string; google: string };

/**
 * Subscribe once, never add an event by hand again: the phone's calendar
 * re-reads your private link, so new events, changed times and called-off
 * sales all show up by themselves. Your reply shows in the title (✓ / ?).
 */
export function CalendarLinks({ compact = false }: { compact?: boolean }) {
  const [links, setLinks] = useState<Links | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function get() {
    if (links) return links;
    setBusy(true);
    try {
      const l = await api<Links>("/api/me/calendar");
      setLinks(l);
      return l;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't make your link");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const isApple = typeof navigator !== "undefined" && /iPhone|iPad|Macintosh/.test(navigator.userAgent);

  return (
    <div className="stack6">
      {!compact && (
        <p className="small" style={{ margin: 0 }}>
          Add branch events to your phone&apos;s calendar. It keeps itself up to date.
        </p>
      )}
      <div className="row gap8 wrap">
        <button
          type="button"
          className="btn btn-p btn-sm"
          disabled={busy}
          onClick={async () => {
            const l = await get();
            if (l) window.location.href = isApple ? l.webcal : l.google;
          }}
        >
          <CalendarPlus size={16} /> {isApple ? "Add to Apple Calendar" : "Add to Google Calendar"}
        </button>
        <button
          type="button"
          className="btn btn-o btn-sm"
          disabled={busy}
          onClick={async () => {
            const l = await get();
            if (l) window.open(isApple ? l.google : l.webcal, "_blank");
          }}
        >
          {isApple ? "Google Calendar" : "Apple / Outlook"}
        </button>
        <button
          type="button"
          className="btn btn-o btn-sm"
          disabled={busy}
          onClick={async () => {
            const l = await get();
            if (l) await navigator.clipboard.writeText(l.https).then(() => setMsg("Link copied — paste it into any calendar app's “subscribe by URL”."));
          }}
          aria-label="Copy calendar link"
        >
          <Copy size={14} />
        </button>
      </div>
      {msg && <p className="small">{msg}</p>}
      {!compact && <p className="small muted" style={{ margin: 0 }}>This link is just for you, so don&apos;t share it.</p>}
    </div>
  );
}
