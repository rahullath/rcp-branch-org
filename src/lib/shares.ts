import { createHash, randomBytes } from "node:crypto";
import type { Actor } from "./auth";
import type { AgendaItem, Event, EventShare, ReadingGroup, SharedRead, ShareRsvp } from "./types";
import { mainDiscussion } from "./types";
import { isSupabaseConfigured } from "./config";
import { deleteRow, findRow, insertRow, listRows, updateRow } from "./dev-store";
import { createClient } from "./supabase/server";

/*
 * Share links: one unguessable token per event, opening a page with that
 * event and nothing else, no account needed. Members manage links normally
 * (RLS); the public side only goes through get_share / get_share_image /
 * add_share_rsvp, which take the token and return that event's
 * public fields — never attendee names or other rows.
 */

export interface PublicShare {
  id: string;
  token: string;
  graphic: EventShare["graphic"];
  has_image: boolean;
  event: Pick<Event, "id" | "title" | "event_type" | "start_time" | "meetup_time" | "location" | "description" | "status" | "target">;
  /** What a contact needs to know: the meeting's topic and reading, or the reading group's book. */
  brief?: ShareBrief | null;
  going: number;
}

export interface ShareBrief {
  topic: string | null;
  about: string | null;
  /** Prep links, the event's main reading first. */
  reading: { label: string; url: string; kind?: string | null }[];
  book: string | null;
  section: string | null;
}

const newToken = () => randomBytes(16).toString("base64url");
const now = () => new Date().toISOString();

/* ----------------------------- members ----------------------------- */

export async function listShares(): Promise<EventShare[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("event_shares").select("id,event_id,token,graphic,created_by,created_at,revoked_at").is("revoked_at", null);
    return (data ?? []) as EventShare[];
  }
  return listRows<EventShare>("event_shares")
    .filter((s) => !s.revoked_at)
    .map((s) => ({ ...s, image: undefined }));
}

export async function getShare(id: string): Promise<EventShare | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("event_shares").select("*").eq("id", id).maybeSingle();
    return (data as EventShare) ?? null;
  }
  return findRow<EventShare>("event_shares", id) ?? null;
}

/** The event's live link, or a new one. One per event, so everyone shares the same link. */
export async function shareForEvent(actor: Actor, eventId: string): Promise<EventShare> {
  const existing = (await listShares()).find((s) => s.event_id === eventId);
  if (existing) return existing;
  const row = { event_id: eventId, token: newToken(), graphic: null, image: null, created_by: actor.id, created_at: now(), revoked_at: null };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("event_shares").insert(row).select("id,event_id,token,graphic,created_by,created_at,revoked_at").single();
    if (error) throw new Error(error.message);
    return data as EventShare;
  }
  return insertRow<EventShare>("event_shares", row);
}

/** The graphic the link shows — its settings and the rendered picture. */
export async function setShareGraphic(id: string, graphic: EventShare["graphic"], image: string | null) {
  const patch = { graphic, image };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("event_shares").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  updateRow<EventShare>("event_shares", id, patch);
}

/** Turn the link off. A new one can be made; the old token never works again. */
export async function revokeShare(id: string) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("event_shares").update({ revoked_at: now() }).eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  updateRow<EventShare>("event_shares", id, { revoked_at: now() });
}

export async function listShareRsvps(): Promise<ShareRsvp[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("share_rsvps").select("*").order("created_at");
    return (data ?? []) as ShareRsvp[];
  }
  return listRows<ShareRsvp>("share_rsvps");
}

export async function removeShareRsvp(id: string) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("share_rsvps").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  deleteRow("share_rsvps", id);
}

/* ----------------------------- public ----------------------------- */

const liveShare = (token: string) => listRows<EventShare>("event_shares").find((s) => s.token === token && !s.revoked_at);

