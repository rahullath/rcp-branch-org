import type { Actor } from "@/lib/auth";
import type { Profile } from "@/lib/types";

const SENSITIVE_FIELDS = ["monthly_subs", "subs_last_paid"] as const;
/** Whether someone gets print copies: officers need it to hand them out. */
const SUB_FIELDS = ["paper_sub", "idom_sub", "paper_sub_kind", "idom_sub_kind"] as const;

/**
 * Finance/subs fields are only visible to their owner and to
 * finance_officer/general_secretary — everyone else gets those keys
 * stripped. Shared by the `/api/profiles` route and `Shell` (which seeds
 * the client-side profiles context) so both paths apply the same rule.
 */
export function sanitizeProfilesFor(profiles: Profile[], actor: Actor | null): Profile[] {
  const canSeeAll = !!actor && (actor.role.includes("general_secretary") || actor.role.includes("finance_officer"));
  return profiles.map((p) => {
    if (p.id === actor?.id) return p;
    if (actor?.viewOnly) {
      const { phone: _phone, monthly_subs: _subs, subs_last_paid: _paid, ...rest } = p;
      return rest;
    }
    if (canSeeAll) return p;
    const clone: Profile = { ...p };
    for (const key of SENSITIVE_FIELDS) delete clone[key];
    if (!actor?.role.some((r) => r !== "member")) for (const key of SUB_FIELDS) delete clone[key];
    return clone;
  });
}
