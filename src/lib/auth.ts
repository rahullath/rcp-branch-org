import { cache } from "react";
import { cookies } from "next/headers";
import type { Branch, Profile, Role } from "./types";
import { isSupabaseConfigured } from "./config";
import { findRow } from "./dev-store";
import { DEMO_BRANCH_ID, DEMO_USER_ID } from "./seed";
import { createClient } from "./supabase/server";
import { isPlaceholderName, nameFromEmail } from "./identity";

export const DEMO_COOKIE = "branch-app-demo-user";

export interface Actor {
  id: string;
  name: string;
  role: Role[];
  isDemo: boolean;
  /** Your branch. Null until you join or start one — the app sends you to /welcome. */
  branch: Pick<Branch, "id" | "name" | "district" | "approved"> | null;
  /** Done the first-run steps (who you are, role, install). False → /onboarding. */
  onboarded: boolean;
  /** Their name is still the one sign-up made from their email: onboarding asks for a real one. */
  namePending?: boolean;
  /**
   * Admin of this copy (the first branch's creator, or set in the SQL editor): general-secretary powers in
   * whichever branch they're working in, and can switch branch. `role` then
   * includes general_secretary, so every existing check just works.
   */
  isAdmin: boolean;
  /** Joined with the viewer link: reads only, private areas hidden. */
  viewOnly: boolean;
}

const withAdmin = (role: Role[], isAdmin: boolean): Role[] => (isAdmin && !role.includes("general_secretary") ? [...role, "general_secretary"] : role);

export const getActor = cache(async (): Promise<Actor | null> => {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    // getClaims verifies the session JWT locally (signing keys) instead of a
    // round trip to the auth server on every request; the profile and its
    // branch come back in one query. Functions run in fra1, next to the DB.
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) return null;
    const email = typeof claims.claims.email === "string" ? claims.claims.email : "";
    const { data: profile } = await supabase
      .from("profiles")
      .select("*, branch:branches!profiles_branch_id_fkey(id,name,district,approved)")
      .eq("id", userId)
      .single();
    // The branch is readable only once you're in it (RLS: own branch).
    const branch = (profile as { branch?: Actor["branch"] } | null)?.branch ?? null;
    return {
      id: userId,
      name: isPlaceholderName(profile?.name ?? "", email) ? nameFromEmail(email || "comrade") : profile!.name,
      role: withAdmin((profile?.role ?? ["member"]) as Role[], !!profile?.is_admin),
      isAdmin: !!profile?.is_admin,
      viewOnly: !!profile?.view_only,
      isDemo: false,
      // A name that's still the email address means they never said who they are.
      // View-only accounts skip the first-run steps: they'd only ask for things they can't do.
      onboarded: !!profile?.view_only || (!!profile?.onboarded_at && !isPlaceholderName(profile?.name ?? "", email)),
      namePending: isPlaceholderName(profile?.name ?? "", email),
      branch: (branch as Actor["branch"]) ?? (profile?.branch_id ? { id: profile.branch_id, name: "Your branch", district: "" } : null),
    };
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(DEMO_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { id } = JSON.parse(raw) as { id: string };
    const profile = findRow<Profile>("profiles", id) ?? findRow<Profile>("profiles", DEMO_USER_ID);
    if (!profile) return null;
    const branch = findRow<Branch>("branches", profile.branch_id ?? DEMO_BRANCH_ID) ?? null;
    return { id: profile.id, name: profile.name, role: withAdmin(profile.role, !!profile.is_admin), isAdmin: !!profile.is_admin, viewOnly: !!profile.view_only, isDemo: true, onboarded: profile.onboarded_at !== null, branch: branch && { id: branch.id, name: branch.name, district: branch.district, approved: true } };
  } catch {
    return null;
  }
});

export function isOfficer(actor: Actor | null, role: Role) {
  return actor?.role.includes(role) ?? false;
}

/** Mirrors the `has_role_beyond_member()` RLS helper for dev-store parity,
 * since demo mode has zero RLS enforcement of its own. */
export function canSeeCommittee(actor: Actor | null) {
  return (actor?.role ?? []).some((r) => r !== "member");
}
