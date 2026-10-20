/**
 * The party membership portal, read-only. Off until these are set in Vercel:
 *   PORTAL_API_URL    the portal's API base, e.g. https://portal.example/api
 *   PORTAL_API_KEY    a key from a branch administrator's account
 *   PORTAL_BRANCH_ID  our branch's ID on the portal
 *   PORTAL_APP_BRANCH this app's branch (uuid) that portal branch belongs to
 * Only GET requests are ever made: nothing here can change the official record.
 */

/** A member as the portal returns them (only the fields we use). */
export interface PortalUser {
  userId: string;
  name: string;
  email: string;
  phoneNumber?: string;
  candidacyExpiration?: string;
}

const env = () => ({
  url: process.env.PORTAL_API_URL?.replace(/\/+$/, ""),
  key: process.env.PORTAL_API_KEY,
  branch: process.env.PORTAL_BRANCH_ID,
  appBranch: process.env.PORTAL_APP_BRANCH,
});

/** The portal branch for this app branch, or null when the portal isn't set up for it. */
export function portalBranchFor(appBranchId: string | null | undefined): string | null {
  const { url, key, branch, appBranch } = env();
  if (!url || !key || !branch || !appBranch || appBranchId !== appBranch) return null;
  return branch;
}

/** Every member of a portal branch. Cached for ten minutes. */
export async function fetchBranchMembers(portalBranchId: string): Promise<PortalUser[]> {
  const { url, key } = env();
  const res = await fetch(`${url}/branches/${encodeURIComponent(portalBranchId)}/users`, {
    method: "GET",
    headers: { "X-API-Key": key ?? "", Accept: "application/json" },
    next: { revalidate: 600 },
  });
  // The portal answers a bad key, a missing branch and a forbidden one with the same 404.
  if (res.status === 404) throw new Error("The portal didn't accept the key or branch ID");
  if (!res.ok) throw new Error(`The portal answered ${res.status}`);
  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) throw new Error("The portal sent something unexpected");
  return rows.filter((r): r is PortalUser => !!r && typeof r === "object" && typeof (r as PortalUser).userId === "string" && typeof (r as PortalUser).name === "string");
}
