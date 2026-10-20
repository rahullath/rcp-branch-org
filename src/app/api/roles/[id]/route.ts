import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getEvent } from "@/lib/data";
import { deleteEventRole, getEventRole, setEventRole } from "@/lib/data-v2";
import { canRunEvent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** `{ claim: true }` = "I'll do it". Un-claiming is yourself or the lead; `{ assign }` is the lead giving it to someone. */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const role = await getEventRole(id);
  if (!role) return notFound("Role not found");
  const body = await readJson(request);
  // The lead gives it to someone: `{ assign: <profile id> | null }`.
  if ("assign" in (body ?? {})) {
    const event = await getEvent(role.event_id);
    if (!event || !canRunEvent(actor, event)) return json({ error: "Only the lead can assign roles" }, { status: 403 });
    const to = typeof body?.assign === "string" && body.assign ? body.assign : null;
    try {
      return json(await setEventRole(id, to));
    } catch (e) {
      return serverError(e);
    }
  }
  if (typeof body?.claim !== "boolean") return badRequest("claim must be true or false");
  if (body.claim && role.user_id && role.user_id !== actor.id) return badRequest("Someone already has this role");
  if (!body.claim && role.user_id !== actor.id) {
    const event = await getEvent(role.event_id);
    if (!event || !canRunEvent(actor, event)) return json({ error: "Only they or the lead can free this role" }, { status: 403 });
  }
  try {
    return json(await setEventRole(id, body.claim ? actor.id : null));
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const role = await getEventRole(id);
  if (!role) return notFound("Role not found");
  const event = await getEvent(role.event_id);
  if (!event || !canRunEvent(actor, event)) return json({ error: "Only the lead can remove roles" }, { status: 403 });
  await deleteEventRole(id);
  return json({ ok: true });
}
