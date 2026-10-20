import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { listProfiles } from "@/lib/data";
import { listRoleRequests, requestRole } from "@/lib/onboarding";
import { sendPush } from "@/lib/push";
import { ROLE_LABEL, type Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ASKABLE: Role[] = ["general_secretary", "organizer", "education_officer", "finance_officer", "paper_sales_officer", "social_media_officer", "leading_comrade"];

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  return json(await listRoleRequests());
}

/** `{ role, note? }` — "I'm the education officer". The general secretary confirms it from their inbox. */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  const role = body?.role as Role;
  if (!ASKABLE.includes(role)) return badRequest("Pick a role");
  if (actor.role.includes(role)) return json({ already: true });
  const pending = (await listRoleRequests()).find((r) => r.user_id === actor.id && r.role === role && r.status === "pending");
  if (pending) return json(pending);
  try {
    const created = await requestRole(actor, role, typeof body?.note === "string" ? body.note.trim().slice(0, 300) || null : null);
    const gs = (await listProfiles()).filter((p) => p.role.includes("general_secretary") && p.id !== actor.id).map((p) => p.id);
    await sendPush(gs, "reminders", {
      title: `${actor.name.split(/\s+/)[0]} says they're ${ROLE_LABEL[role] ?? role}`,
      body: "Confirm it in your inbox.",
      url: "/inbox",
      tag: `role-${created.id}`,
    }).catch(() => 0);
    return json(created, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
