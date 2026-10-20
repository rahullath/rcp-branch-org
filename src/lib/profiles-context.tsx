"use client";

import { createContext, useContext, useState } from "react";
import type { Profile } from "@/lib/types";

interface ProfilesContextValue {
  profiles: Profile[];
  setProfiles: (profiles: Profile[]) => void;
}

const ProfilesContext = createContext<ProfilesContextValue | null>(null);

/**
 * Seeded once from the server-rendered `Shell` so every page that needs the
 * branch directory reads/writes one shared list instead of each page (and
 * every `PersonPicker` instance) independently re-fetching `/api/profiles`.
 */
export function ProfilesProvider({ initialProfiles, children }: { initialProfiles: Profile[]; children: React.ReactNode }) {
  const [profiles, setProfiles] = useState(initialProfiles);
  return <ProfilesContext.Provider value={{ profiles, setProfiles }}>{children}</ProfilesContext.Provider>;
}

export function useProfiles(): ProfilesContextValue {
  const ctx = useContext(ProfilesContext);
  if (!ctx) throw new Error("useProfiles must be used within ProfilesProvider");
  return ctx;
}
