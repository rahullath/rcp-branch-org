import { randomBytes } from "node:crypto";
import type { Actor } from "./auth";
import type { Event, Role, RoleRequest, Rsvp } from "./types";
import { isSupabaseConfigured } from "./config";
import { findRow, insertRow, listRows, updateRow } from "./dev-store";
import { createClient } from "./supabase/server";
import { updateProfile } from "./data";

/*
 * Onboarding's server side: role requests the general secretary confirms,
 * the "done" stamp, and each person's private calendar-feed link.
 */

const now = () => new Date().toISOString();

/* ----------------------------- role requests ----------------------------- */

/** Yours, or (general secretary) everyone's in the branch — RLS decides. */
export async function listRoleRequests(): Promise<RoleRequest[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("role_requests").select("*").order("created_at", { ascending: false });
    return (data ?? []) as RoleRequest[];
  }
  return listRows<RoleRequest>("role_requests");
}

export async function requestRole(actor: Actor, role: Role, note: string | null): Promise<RoleRequest> {
  const row = { user_id: actor.id, role, note, status: "pending" as const, created_at: now() };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("role_requests").insert(row).select().single();
    if (error) throw new Error(error.message);
    return data as RoleRequest;
  }
  return insertRow<RoleRequest>("role_requests", row);
}

export async function getRoleRequest(id: string): Promise<RoleRequest | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("role_requests").select("*").eq("id", id).maybeSingle();
    return (data as RoleRequest) ?? null;
  }
  return findRow<RoleRequest>("role_requests", id) ?? null;
}

export async function decideRoleRequest(actor: Actor, id: string, approve: boolean): Promise<RoleRequest | null> {
  const patch = { status: approve ? ("approved" as const) : ("declined" as const), decided_by: actor.id, decided_at: now() };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("role_requests").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data as RoleRequest;
  }
  return updateRow<RoleRequest>("role_requests", id, patch) ?? null;
}

export const markOnboarded = (actor: Actor) => updateProfile(actor.id, { onboarded_at: now() });

/* ----------------------------- calendar feed ----------------------------- */

const newToken = () => randomBytes(18).toString("base64url");

/** Your feed token, made on first ask. `fresh` replaces it (the old link stops working). */
export async function calendarToken(actor: Actor, fresh = false): Promise<string> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    if (!fresh) {
      const { data } = await supabase.from("calendar_tokens").select("token").eq("user_id", actor.id).maybeSingle();
      if (data?.token) return data.token as string;
    }
    const token = newToken();
    const { error } = await supabase.from("calendar_tokens").upsert({ user_id: actor.id, token, created_at: now() });
    if (error) throw new Error(error.message);
    return token;
  }
  const existing = findRow<{ id: string; token: string }>("calendar_tokens", actor.id);
  if (existing && !fresh) return existing.token;
  const token = newToken();
  if (existing) updateRow<{ id: string; token: string }>("calendar_tokens", actor.id, { token });
  else insertRow("calendar_tokens", { id: actor.id, user_id: actor.id, token, created_at: now() });
  return token;
}

export type FeedEvent = Pick<Event, "id" | "title" | "event_type" | "start_time" | "meetup_time" | "location" | "description" | "status" | "target"> & {
  mine: Rsvp["status"] | null;
};

/** The events a feed token shows — through calendar_feed(), no session needed. */
export async function calendarFeed(token: string): Promise<FeedEvent[] | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
    if (error) return null;
    return (data ?? []) as FeedEvent[];
  }
  const t = listRows<{ id: string; user_id: string; token: string }>("calendar_tokens").find((x) => x.token === token);
  if (!t) return null;
  const since = Date.now() - 30 * 86400_000;
  const rsvps = listRows<Rsvp & { id: string }>("rsvps");
  return listRows<Event>("events")
    .filter((e) => {
      if (e.archived || Date.parse(e.start_time) <= since) return false;
      if (e.event_type !== "committee") return true;
      const me = listRows<{ id: string; role: string[] }>("profiles").find((p) => p.id === t.user_id);
      return !!me?.role.some((r) => r !== "member") || (e.invitees ?? []).includes(t.user_id);
    })
    .map((e) => ({ ...e, mine: rsvps.find((r) => r.event_id === e.id && r.user_id === t.user_id)?.status ?? null }));
}
