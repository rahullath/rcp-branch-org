"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { del, patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { hasAnyRole } from "@/lib/permissions";
import { daysLeft } from "@/lib/announcement-rules";
import type { AnnouncementView } from "@/lib/types";
import { useToast } from "./toast";

type Draft = { title: string; body: string; link: string; link_label: string; deadline: string; ends_on: string; urgent: boolean; signed_by: string };
const EMPTY: Draft = { title: "", body: "", link: "", link_label: "", deadline: "", ends_on: "", urgent: false, signed_by: "" };
const toDraft = (a: AnnouncementView): Draft => ({
  title: a.title,
  body: a.body,
  link: a.link ?? "",
  link_label: a.link_label ?? "",
  deadline: a.deadline ?? "",
  ends_on: a.ends_on ?? "",
  urgent: a.urgent,
  signed_by: a.signed_by ?? "",
});

const WRITERS = ["social_media_officer", "organizer", "general_secretary"] as const;
export const useCanAnnounce = () => hasAnyRole(useActor(), ...WRITERS);

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** One announcement: its words, a countdown if it has a deadline, and a button if it has a link. */
function Card({ a, onDismiss, onEdit, onRemove }: { a: AnnouncementView; onDismiss?: () => void; onEdit?: () => void; onRemove?: () => void }) {
  const left = a.deadline ? daysLeft(a.deadline) : null;
  return (
    <div className="ask" style={{ display: "block", ...(a.urgent ? { borderColor: "var(--red)" } : {}) }}>
      <span className="row gap8" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="t" style={{ display: "block" }}>
          {a.title}
        </span>
        {onDismiss && (
          <button type="button" className="btn-ic sm" onClick={onDismiss} aria-label={`Hide “${a.title}”`}>
            <X size={14} strokeWidth={2.25} />
          </button>
        )}
      </span>
      {left !== null && a.deadline && (
        <span className={"small" + (left <= 7 ? " red" : "")} style={{ display: "block", fontWeight: 700 }}>
          {left < 0 ? "The deadline has passed" : left === 0 ? "Last day: today" : `${left} day${left === 1 ? "" : "s"} left`} · by {dayLabel(a.deadline)}
        </span>
      )}
      {a.body && (
        <span className="small" style={{ display: "block", whiteSpace: "pre-line", marginTop: 6, lineHeight: 1.5 }}>
          {a.body}
        </span>
      )}
      {a.signed_by && (
        <span className="small" style={{ display: "block", marginTop: 6 }}>
          — {a.signed_by}
        </span>
      )}
      {a.link && (
        <a className="btn btn-p" href={a.link} target="_blank" rel="noopener noreferrer" style={{ marginTop: 8, display: "inline-flex", gap: 6 }}>
          {a.link_label || "Open the link"} <ExternalLink size={14} strokeWidth={2.25} />
        </a>
      )}
      {(onEdit || onRemove) && (
        <span className="small" style={{ display: "flex", gap: 14, marginTop: 8 }}>
          {onEdit && (
            <button type="button" className="link" onClick={onEdit}>
              Edit
            </button>
          )}
          {onRemove && (
            <button type="button" className="link" onClick={onRemove}>
              Remove
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function Form({ draft, setDraft, onSave, onCancel, busy }: { draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  return (
    <div className="stack6">
      <input className="inp" value={draft.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder="Title, e.g. Open meeting this Wednesday" aria-label="Title" />
      <textarea className="inp" style={{ height: 140, padding: 10, lineHeight: 1.45 }} value={draft.body} onChange={(e) => set("body", e.target.value)} placeholder="What people need to know" aria-label="Message" />
      <input className="inp" value={draft.link} onChange={(e) => set("link", e.target.value)} placeholder="Button link (https://…), optional" inputMode="url" aria-label="Link" />
      {draft.link && <input className="inp" value={draft.link_label} maxLength={40} onChange={(e) => set("link_label", e.target.value)} placeholder="Button words, e.g. Book a place" aria-label="Button words" />}
      <div className="row gap8">
        <label className="small grow">
          Deadline
          <input className="inp" type="date" value={draft.deadline} onChange={(e) => set("deadline", e.target.value)} />
        </label>
        <label className="small grow">
          Hide after
          <input className="inp" type="date" value={draft.ends_on} onChange={(e) => set("ends_on", e.target.value)} />
        </label>
      </div>
      <input className="inp" value={draft.signed_by} maxLength={80} onChange={(e) => set("signed_by", e.target.value)} placeholder="From (name), optional" aria-label="From" />
      <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={draft.urgent} onChange={(e) => set("urgent", e.target.checked)} />
        Mark as urgent (red outline, shown first)
      </label>
      <div className="row gap8">
        <button type="button" className="btn btn-o grow" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-p grow" onClick={onSave} disabled={busy || !draft.title.trim()}>
          Save
        </button>
      </div>
    </div>
  );
}

/**
 * A list of announcements with the controls officers need: add, edit, remove. `tag` keeps a group
 * (e.g. the festival's) separate from the rest; without one it shows everything, including ones past
 * their end for the officers who manage them.
 */
export function AnnouncementSection({ title, tag, emptyHint }: { title: string; tag?: string; emptyHint?: string }) {
  const toast = useToast();
  const canEdit = useCanAnnounce();
  const url = `/api/announcements?${tag ? `tag=${tag}&` : ""}${canEdit ? "all=1" : ""}`;
  const { data } = useData<AnnouncementView[]>(url);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const list = data ?? [];

  async function save() {
    setBusy(true);
    try {
      const body = { ...draft, tag: tag ?? null };
      if (editing === "new") await post("/api/announcements", body);
      else await patch(`/api/announcements/${editing}`, body);
      revalidate("/api/announcements", url);
      setEditing(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save it");
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: AnnouncementView) {
    if (!window.confirm(`Remove “${a.title}” for everyone?`)) return;
    try {
      await del(`/api/announcements/${a.id}`);
      revalidate("/api/announcements", url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't remove it");
    }
  }

  if (!canEdit && list.length === 0) return null;

  return (
    <section>
      <div className="sh">
        <h2>{title}</h2>
        {canEdit && editing === null && (
          <button type="button" className="link" onClick={() => (setDraft(EMPTY), setEditing("new"))}>
            Add
          </button>
        )}
      </div>
      <div className="stack6">
        {list.map((a) => (editing === a.id ? null : <Card key={a.id} a={a} onEdit={canEdit ? () => (setDraft(toDraft(a)), setEditing(a.id)) : undefined} onRemove={canEdit ? () => remove(a) : undefined} />))}
        {list.length === 0 && editing === null && <p className="small">{emptyHint ?? "Nothing yet."}</p>}
        {editing !== null && canEdit && <Form draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} busy={busy} />}
      </div>
    </section>
  );
}

/** The top of Home: up to three live announcements you haven't dismissed, with a way to the rest. */
export function HomeAnnouncements({ exceptTag }: { exceptTag?: string }) {
  const toast = useToast();
  const canEdit = useCanAnnounce();
  const { data, setData } = useData<AnnouncementView[]>("/api/announcements");
  const open = (data ?? []).filter((a) => !a.dismissed && a.tag !== exceptTag);
  const shown = open.slice(0, 3);
  if (shown.length === 0 && !canEdit) return null;

  async function dismiss(a: AnnouncementView) {
    setData((prev) => (prev ?? []).map((x) => (x.id === a.id ? { ...x, dismissed: true } : x)));
    try {
      await post(`/api/announcements/${a.id}/dismiss`, {});
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't hide it");
      revalidate("/api/announcements");
    }
  }

  return (
    <section>
      {shown.length > 0 && (
        <div className="stack6">
          {shown.map((a) => (
            <Card key={a.id} a={a} onDismiss={() => dismiss(a)} />
          ))}
        </div>
      )}
      <p className="small" style={{ display: "flex", gap: 14, margin: "6px 0 0" }}>
        {open.length > shown.length && (
          <Link className="link" href="/announcements">
            {open.length - shown.length} more
          </Link>
        )}
        {canEdit && (
          <Link className="link" href="/announcements">
            Post an announcement
          </Link>
        )}
      </p>
    </section>
  );
}
