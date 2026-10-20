import { badRequest, json, notFound, readJson, requireRole, serverError } from "@/lib/api";
import { getProfile, updateProfile } from "@/lib/data";
import { decideRoleRequest, getRoleRequest } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** `{ approve: boolean }` — the general secretary confirms (the role is added) or says no. */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await requireRole("general_secretary");
  if (error) return error;
  const { id } = await params;
  const body = await readJson(request);
  if (typeof body?.approve !== "boolean") return badRequest("approve must be true or false");
  const req = await getRoleRequest(id);
  if (!req) return notFound("Request not found");
  if (req.status !== "pending") return json(req);
  try {
    if (body.approve) {
      const profile = await getProfile(req.user_id);
      if (!profile) return notFound("They're no longer in the branch");
      const roles = [...new Set([...profile.role, req.role])];
      await updateProfile(profile.id, { role: roles });
    }
    return json(await decideRoleRequest(actor, id, body.approve));
  } catch (e) {
    return serverError(e);
  }
}
