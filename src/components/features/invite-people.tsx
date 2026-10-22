"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { del, patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { dayLabel } from "@/lib/dates";
import { shareUrl } from "@/lib/share-url";
import { CONTACT_STAGES, contactTier, type Contact, type Event, type EventInvite } from "@/lib/types";
import { waLink } from "@/lib/utils";
import { firstPart, fmtTime, SectionHead } from "./primitives";
import { useToast } from "./toast";

/**
 * One personal WhatsApp to a contact with the event's public link, recorded
 * as an invite (so the inbox can ask afterwards whether they came). Opening
 * WhatsApp is the logging: nothing else to tap.
 */
export function useInviteContact() {
  const actor = useActor();
  const toast = useToast();
  return async (event: Pick<Event, "id" | "title" | "start_time" | "location">, c: Pick<Contact, "id" | "name" | "phone">): Promise<EventInvite | null> => {
    const win = window.open("", "_blank");
    try {
      const now = Date.now();
      const url = await shareUrl(event.id);
      const first = c.name.split(/\s+/)[0];
      const me = (actor?.name ?? "").replace(/^Comrade\s+/i, "").split(" ")[0];
      const when = `${dayLabel(event.start_time, now).toLowerCase()} at ${fmtTime(event.start_time)}`;
      const text = `Hi ${first}, it's ${me}. We're doing ${firstPart(event.title, " — ")} ${when}${event.location ? `, ${firstPart(event.location, ",")}` : ""}. Would you like to come? ${url}`;
      if (win) win.location.href = waLink(c.phone, text);
      const created = await post<EventInvite>("/api/event-invites", { event_id: event.id, contact_id: c.id });
      void patch(`/api/contacts/${c.id}`, { touched: true }).catch(() => undefined);
      void post(`/api/contacts/${c.id}/notes`, { text: `Invited to ${firstPart(event.title, " — ")} (${dayLabel(event.start_time, now)})` }).catch(() => undefined);
      revalidate("/api/event-invites", "/api/inbox");
      return created;
    } catch (e) {
      win?.close();
      toast(e instanceof Error ? e.message : "Couldn't make the invite");
      return null;
    }
  };
}

/** "Fancy a coffee?" — a 1-on-1 is often the better next step than another meeting. */
export function oneToOneLink(c: Pick<Contact, "name" | "phone">, from: string) {
  return waLink(c.phone, `Hi ${c.name.split(/\s+/)[0]}, it's ${from}. Are you free for a coffee this week? Would be good to catch up properly.`);
}

const TIER_ORDER = { priority: 0, potential: 1, cold: 2 } as const;
const SAID: [EventInvite["status"], string][] = [
  ["coming", "Coming"],
  ["maybe", "Maybe"],
  ["no", "Can't"],
];

/**
 * Invite your own contacts to this event, one personal WhatsApp message
 * each (not a group chat), and keep track of who said yes. Afterwards the
 * inbox asks who came, which moves them along towards joining. Everyone
 * sees the branch's totals; only you see your names.
 */
export function InviteYourPeople({ event, live }: { event: Event; live: boolean }) {
  const actor = useActor();
  const toast = useToast();
  const { data: contacts } = useData<Contact[]>("/api/contacts");
  const { data: invites, setData } = useData<EventInvite[]>("/api/event-invites");
  const [showCold, setShowCold] = useState(false);
  const [open, setOpen] = useState(false);

  const here = (invites ?? []).filter((i) => i.event_id === event.id);
  const mine = new Map(here.filter((i) => i.invited_by === actor?.id).map((i) => [i.contact_id, i]));
  const list = (contacts ?? [])
    .filter((c) => !c.archived && c.stage !== "joined")
    .sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)) || TIER_ORDER[contactTier(a)] - TIER_ORDER[contactTier(b)] || a.name.localeCompare(b.name));
  const warm = list.filter((c) => contactTier(c) !== "cold" || mine.has(c.id));
  const cold = list.filter((c) => contactTier(c) === "cold" && !mine.has(c.id));
  const total = { invited: here.length, coming: here.filter((i) => i.status === "coming").length, came: here.filter((i) => i.status === "came").length };

  const sendInvite = useInviteContact();
  async function invite(c: Contact) {
    const created = await sendInvite(event, c);
    if (created) setData((p) => [...(p ?? []).filter((x) => x.id !== created.id), created]);
  }

  async function said(inv: EventInvite, status: EventInvite["status"]) {
    const next = inv.status === status ? "invited" : status;
    setData((p) => (p ?? []).map((x) => (x.id === inv.id ? { ...x, status: next } : x)));
    try {
      await patch(`/api/event-invites/${inv.id}`, { status: next });
      if (next === "came") revalidate("/api/contacts");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
      revalidate("/api/event-invites");
    }
  }

  async function remove(inv: EventInvite) {
    setData((p) => (p ?? []).filter((x) => x.id !== inv.id));
    await del(`/api/event-invites/${inv.id}`).catch(() => revalidate("/api/event-invites"));
  }

  const row = (c: Contact) => {
    const inv = mine.get(c.id);
    const stage = CONTACT_STAGES.find((s) => s.value === (c.stage ?? "met"))?.label;
    return (
      <div key={c.id} className="li" style={{ flexWrap: "wrap" }}>
        <div className="grow min0">
          <p className="t">{c.name}</p>
          <p className="small">
            {stage}
            {inv ? ` · invited` : ""}
            {!c.phone ? " · no number" : ""}
          </p>
        </div>
        {inv ? (
          <div className="row gap6 wrap">
            {(live ? SAID : ([["came", "Came"], ["missed", "Didn't"]] as [EventInvite["status"], string][])).map(([v, label]) => (
              <button key={v} type="button" className={"btn btn-sm " + (inv.status === v ? "btn-p" : "btn-o")} aria-pressed={inv.status === v} onClick={() => said(inv, v)}>
                {label}
              </button>
            ))}
            {live && inv.status === "invited" && (
              <button type="button" className="link small" onClick={() => remove(inv)}>
                Undo
              </button>
            )}
          </div>
        ) : live && c.phone ? (
          <button type="button" className="btn btn-o btn-sm" onClick={() => invite(c)}>
            <Send size={14} /> Invite
          </button>
        ) : null}
      </div>
    );
  };

  if (!live && mine.size === 0 && total.invited === 0) return null;
  // No contacts of your own: nothing to invite, so nothing to show.
  if (contacts && list.length === 0 && total.invited === 0) return null;

  return (
    <section>
      <SectionHead title="Invite your people" action={open ? "Hide" : warm.length || mine.size ? "Show" : undefined} onAction={() => setOpen((v) => !v)} />
      <p className="small" style={{ marginTop: 0 }}>
        {total.invited ? `Branch: ${total.invited} ${total.invited === 1 ? "contact" : "contacts"} invited · ${total.coming} coming${total.came ? ` · ${total.came} came` : ""}. ` : ""}
        {mine.size ? `You've invited ${mine.size}. ` : ""}
        {live ? "One message each, from you. They get the public link, no account needed." : ""}
      </p>
      {open && (
        <div className="stack6">
          {warm.length === 0 && cold.length === 0 && <p className="nothing">No contacts yet. Log people you meet and they&apos;ll show here.</p>}
          {warm.map(row)}
          {cold.length > 0 &&
            (showCold ? (
              cold.map(row)
            ) : (
              <button type="button" className="link small" style={{ alignSelf: "flex-start" }} onClick={() => setShowCold(true)}>
                Show {cold.length} cold contacts too
              </button>
            ))}
        </div>
      )}
    </section>
  );
}
