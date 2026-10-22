import { json, withActor } from "@/lib/api";
import { listProfiles } from "@/lib/data";
import { listComrades } from "@/lib/data-extras";
import { fetchBranchMembers, portalBranchFor } from "@/lib/portal";
import { matchPortal } from "@/lib/portal-match";

export const dynamic = "force-dynamic";

/** The branch's members on the party portal, matched to accounts and People. Officers; read-only. */
export async function GET() {
  const { actor, error } = await withActor();
  if (error) return error;
  if (!actor.role.some((r) => r !== "member")) return json({ configured: false });
  const portalBranch = portalBranchFor(actor.branch?.id);
  if (!portalBranch) return json({ configured: false });
  try {
    const [users, profiles, comrades] = await Promise.all([fetchBranchMembers(portalBranch), listProfiles(), listComrades()]);
    return json({ configured: true, rows: matchPortal(users, profiles, comrades) });
  } catch (e) {
    return json({ configured: true, error: e instanceof Error ? e.message : "Couldn't reach the portal" });
  }
}
