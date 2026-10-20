"use client";

import { shareUrl } from "@/lib/share-url";
import { post } from "@/lib/client";

import { useState } from "react";
import { useData } from "@/lib/hooks";
import type { Contact, Event } from "@/lib/types";
import { byStartAsc, dayLabel, isUpcoming } from "@/lib/dates";
import { PersonPicker } from "@/components/person-picker";
import { contactLabelText } from "@/lib/contact-labels";
import { formatDate, formatTime, waLink } from "@/lib/utils";
import { Badge, Button, Field, Icon, Input, Modal, Select, Spinner } from "@/components/ui";

/** Full contact record: about, notes, call/WhatsApp, invite, hand over, delete. */
export function ContactDetail({
  contact,
  canDelete,
  onClose,
  onNote,
  onDelete,
  onHandOver,
  onInvite,
  actorName,
}: {
  contact: Contact;
  canDelete: boolean;
  onClose: () => void;
  onNote: (c: Contact, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onHandOver: (c: Contact, ownerId: string) => Promise<void>;
  onInvite: (c: Contact, note: string) => Promise<void>;
  actorName: string;
}) {
  const [noteText, setNoteText] = useState("");
  const [sending, setSending] = useState(false);
  const [handing, setHanding] = useState(false);
  const [newOwner, setNewOwner] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const { data: events } = useData<Event[]>("/api/events");

  const nextEvents = (events ?? [])
    .filter((e) => isUpcoming(e, now) && e.event_type !== "committee")
    .sort(byStartAsc)
    .slice(0, 8);

  async function submitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSending(true);
    try {
      await onNote(contact, noteText.trim());
      setNoteText("");
    } finally {
      setSending(false);
    }
  }

  /** Opens WhatsApp with the invite pre-written, and logs it so follow-up has a trail. */
  async function invite(eventId: string) {
    const ev = nextEvents.find((e) => e.id === eventId);
    if (!ev || !contact.phone) return;
    const win = window.open("", "_blank");
    try {
      // Public link: contacts have no account.
      const url = await shareUrl(ev.id);
      const first = contact.name.split(/\s+/)[0];
      const text = `Hi ${first}, it's ${actorName.replace(/^Comrade\s+/i, "").split(" ")[0]}. We're doing ${ev.title.split(" — ")[0]} ${dayLabel(ev.start_time, now).toLowerCase()} at ${formatTime(ev.start_time)}${ev.location ? `, ${ev.location.split(",")[0]}` : ""}. Would you like to come? ${url}`;
      if (win) win.location.href = waLink(contact.phone, text);
      await post("/api/event-invites", { event_id: ev.id, contact_id: contact.id }).catch(() => undefined);
      void onInvite(contact, `Invited to ${ev.title.split(" — ")[0]} (${dayLabel(ev.start_time, now)})`);
    } catch {
      win?.close();
    }
  }

  async function confirmHandOver() {
    if (!newOwner) return;
    setError("");
    try {
      await onHandOver(contact, newOwner);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not hand over");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={contact.name}
      footer={
        canDelete ? (
          <Button variant="danger" onClick={() => onDelete(contact.id)}>
            <Icon name="delete" /> Delete
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {contact.consent_given_at ? (
          <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <Icon name="verified_user" className="text-sm" /> Consent recorded {formatDate(contact.consent_given_at)}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-error">
            <Icon name="warning" className="text-sm" /> No consent on record — logged before this was required
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {(contact.labels ?? []).map((l) => (
            <Badge key={l} tone="neutral">{contactLabelText(l)}</Badge>
          ))}
          {contact.location_type && (
            <Badge tone="neutral">{contact.location_type.replace(/_/g, " ")}</Badge>
          )}
        </div>

        {contact.about && (
          <div>
            <p className="font-label-md text-xs font-bold uppercase text-on-surface-variant">About</p>
            <p className="mt-1 text-sm text-on-surface">{contact.about}</p>
          </div>
        )}
        {contact.what_worked && (
          <div>
            <p className="font-label-md text-xs font-bold uppercase text-on-surface-variant">What landed</p>
            <p className="mt-1 text-sm text-on-surface">{contact.what_worked}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {contact.phone && (
            <a href={waLink(contact.phone)} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm"><Icon name="chat" /> WhatsApp</Button>
            </a>
          )}
          <a href={`tel:${contact.phone ?? ""}`}>
            <Button variant="outline" size="sm" disabled={!contact.phone}><Icon name="call" /> Call</Button>
          </a>
        </div>

        {contact.phone && nextEvents.length > 0 && (
          <Field label="Invite to an event" hint="Opens WhatsApp with the message written for you">
            <Select value="" onChange={(e) => e.target.value && invite(e.target.value)}>
              <option value="">Choose an event…</option>
              {nextEvents.map((e) => (
                <option key={e.id} value={e.id}>
                  {dayLabel(e.start_time, now)} {formatTime(e.start_time)} — {e.title}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div>
          <p className="font-label-md text-xs font-bold uppercase text-on-surface-variant">Notes</p>
          <div className="mt-2 space-y-2">
            {(contact.notes ?? []).length === 0 && (
              <p className="text-sm text-on-surface-variant">No notes yet.</p>
            )}
            {(contact.notes ?? []).map((n, i) => (
              <div key={i} className="rounded-none border-l-2 border-l-primary bg-surface-container p-3">
                <p className="text-sm text-on-surface">{n.text}</p>
                <p className="mt-1 text-[11px] text-on-surface-variant">
                  {n.created_at ? formatDate(n.created_at) : "—"}
                </p>
              </div>
            ))}
          </div>
          <form onSubmit={submitNote} className="mt-3 flex gap-2">
            <Input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note…"
              className="flex-1"
            />
            <Button type="submit" disabled={sending || !noteText.trim()} className="px-4">
              {sending ? <Spinner className="h-4 w-4" /> : <Icon name="send" />}
            </Button>
          </form>
        </div>

        <div className="border-t border-paper-shadow pt-3">
          {!handing ? (
            <button
              type="button"
              onClick={() => setHanding(true)}
              className="flex min-h-10 items-center gap-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:text-primary"
            >
              <Icon name="swap" className="text-base" /> Hand over to another comrade
            </button>
          ) : (
            <div className="space-y-2">
              <Field label="Hand over to" hint="They'll see this contact (and its notes) in their list; it leaves yours.">
                <PersonPicker mode="id" value={newOwner} onChange={setNewOwner} placeholder="Start typing a comrade's name…" />
              </Field>
              {error && <p className="text-sm font-medium text-error">{error}</p>}
              <div className="flex gap-2">
                <Button size="sm" disabled={!newOwner} onClick={confirmHandOver}>Hand over</Button>
                <Button size="sm" variant="ghost" onClick={() => { setHanding(false); setNewOwner(null); }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