export async function getPublicShare(token: string): Promise<PublicShare | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_share", { p_token: token });
    return (data as PublicShare) ?? null;
  }
  const s = liveShare(token);
  const e = s ? findRow<Event>("events", s.event_id) : undefined;
  if (!s || !e || e.archived) return null;
  const going =
    listRows<{ event_id: string; status: string; id: string }>("rsvps").filter((r) => r.event_id === e.id && r.status === "going").length +
    listRows<{ event_id: string; status: string; id: string }>("event_guests").filter((g) => g.event_id === e.id && g.status === "going").length +
    listRows<ShareRsvp>("share_rsvps").filter((r) => r.event_id === e.id).reduce((n, r) => n + 1 + (r.extra ?? 0), 0);
  const { id, title, event_type, start_time, meetup_time, location, description, status, target } = e;
  // Same as get_share: the discussion item only (never organisational items or who leads off).
  const item = mainDiscussion(listRows<AgendaItem>("agenda"), e.id);
  const rg = e.reading_group_id ? findRow<ReadingGroup>("reading_groups", e.reading_group_id) : undefined;
  const brief: ShareBrief = {
    topic: item?.title ?? null,
    about: item?.description ?? null,
    reading: (() => {
      const main = listRows<SharedRead>("shared_reads").find((r) => r.event_id === e.id && r.main)?.url;
      const links = (item?.prep_links ?? []).filter((l) => /^https?:/.test(l.url)).slice(0, 8);
      // No discussion item (paper sales, stalls): the readings set for the event itself.
      if (links.length === 0) {
        const own = listRows<SharedRead>("shared_reads").filter((r) => r.event_id === e.id && /^https?:/.test(r.url));
        return [...own.filter((r) => r.main), ...own.filter((r) => !r.main)].slice(0, 8).map((r) => ({ label: r.title, url: r.url, kind: null }));
      }
      return [...links.filter((l) => l.url === main), ...links.filter((l) => l.url !== main)].map((l) => ({ label: l.label, url: l.url, kind: l.kind ?? null }));
    })(),
    book: rg?.book ?? null,
    section: rg?.current_chapter ?? null,
  };
  return { id: s.id, token: s.token, graphic: s.graphic ?? null, has_image: !!s.image, event: { id, title, event_type, start_time, meetup_time, location, description, status, target }, brief, going };
}

export async function getPublicShareImage(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_share_image", { p_token: token });
    return (data as string) ?? null;
  }
  return liveShare(token)?.image ?? null;
}

/**
 * Short fingerprint of the picture. The preview URL carries it, so editing the graphic gives
 * WhatsApp and friends a new URL to fetch instead of the old one they've cached.
 */
export async function getPublicShareImageVersion(token: string): Promise<string> {
  const data = await getPublicShareImage(token);
  return data ? createHash("sha1").update(data).digest("base64url").slice(0, 10) : "0";
}

export async function addPublicRsvp(token: string, name: string, note: string | null, whoSent: string | null = null, extra = 0): Promise<{ ok: boolean; error?: string }> {
  const n = name.trim().slice(0, 60);
  const who = whoSent?.trim().slice(0, 60) || null;
  const more = Number.isFinite(extra) ? Math.max(0, Math.min(5, Math.trunc(extra))) : 0;
  if (!n) return { ok: false, error: "Your name, so they know who's coming" };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("add_share_rsvp", { p_token: token, p_name: n, p_note: note, p_who_sent: who, p_extra: more });
    if (error) return { ok: false, error: "Couldn't save that — try again" };
    return data as { ok: boolean; error?: string };
  }
  const s = liveShare(token);
  const e = s ? findRow<Event>("events", s.event_id) : undefined;
  if (!s || !e) return { ok: false, error: "This link has expired" };
  if (e.status === "off" || Date.parse(e.start_time) < Date.now() - 6 * 3600_000) return { ok: false, error: "This event is no longer taking replies" };
  const mine = listRows<ShareRsvp>("share_rsvps").filter((r) => r.share_id === s.id);
  if (mine.length >= 200) return { ok: false, error: "Full up — message whoever sent you the link" };
  if (!mine.some((r) => r.name.toLowerCase() === n.toLowerCase())) {
    insertRow<ShareRsvp>("share_rsvps", { share_id: s.id, event_id: e.id, name: n, note: note?.trim().slice(0, 300) || null, who_sent: who, extra: more, created_at: now() });
  }
  const going =
    listRows<{ id: string; event_id: string; status: string }>("rsvps").filter((r) => r.event_id === e.id && r.status === "going").length +
    listRows<{ id: string; event_id: string; status: string }>("event_guests").filter((g) => g.event_id === e.id && g.status === "going").length +
    listRows<ShareRsvp>("share_rsvps").filter((r) => r.event_id === e.id).reduce((n, r) => n + 1 + (r.extra ?? 0), 0);
  if (e.status === "tentative" && e.target && going >= e.target) updateRow<Event>("events", e.id, { status: "on" });
  return { ok: true };
}
