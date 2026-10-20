import type { Comrade, Profile } from "./types";
import type { PortalUser } from "./portal";

/** A portal member, and who they are in the app (if anyone). */
export interface PortalRow {
  portalId: string;
  name: string;
  email: string;
  phone: string | null;
  /** Their candidacy ends on this day (UK date), or null for a full member. */
  candidacyUntil: string | null;
  profileId: string | null;
  comradeId: string | null;
}

const norm = (s: string) => s.replace(/^Comrade\s+/i, "").trim().toLowerCase().replace(/\s+/g, " ");

/** The UK calendar day of an ISO timestamp. */
function ukDay(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/**
 * Match portal members to accounts (by email) and People entries (through the
 * account, else by name or short form). A name only counts when it's unambiguous.
 */
export function matchPortal(users: PortalUser[], profiles: Pick<Profile, "id" | "email">[], comrades: Pick<Comrade, "id" | "name" | "aliases" | "profile_id">[]): PortalRow[] {
  const byEmail = new Map(profiles.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p.id]));
  return users.map((u) => {
    let profileId = (u.email && byEmail.get(u.email.toLowerCase())) || null;
    let comradeId = profileId ? (comrades.find((c) => c.profile_id === profileId)?.id ?? null) : null;
    if (!comradeId) {
      // By name: also finds someone who signed up to the app with a different email.
      const n = norm(u.name);
      const hits = comrades.filter((c) => [c.name, ...c.aliases].some((a) => norm(a) === n));
      if (hits.length === 1) {
        comradeId = hits[0].id;
        profileId ??= hits[0].profile_id ?? null;
      }
    }
    return { portalId: u.userId, name: u.name, email: u.email, phone: u.phoneNumber ?? null, candidacyUntil: ukDay(u.candidacyExpiration), profileId, comradeId };
  });
}
