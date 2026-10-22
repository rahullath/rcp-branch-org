import webpush from "web-push";
import type { Availability, NotificationPrefs, Profile, PushSubscriptionRow } from "./types";
import { DEFAULT_NOTIFICATION_PREFS } from "./types";
import { isSupabaseConfigured } from "./config";
import { devStore } from "./dev-store";
import { createAdminClient } from "./supabase/server";

/*
 * Web push for the installed PWA. Every notification carries the same
 * answer buttons as its inbox card (Going / Can't, I'll bring / Not me…),
 * handled in public/sw.js, so most asks are answered without opening the app.
 *
 * Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (and, on Supabase,
 * SUPABASE_SERVICE_ROLE_KEY to read other members' subscriptions). Without
 * them every send is a silent no-op — the inbox still works.
 */

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:branch@example.org";

export const isPushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

let vapidSet = false;
function ensureVapid() {
  if (!vapidSet && isPushConfigured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidSet = true;
  }
}

/** What the service worker does with each button. */
type PushAction =
  | { action: "rsvp-going" | "rsvp-no"; title: string }
  | { action: "bring-claim" | "bring-skip"; title: string }
  | { action: `vote-${number}`; title: string }
  | { action: "open"; title: string };

export interface PushPayload {
  title: string;
  body: string;
  /** Opened on tap (and by the "open" action). */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag: string;
  actions?: PushAction[];
  /** Ids the service worker needs to answer from the notification. */
  data?: { eventId?: string; itemId?: string; pollId?: string; options?: string[]; askKey?: string };
}

type PrefKey = Exclude<keyof NotificationPrefs, "quiet_start" | "quiet_end">;

export function prefsOf(profile: Pick<Profile, "notification_prefs"> | null | undefined): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(profile?.notification_prefs ?? {}) };
}

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Quiet hours are in UK time. */
function inQuietHours(prefs: NotificationPrefs, at = new Date()) {
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  const t = minutes(local);
  const start = minutes(prefs.quiet_start);
  const end = minutes(prefs.quiet_end);
  return start <= end ? t >= start && t < end : t >= start || t < end;
}

interface Targets {
  profiles: Profile[];
  subs: PushSubscriptionRow[];
  away: Pick<Availability, "user_id" | "away">[];
}

async function loadTargets(userIds: string[]): Promise<Targets> {
  if (userIds.length === 0) return { profiles: [], subs: [], away: [] };
  if (isSupabaseConfigured) {
    const admin = createAdminClient();
    if (!admin) return { profiles: [], subs: [], away: [] };
    const [p, s, a] = await Promise.all([
      admin.from("profiles").select("id, notification_prefs").in("id", userIds),
      admin.from("push_subscriptions").select("*").in("user_id", userIds),
      admin.from("availability").select("user_id, away").eq("activity", "general").in("user_id", userIds),
    ]);
    return {
      profiles: (p.data ?? []) as Profile[],
      subs: (s.data ?? []) as PushSubscriptionRow[],
      away: (a.data ?? []) as Targets["away"],
    };
  }
  const db = devStore.load();
  return {
    profiles: db.profiles.filter((p) => userIds.includes(p.id)),
    subs: db.push_subscriptions.filter((s) => userIds.includes(s.user_id)),
    away: db.availability.filter((r) => r.activity === "general" && userIds.includes(r.user_id)),
  };
}

/** Exams or trips: no nudges on days someone marked themselves away. */
function isAway(rows: Targets["away"], userId: string, at = new Date()) {
  const today = at.toISOString().slice(0, 10);
  // Whole days only: "can't do 2–5pm" shouldn't mute the rest of the day.
  return rows.some((r) => r.user_id === userId && (r.away ?? []).some((a) => !a.start && a.from <= today && today <= a.to));
}

async function dropSubscription(endpoint: string) {
  if (isSupabaseConfigured) {
    await createAdminClient()?.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return;
  }
  const db = devStore.load();
  db.push_subscriptions = db.push_subscriptions.filter((s) => s.endpoint !== endpoint);
  devStore.save(db);
}

/**
 * Push to these members, respecting each one's toggle for `pref` and their
 * quiet hours. Never throws — a failed push must not fail the request that
 * triggered it. Returns how many devices it reached.
 */
export async function sendPush(userIds: string[], pref: PrefKey, payload: PushPayload): Promise<number> {
  if (!isPushConfigured) return 0;
  try {
    ensureVapid();
    const unique = [...new Set(userIds)];
    const { profiles, subs, away } = await loadTargets(unique);
    const allowed = new Set(
      unique.filter((id) => {
        const prefs = prefsOf(profiles.find((p) => p.id === id));
        return prefs[pref] && !inQuietHours(prefs) && !isAway(away, id);
      }),
    );
    const body = JSON.stringify(payload);
    let sent = 0;
    await Promise.all(
      subs
        .filter((s) => allowed.has(s.user_id))
        .map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 6 * 3600 });
            sent++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) await dropSubscription(s.endpoint);
            else console.error("[push]", status, (e as Error).message);
          }
        }),
    );
    return sent;
  } catch (e) {
    console.error("[push]", e);
    return 0;
  }
}

/** True the first time a key is seen — so the reminder cron never sends the same reminder twice. */
export async function claimOnce(key: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const admin = createAdminClient();
    if (!admin) return false;
    const { error } = await admin.from("push_log").insert({ key });
    return !error;
  }
  const db = devStore.load();
  if (db.push_log.some((r) => r.id === key)) return false;
  db.push_log.push({ id: key, created_at: new Date().toISOString() });
  devStore.save(db);
  return true;
}

/**
 * Everyone who should hear about something: one branch's members, or — for
 * district/national things (pass null) — every member of every branch.
 */
/** Officers in the branch, plus anyone invited to a committee meeting. */
export async function committeeIds(branchId: string | null, invitees: string[]): Promise<string[]> {
  let rows: { id: string; role: string[]; branch_id?: string | null }[];
  if (isSupabaseConfigured) {
    const admin = createAdminClient();
    if (!admin) return invitees;
    let q = admin.from("profiles").select("id,role,branch_id").not("branch_id", "is", null);
    if (branchId) q = q.eq("branch_id", branchId);
    rows = ((await q).data ?? []) as typeof rows;
  } else {
    rows = devStore.load().profiles.filter((p) => !branchId || (p.branch_id ?? null) === branchId || !p.branch_id);
  }
  return [...new Set([...rows.filter((p) => (p.role ?? []).some((r) => r !== "member")).map((p) => p.id), ...invitees])];
}

export async function allMemberIds(branchId: string | null = null): Promise<string[]> {
  if (isSupabaseConfigured) {
    const admin = createAdminClient();
    if (!admin) return [];
    let q = admin.from("profiles").select("id").not("branch_id", "is", null);
    if (branchId) q = q.eq("branch_id", branchId);
    const { data } = await q;
    return ((data ?? []) as { id: string }[]).map((p) => p.id);
  }
  return devStore
    .load()
    .profiles.filter((p) => !branchId || (p.branch_id ?? null) === branchId || !p.branch_id)
    .map((p) => p.id);
}
