"use client";

import { createContext, useContext } from "react";
import type { Actor } from "@/lib/auth";

const ActorContext = createContext<Actor | null>(null);

/**
 * Seeded once from the server-rendered `Shell` (which already calls
 * `getActor()` to render the sidebar) so every page that needs "who's
 * signed in" reads from context instead of independently re-fetching
 * `/api/me` on every navigation.
 */
export function ActorProvider({ actor, children }: { actor: Actor | null; children: React.ReactNode }) {
  return <ActorContext.Provider value={actor}>{children}</ActorContext.Provider>;
}

export function useActor(): Actor | null {
  return useContext(ActorContext);
}
