import { json, withActor, requireRole, readJson, badRequest, notFound } from "@/lib/api";
import { countGeneralSecretaries, deleteProfile, getProfile, updateProfile } from "@/lib/data";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = [
  "general_secretary",
  "education_officer",
  "finance_officer",
  "paper_sales_officer",
  "social_media_officer",
  "organizer",
  "leading_comrade",
  "member",
];
const SUB_KINDS = ["none", "digital", "physical"];

const SELF_EDIT_KEYS = ["name", "initials", "pronouns", "paper_sub_kind", "idom_sub_kind"] as const;
const FULL_EDIT_KEYS = ["role", "name", "initials", "pronouns"] as const;

type Params = { params: Promise<{ id: string }> };

/**
 * Your own name/initials/pronouns and which paper/IDOM subscription you get
 * (so print copies reach you), or a general-secretary edit (roles). An
 * officer can set someone's subscription back to none if they don't have
 * one. Subs amounts stay on portal.communist.red.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  for (const k of ["paper_sub_kind", "idom_sub_kind"] as const) if (k in body && !SUB_KINDS.includes(body[k] as string)) return badRequest("Subscription is none, digital or print");
  if (actor.id === id) {
    const patch: Record<string, unknown> = {};
    for (const key of SELF_EDIT_KEYS) if (key in body) patch[key] = body[key];
    // Your own roles: the GS (or the admin) can change them, e.g. hand over being GS.
    if (body.role !== undefined) {
      const me = await getProfile(id);
      if (!me) return notFound("Profile not found");
      if (!actor.isAdmin && !me.role.includes("general_secretary")) return json({ error: "Ask the general secretary to change your roles" }, { status: 403 });
      if (!Array.isArray(body.role) || body.role.length === 0 || !body.role.every((r) => typeof r === "string" && ROLES.includes(r as Role))) {
        return badRequest("Role must be a non-empty array of valid roles");
      }
      if (me.role.includes("general_secretary") && !body.role.includes("general_secretary") && (await countGeneralSecretaries()) <= 1) {
        return badRequest("You're the only general secretary. Make someone else GS first.");
      }
      patch.role = body.role;
    }
    if (Object.keys(patch).length === 0) {
      const me = await getProfile(id);
      return me ? json(me) : notFound("Profile not found");
    }
    if ("paper_sub_kind" in patch) patch.paper_sub = patch.paper_sub_kind !== "none";
    if ("idom_sub_kind" in patch) patch.idom_sub = patch.idom_sub_kind !== "none";
    const updated = await updateProfile(id, patch);
    if (!updated) return notFound("Profile not found");
    return json(updated);
  }

  // "Not actually subscribed": any officer can clear it, nothing more.
  const clearing = Object.keys(body).every((k) => (k === "paper_sub_kind" || k === "idom_sub_kind") && body[k] === "none");
  if (clearing && Object.keys(body).length && actor.role.some((r) => r !== "member")) {
    const patch: Record<string, unknown> = { ...body };
    if ("paper_sub_kind" in body) patch.paper_sub = false;
    if ("idom_sub_kind" in body) patch.idom_sub = false;
    const updated = await updateProfile(id, patch);
    if (!updated) return notFound("Profile not found");
    return json(updated);
  }
  const { error: roleError } = await requireRole("general_secretary");
  if (roleError) return roleError;

  if (body.role !== undefined) {
    if (
      !Array.isArray(body.role) ||
      body.role.length === 0 ||
      !body.role.every((r) => typeof r === "string" && ROLES.includes(r as Role))
    ) {
      return badRequest("Role must be a non-empty array of valid roles");
    }
  }

  const patch: Record<string, unknown> = {};
  for (const key of FULL_EDIT_KEYS) if (key in body) patch[key] = body[key];

  const updated = await updateProfile(id, patch);
  if (!updated) return notFound("Profile not found");
  return json(updated);
}

/** general_secretary only — blocks deleting your own account and deleting
 * the last remaining general_secretary (would lock the branch out of admin). */
export async function DELETE(_request: Request, { params }: Params) {
  const { actor, error } = await requireRole("general_secretary");
  if (error) return error;
  const { id } = await params;

  if (id === actor.id) {
    return badRequest("You can't delete your own account — ask another general secretary to do it");
  }

  const target = await getProfile(id);
  if (!target) return notFound("Profile not found");
  if (target.role.includes("general_secretary") && (await countGeneralSecretaries()) <= 1) {
    return badRequest("Can't delete the only general secretary — promote someone else first");
  }

  const ok = await deleteProfile(id);
  if (!ok) return notFound("Profile not found");
  return json({ ok: true });
}
