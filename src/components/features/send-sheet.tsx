"use client";

import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import type { Comrade, Contact, FollowUp } from "@/lib/types";
import { contactOwner, contactTier } from "@/lib/types";
import { waLink } from "@/lib/utils";
import { Modal } from "@/components/ui";
import { useToast } from "./toast";
import { usePhones } from "./phones";

/**
 * Send an article/video/podcast to the people you're bringing in: your
 * contacts and the people you follow up (one tap opens WhatsApp to them;
 * follow-ups are logged as a catch-up), or any comrade who's added their
 * number. Sending something to read is the easiest reason to get in touch.
 */
export function SendSheet({ item, onClose }: { item: { title: string; url: string }; onClose: () => void }) {
  const actor = useActor();
  const toast = useToast();
  const [msg, setMsg] = useState(`Thought you'd find this interesting: ${item.title}\n${item.url}`);
  const { data: contacts } = useData<Contact[]>("/api/contacts");
  const { data: followUps } = useData<FollowUp[]>("/api/follow-ups");
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const { ofComrade, profiles } = usePhones();

  const mine = (contacts ?? []).filter((c) => contactOwner(c) === actor?.id && !c.archived && contactTier(c) !== "cold" && c.phone);
  const people = (followUps ?? []).filter((f) => f.follower_id === actor?.id);
  const personOf = (f: FollowUp) => (comrades ?? []).find((c) => c.id === f.person_id);
  const personName = (f: FollowUp) => personOf(f)?.name ?? "Someone";
  const followNumbers = people.filter((f) => ofComrade(personOf(f)));
  const followNoNumber = people.filter((f) => !ofComrade(personOf(f)));
  const followed = new Set(people.map((f) => personOf(f)?.profile_id).filter(Boolean));
  const withNumber = profiles.filter((p) => p.phone && p.id !== actor?.id && !followed.has(p.id));
  const shownComrades = q.trim() ? withNumber.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())) : withNumber;

  const waButton = (key: string, phone: string, onSend: () => void) => (
    <a
      className={"btn btn-sm " + (sent.includes(key) ? "btn-o" : "btn-p")}
      href={waLink(phone, msg)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        setSent((p) => [...p, key]);
        onSend();
      }}
    >
      <MessageCircle size={14} /> {sent.includes(key) ? "Sent" : "Send"}
    </a>
  );

  async function shareToPeople() {
    try {
      if (navigator.share) await navigator.share({ text: msg });
      else {
        await navigator.clipboard.writeText(msg);
        toast("Copied — paste it to them");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    await Promise.all(picked.map((id) => patch(`/api/follow-ups/${id}`, { touch: true, note: `Sent: ${item.title}`.slice(0, 280) }).catch(() => null)));
    if (picked.length) {
      revalidate("/api/follow-ups", "/api/inbox");
      toast(`Logged as a catch-up with ${picked.length}`);
      setPicked([]);
    }
  }

  return (
    <Modal open onClose={onClose} title="Send it">
      <div className="screen stack8">
        <ShareWithBranch item={item} />
        <textarea className="inp" style={{ height: 90, padding: 10 }} value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Message" />

        {mine.length > 0 && (
          <div>
            <span className="kicker">Your contacts · opens WhatsApp</span>
            <div className="list mt6">
              {mine.map((c) => {
                const digits = (c.phone ?? "").replace(/\D/g, "");
                return (
                  <div key={c.id} className="li">
                    <span className="grow t">{c.name}</span>
                    <a
                      className={"btn btn-sm " + (sent.includes(c.id) ? "btn-o" : "btn-p")}
                      href={`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        setSent((p) => [...p, c.id]);
                        void patch(`/api/contacts/${c.id}`, { touched: true }).catch(() => null);
                        revalidate("/api/contacts");
                      }}
                    >
                      <MessageCircle size={14} /> {sent.includes(c.id) ? "Sent" : "Send"}
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {followNumbers.length > 0 && (
          <div>
            <span className="kicker">People you follow up · logged as a catch-up</span>
            <div className="list mt6">
              {followNumbers.map((f) => (
                <div key={f.id} className="li">
                  <span className="grow t">{personName(f)}</span>
                  {waButton(f.id, ofComrade(personOf(f))!, () => {
                    void patch(`/api/follow-ups/${f.id}`, { touch: true, note: `Sent: ${item.title}`.slice(0, 280) }).catch(() => null);
                    revalidate("/api/follow-ups", "/api/inbox");
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {followNoNumber.length > 0 && (
          <div>
            <span className="kicker">{followNumbers.length ? "No number yet · share, then it's logged" : "People you follow up · logged as a catch-up"}</span>
            <div className="who mt6">
              {followNoNumber.map((f) => {
                const on = picked.includes(f.id);
                return (
                  <button key={f.id} type="button" className={"chip" + (on ? " on" : "")} aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== f.id) : [...p, f.id]))}>
                    {personName(f)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {withNumber.length > 0 && (
          <div>
            <span className="kicker">Comrades · opens WhatsApp</span>
            {withNumber.length > 6 && <input className="inp mt6" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a comrade" aria-label="Find a comrade" />}
            <div className="list mt6">
              {shownComrades.slice(0, 30).map((p) => (
                <div key={p.id} className="li">
                  <span className="grow t">{p.name}</span>
                  {waButton(`p-${p.id}`, p.phone!, () => {})}
                </div>
              ))}
            </div>
          </div>
        )}

        <button type="button" className="btn btn-p" onClick={shareToPeople}>
          <Send size={15} /> {picked.length ? `Share and log for ${picked.length}` : "Share anywhere"}
        </button>
        {mine.length === 0 && people.length === 0 && withNumber.length === 0 && <p className="small">Nobody with a number yet — Share anywhere still works.</p>}
      </div>
    </Modal>
  );
}

/** In the app: everyone gets it in their inbox (and one push) until they've read it. */
function ShareWithBranch({ item }: { item: { title: string; url: string } }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  if (done) return <p className="small">Shared with the branch · it&apos;s in everyone&apos;s inbox.</p>;
  return (
    <div className="ask stack6">
      <span className="ask-k">Share with the whole branch</span>
      <div className="row gap6">
        <input className="inp grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why read it? (optional)" aria-label="Note" />
        <button
          type="button"
          className="btn btn-p btn-sm"
          onClick={async () => {
            try {
              await post("/api/reads", { url: item.url, title: item.title, note });
              setDone(true);
              revalidate("/api/reads");
            } catch (e) {
              toast(e instanceof Error ? e.message : "Couldn't share it");
            }
          }}
        >
          Share
        </button>
      </div>
    </div>
  );
}
