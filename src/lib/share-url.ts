"use client";

import { post } from "./client";
import type { EventShare } from "./types";

/**
 * The address to put in links people are sent: NEXT_PUBLIC_SITE_URL, so links made on
 * a preview or team address still point at the one people use.
 */
export function publicOrigin(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

const cache = new Map<string, Promise<string>>();

/** The event's public link (no account needed) — what contacts should get, never the app address. */
export function shareUrl(eventId: string): Promise<string> {
  let p = cache.get(eventId);
  if (!p) {
    p = post<EventShare>(`/api/events/${eventId}/share`, {}).then((s) => `${publicOrigin()}/s/${s.token}`);
    p.catch(() => cache.delete(eventId));
    cache.set(eventId, p);
  }
  return p;
}
