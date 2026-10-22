import type { Actor } from "./auth";
import type { Announcement, AnnouncementView } from "./types";
import { isLive } from "./announcement-rules";
import { isSupabaseConfigured } from "./config";
import { deleteRow, findRow, insertRow, listRows, updateRow } from "./dev-store";
import { createClient } from "./supabase/server";

/* Announcements and each person's dismissals (schema v35). Reads swallow errors into "none", so screens still work before the migration. */

type Editable = Pick<Announcement, "title" | "body" | "link" | "link_label" | "deadline" | "ends_on" | "tag" | "urgent" | "signed_by">;
type Dismissal = { id: string; user_id: string; announcement_id: string };

/** Newest first, urgent ones on top. Only the ones still live, unless `all`. */
export async function listAnnouncements(actor: Actor, opts: { all?: boolean; tag?: string | null } = {}): Promise<AnnouncementView[]> {
  let rows: Announcement[];
  let dismissed: Set<string>;
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const [a, d] = await Promise.all([
      supabase.from("announcements").select("*").eq("archived", false).order("created_at", { ascending: false }),
      supabase.from("announcement_dismissals").select("announcement_id"),
    ]);
    rows = (a.data ?? []) as Announcement[];
    dismissed = new Set((d.data ?? []).map((x: { announcement_id: string }) => x.announcement_id));
  } else {
    rows = listRows<Announcement>("announcements").filter((r) => !r.archived && (!r.branch_id || r.branch_id === actor.branch?.id)).sort((x, y) => y.created_at.localeCompare(x.created_at));
    dismissed = new Set(listRows<Dismissal>("announcement_dismissals").filter((x) => x.user_id === actor.id).map((x) => x.announcement_id));
  }
  return rows
    .filter((r) => (opts.all || isLive(r)) && (opts.tag === undefined || opts.tag === null ? true : r.tag === opts.tag))
    .map((r) => ({ ...r, dismissed: dismissed.has(r.id) }))
    .sort((x, y) => Number(y.urgent) - Number(x.urgent));
}

export async function createAnnouncement(actor: Actor, input: Editable): Promise<Announcement> {
  const row = { ...input, archived: false, created_by: actor.id, created_at: new Date().toISOString() };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("announcements").insert(row).select().single();
    if (error) throw new Error(error.message);
    return data as Announcement;
  }
  return insertRow<Announcement>("announcements", { ...row, branch_id: actor.branch?.id });
}

export async function updateAnnouncement(id: string, patch: Editable): Promise<Announcement | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("announcements").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Announcement) ?? null;
  }
  return findRow<Announcement>("announcements", id) ? (updateRow<Announcement>("announcements", id, patch) ?? null) : null;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  deleteRow("announcements", id);
}

/** Hide (or bring back) an announcement for this person only. */
export async function setDismissed(actor: Actor, announcementId: string, dismissed: boolean): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const q = dismissed
      ? supabase.from("announcement_dismissals").upsert({ user_id: actor.id, announcement_id: announcementId })
      : supabase.from("announcement_dismissals").delete().eq("user_id", actor.id).eq("announcement_id", announcementId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return;
  }
  const id = `${actor.id}:${announcementId}`;
  if (dismissed) {
    if (!findRow<Dismissal>("announcement_dismissals", id)) insertRow<Dismissal>("announcement_dismissals", { id, user_id: actor.id, announcement_id: announcementId });
  } else deleteRow("announcement_dismissals", id);
}
