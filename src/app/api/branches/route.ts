import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { adminBranches, adminSwitchBranch, approveBranch, createBranch, joinBranch, myBranch, newJoinCode, renameBranch, setViewerCode } from "@/lib/branches";
import { isSupabaseConfigured } from "@/lib/config";
import { sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Your branch, with its join code (to invite comrades). */
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await myBranch());
  } catch (e) {
    return serverError(e);
  }
}

/**
 * `{ action: "create", name, district? }` — start a branch (you become its GS).
 * `{ action: "join", code }` — join with the code a comrade gave you.
 * `{ action: "new-code" }` — GS: a fresh code; the old one stops working.
 * `{ action: "viewer-link", on }` — GS: a view-only join code, or switch it off.
 * `{ action: "list" }` — admin: every branch. `{ action: "switch", id }` — admin: work in that branch.
 * `{ action: "approve", id }` — admin: let a new branch start.
 */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  try {
    if (body?.action === "create") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return badRequest("Name the branch");
      const res = await createBranch(name, typeof body.district === "string" ? body.district.trim() : "");
      if (!res.ok) return badRequest(res.error ?? "Couldn't start the branch");
      if (res.approved === false) await tellAdmins(name);
      return json(res, { status: 201 });
    }
    if (body?.action === "join") {
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!code) return badRequest("The branch code — ask a comrade in that branch");
      const res = await joinBranch(code);
      return res.ok ? json(res) : badRequest(res.error ?? "Couldn't join");
    }
    if (body?.action === "new-code") {
      if (!actor.role.includes("general_secretary")) return json({ error: "Only the general secretary can do that" }, { status: 403 });
      return json({ join_code: await newJoinCode() });
    }
    if (body?.action === "viewer-link") {
      if (!actor.role.includes("general_secretary")) return json({ error: "Only the general secretary can do that" }, { status: 403 });
      return json({ viewer_code: await setViewerCode(body.on === true) });
    }
    if (body?.action === "approve") {
      if (!actor.isAdmin) return json({ error: "Admins only" }, { status: 403 });
      const res = await approveBranch(typeof body.id === "string" ? body.id : "");
      return res.ok ? json(res) : badRequest(res.error ?? "Couldn't approve");
    }
    if (body?.action === "list") {
      if (!actor.isAdmin) return json([]);
      return json(await adminBranches());
    }
    if (body?.action === "switch") {
      if (!actor.isAdmin) return json({ error: "Admins only" }, { status: 403 });
      const res = await adminSwitchBranch(typeof body.id === "string" ? body.id : "");
      return res.ok ? json(res) : badRequest(res.error ?? "Couldn't switch");
    }
    return badRequest("Unknown action");
  } catch (e) {
    return serverError(e);
  }
}

/** `{ name }` — GS renames the branch. */
export async function PATCH(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  if (!actor.role.includes("general_secretary") || !actor.branch) return json({ error: "Only the general secretary can rename the branch" }, { status: 403 });
  const body = await readJson(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("Name the branch");
  try {
    return json(await renameBranch(actor.branch.id, name.slice(0, 80)));
  } catch (e) {
    return serverError(e);
  }
}

/** A new branch is waiting: push the admins of this copy so it doesn't sit there unseen. */
async function tellAdmins(name: string) {
  const admin = isSupabaseConfigured ? createAdminClient() : null;
  if (!admin) return;
  const { data } = await admin.from("profiles").select("id").eq("is_admin", true);
  const ids = (data ?? []).map((p: { id: string }) => p.id);
  if (ids.length) await sendPush(ids, "lead_updates", { title: "New branch waiting", body: `${name} wants to start. Approve it in Settings.`, url: "/settings", tag: "branch-waiting" });
}
