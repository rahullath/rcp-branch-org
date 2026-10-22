"use client";

import { useCallback } from "react";
import { useProfiles } from "@/lib/profiles-context";
import type { Comrade } from "@/lib/types";

/** A person's WhatsApp number: their own (if on the app) or the one noted on their People entry. */
export function usePhones() {
  const { profiles } = useProfiles();
  const ofProfile = useCallback((id?: string | null) => (id ? (profiles.find((p) => p.id === id)?.phone ?? null) : null), [profiles]);
  const ofComrade = useCallback((c?: Pick<Comrade, "profile_id" | "phone"> | null) => (c ? (c.profile_id ? ofProfile(c.profile_id) : null) ?? c.phone ?? null : null), [ofProfile]);
  return { ofProfile, ofComrade, profiles };
}
