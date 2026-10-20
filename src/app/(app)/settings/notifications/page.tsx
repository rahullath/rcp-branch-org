"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api, patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import type { NotificationPrefs } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { useToast } from "@/components/v2/toast";

type Toggle = Exclude<keyof NotificationPrefs, "quiet_start" | "quiet_end">;

const ROWS: [Toggle, string, string][] = [
  ["new_events", "New events", "One push when an event is created"],
  ["reminders", "Reminder if you haven't replied", "Once, 48 hours before"],
  ["lead_updates", "Updates from the lead", "Only for events you're going to"],
  ["polls", "New polls", "One push per poll"],
  ["bring_gaps", "Bring list gaps", "Day before, if you're going and items are unclaimed"],
  ["sunday_digest", "Sunday summary", "The week ahead in one notification"],
];

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Rules, not a firehose. Every push can be answered from the notification itself. */
export default function NotificationsPage() {
  const toast = useToast();
  const { data: prefs, setData } = useData<NotificationPrefs>("/api/me/prefs");
  const { data: push } = useData<{ configured: boolean; publicKey: string; devices: number }>("/api/push");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingQuiet, setEditingQuiet] = useState(false);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    (supported ? navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()) : Promise.resolve(null))
      .then((s) => setSubscribed(!!s))
      .catch(() => setSubscribed(false));
  }, []);

  async function save(next: Partial<NotificationPrefs>) {
    setData((p) => (p ? { ...p, ...next } : p));
    try {
      await patch("/api/me/prefs", next);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
      revalidate("/api/me/prefs");
    }
  }

  async function turnOn() {
    if (!push?.publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast("Notifications are blocked for this site — allow them in your browser settings");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(push.publicKey) }));
      await post("/api/push/subscribe", sub.toJSON());
      setSubscribed(true);
      revalidate("/api/push");
      toast("Notifications on for this phone");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't turn notifications on");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
      revalidate("/api/push");
      toast("Notifications off for this phone");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="v2 pg">
      <div className="ph">
        <Link className="btn-ic" href="/more" aria-label="Back">
          <ArrowLeft size={18} strokeWidth={2.25} />
        </Link>
        <div className="grow">
          <h1 style={{ fontSize: 22 }}>Notifications</h1>
        </div>
      </div>
      <p className="small" style={{ margin: 0 }}>
        Every push can be answered from the notification itself. Nothing repeats.
      </p>

      <div className="li">
        <div className="grow min0">
          <p className="t">This phone</p>
          <p className="small">
            {push && !push.configured
              ? "Push isn't set up on the server yet. Your inbox still shows everything."
              : subscribed
                ? "Notifications are on. Install the app to your home screen for the best results."
                : "Off. Turn on to answer from the notification."}
          </p>
        </div>
        {push?.configured && subscribed !== null && (
          <button type="button" className={subscribed ? "btn btn-o btn-sm" : "btn btn-p btn-sm"} disabled={busy} onClick={subscribed ? turnOff : turnOn}>
            {subscribed ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>

      {!prefs ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="matlist">
            {ROWS.map(([k, label, hint]) => (
              <button key={k} type="button" className="mat-r" role="switch" aria-checked={prefs[k]} onClick={() => save({ [k]: !prefs[k] })}>
                <span className="grow min0">
                  <span className="t">{label}</span>
                  <span className="small" style={{ display: "block" }}>
                    {hint}
                  </span>
                </span>
                <span className={"sw2" + (prefs[k] ? " on" : "")}>
                  <i />
                </span>
              </button>
            ))}
          </div>
          <div className="li" style={{ flexWrap: "wrap" }}>
            <div className="grow">
              <p className="t">Quiet hours</p>
              <p className="small">
                {prefs.quiet_start} – {prefs.quiet_end}
              </p>
            </div>
            {editingQuiet ? (
              <div className="row gap8">
                <input className="inp" type="time" value={prefs.quiet_start} onChange={(e) => save({ quiet_start: e.target.value })} aria-label="Quiet from" />
                <input className="inp" type="time" value={prefs.quiet_end} onChange={(e) => save({ quiet_end: e.target.value })} aria-label="Quiet until" />
                <button type="button" className="btn btn-p btn-sm" onClick={() => setEditingQuiet(false)}>
                  Done
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-o btn-sm" onClick={() => setEditingQuiet(true)}>
                Change
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
