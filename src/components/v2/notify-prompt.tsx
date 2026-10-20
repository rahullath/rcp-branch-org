"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { enablePush, pushState, pushSupported } from "@/lib/push-client";

const OPENS = "notify-opens";
const SNOOZE = "notify-snooze";
const NO = "notify-declines";

const get = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* private mode — the prompt just shows less cleverly */
  }
};

/**
 * After a few visits, one friendly ask to turn on notifications. "Not now"
 * waits a week; after three "not now"s it stops asking. Never shows if
 * they're already on, blocked, or the phone can't do them.
 */
export function NotifyPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Count each time the app is opened (once per tab session).
    try {
      if (!window.sessionStorage.getItem(OPENS)) {
        window.sessionStorage.setItem(OPENS, "1");
        set(OPENS, String(Number(get(OPENS) ?? 0) + 1));
      }
    } catch {
      /* ignore */
    }
    const opens = Number(get(OPENS) ?? 0);
    const snoozed = Number(get(SNOOZE) ?? 0) > Date.now();
    const declines = Number(get(NO) ?? 0);
    if (opens < 3 || snoozed || declines >= 3 || !pushSupported()) return;
    const timer = window.setTimeout(async () => {
      const state = await pushState().catch(() => "unsupported" as const);
      if (!cancelled && state === "off") setShow(true);
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!show) return null;

  function later() {
    set(SNOOZE, String(Date.now() + 7 * 86400_000));
    set(NO, String(Number(get(NO) ?? 0) + 1));
    setShow(false);
  }

  return (
    <div className="v2-layer notify-prompt" role="dialog" aria-label="Turn on notifications">
      <div className="row gap8" style={{ alignItems: "flex-start" }}>
        <span className="notify-bell">
          <Bell size={20} />
        </span>
        <div className="grow min0">
          <p className="t" style={{ margin: 0 }}>
            Want a heads-up when something needs you?
          </p>
          <p className="small" style={{ margin: "4px 0 0" }}>
            Reminders before events, things to bring, and when someone&apos;s waiting on your answer. Quiet at night.
          </p>
        </div>
      </div>
      <div className="row gap8 mt8">
        <button
          type="button"
          className="btn btn-p btn-sm grow"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await enablePush().catch(() => "blocked" as const);
            if (res !== "on") set(NO, "3");
            setShow(false);
          }}
        >
          Turn on
        </button>
        <button type="button" className="btn btn-o btn-sm" onClick={later}>
          Not now
        </button>
      </div>
    </div>
  );
}
