"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, Image as ImageIcon, Send, X } from "lucide-react";
import { del, post } from "@/lib/client";
import { publicOrigin } from "@/lib/share-url";
import { revalidate, useData } from "@/lib/hooks";
import type { Branch, Event, EventGuest, EventShare } from "@/lib/types";
import { Modal } from "@/components/ui";
import { useToast } from "./toast";

/**
 * Share an event outside the app: one link that opens just this event — no
 * account, nothing else reachable — with the graphic as its picture and
 * preview. People can say "I'm coming" with their name; they show up here
 * and count toward the event's number.
 */
export function ShareSheet({ event, summary, onClose }: { event: Event; summary: string; onClose: () => void }) {
  const toast = useToast();
  const [share, setShare] = useState<EventShare | null>(null);
  const [error, setError] = useState("");
  const [bust] = useState(() => Date.now());
  const { data: guests, setData: setGuests } = useData<EventGuest[]>("/api/event-guests");
  const viaLink = (guests ?? []).filter((g) => g.event_id === event.id && g.via_link);
  const { data: branch } = useData<Branch | null>("/api/branches");

  useEffect(() => {
    let live = true;
    post<EventShare>(`/api/events/${event.id}/share`, {})
      .then((s) => live && setShare(s))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't make a link"));
    return () => {
      live = false;
    };
  }, [event.id]);

  const url = share ? `${publicOrigin()}/s/${share.token}` : "";
  // The same page, plus a "sign in and join" button for comrades not on the app yet.
  const chatUrl = share && branch?.join_code ? `${url}?c=${branch.join_code}` : "";
  const text = `${summary}\n\n${url}`;

  async function send() {
    try {
      if (navigator.share) await navigator.share({ title: event.title, text: summary, url });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied — paste it into WhatsApp");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast("Couldn't share from this browser");
    }
  }

  return (
    <Modal open onClose={onClose} title="Share this event">
      <div className="v2 stack8">
        {error && <p className="small red">{error}</p>}
        {!share && !error && <p className="small">Making the link…</p>}
        {share && (
          <>
            <p className="small" style={{ margin: 0 }}>
              Anyone with the link sees this event only: what it is, time, place, what to read and the graphic. No account, no names of who&apos;s going, nothing else in the app.
            </p>
            <div className="row gap8">
              <input className="inp grow" readOnly value={url} aria-label="Share link" onFocus={(e) => e.target.select()} />
              <button
                type="button"
                className="btn btn-o btn-sm"
                aria-label="Copy link"
                onClick={() => navigator.clipboard.writeText(url).then(() => toast("Link copied"))}
              >
                <Copy size={15} />
              </button>
            </div>
            <div className="row gap8">
              <button type="button" className="btn btn-p grow" onClick={send}>
                <Send size={15} /> Send
              </button>
              <button type="button" className="btn btn-o grow" onClick={() => navigator.clipboard.writeText(text).then(() => toast("Message + link copied"))}>
                Copy message
              </button>
            </div>

            {chatUrl && (
              <div className="ask stack6">
                <span className="ask-k">For the branch chat</span>
                <p className="small" style={{ margin: 0 }}>
                  Same page, with a button for comrades to sign in and join the app, landing back on this event. It has the branch code in it, so don&apos;t send this one to contacts.
                </p>
                <button
                  type="button"
                  className="btn btn-o btn-sm"
                  onClick={() => navigator.clipboard.writeText(`${summary}\n\n${chatUrl}`).then(() => toast("Copied for the branch chat"))}
                >
                  <Copy size={15} /> Copy for the branch chat
                </button>
              </div>
            )}

            <div className="ask">
              <span className="ask-k">The picture</span>
              {share.graphic ? (
                // eslint-disable-next-line @next/next/no-img-element -- stored graphic served by our route
                <img src={`/api/share/${share.token}/image?v=${bust}`} alt="The link's graphic" style={{ width: "100%", height: "auto" }} />
              ) : (
                <p className="small" style={{ margin: 0 }}>No picture yet. Links with a picture get more replies.</p>
              )}
              <Link className="btn btn-o btn-sm" href={`/graphic?event=${event.id}&share=${share.id}`} onClick={onClose}>
                <ImageIcon size={15} /> {share.graphic ? "Edit the graphic" : "Make the graphic"}
              </Link>
            </div>

            <div>
              <span className="kicker">Said they&apos;re coming via the link · {viaLink.length}</span>
              <div className="who mt6">
                {viaLink.map((g) => (
                  <span key={g.id} className="whop">
                    {g.name}
                    <button
                      type="button"
                      aria-label={`Remove ${g.name}`}
                      onClick={() => {
                        setGuests((p) => (p ?? []).filter((x) => x.id !== g.id));
                        void del(`/api/event-guests/${g.id}`).catch(() => revalidate("/api/event-guests"));
                      }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {viaLink.length === 0 && <p className="small">Nobody yet.</p>}
              </div>
            </div>

            <button
              type="button"
              className="link"
              style={{ textAlign: "left" }}
              onClick={async () => {
                if (!window.confirm("Turn this link off? It stops working for everyone who has it.")) return;
                try {
                  await del(`/api/shares/${share.id}`);
                  toast("Link turned off");
                  onClose();
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Couldn't turn it off");
                }
              }}
            >
              Turn this link off
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
