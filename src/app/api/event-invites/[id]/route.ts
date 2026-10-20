import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { deleteEventInvite, getContactRow, getEventInvite, setContactStage, setEventInviteStatus } from "@/lib/data-v2";
import { laterStage, type EventInvite } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const STATUSES: EventInvite["status"][] = ["invited", "coming", "maybe", "no", "came", "missed"];

/**
 * `{ status }` — what they said, then whether they came. "Came" moves the
 * contact on to the "came to something" stage. Whoever invited them.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const inv = await getEventInvite((await params).id);
  if (!inv) return notFound("Invite not found");
  if (inv.invited_by !== actor.id) return json({ error: "Only whoever invited them can update this" }, { status: 403 });
  const body = await readJson(request);
  const status = body?.status as EventInvite["status"];
  if (!STATUSES.includes(status)) return badRequest("Invalid status");
  try {
    const updated = await setEventInviteStatus(inv.id, status);
    if (status === "came") {
      const c = await getContactRow(inv.contact_id);
      if (c && laterStage(c.stage, "came") !== (c.stage ?? "met")) await setContactStage(c.id, "came");
    }
    return json(updated);
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const inv = await getEventInvite((await params).id);
  if (!inv) return notFound("Invite not found");
  if (inv.invited_by !== actor.id) return json({ error: "Only whoever invited them can remove this" }, { status: 403 });
  await deleteEventInvite(inv.id);
  return json({ ok: true });
}
