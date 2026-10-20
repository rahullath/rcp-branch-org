"use client";

import { createContext, useContext } from "react";

const NavBadgesContext = createContext<Record<string, number>>({});

/** Server-computed counts (completed checklists, pending imports) for the More page tiles. */
export function NavBadgesProvider({ badges, children }: { badges?: Record<string, number>; children: React.ReactNode }) {
  return <NavBadgesContext.Provider value={badges ?? {}}>{children}</NavBadgesContext.Provider>;
}

export function useNavBadges() {
  return useContext(NavBadgesContext);
}
