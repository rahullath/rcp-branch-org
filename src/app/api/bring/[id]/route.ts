import { json, notFound, readJson, serverError, withActor, badRequest } from "@/lib/api";
import { getEvent } from "@/lib/data";
import { claimBringItem, deleteBringItem, getBringItem, markBrought } from "@/lib/data-v2";
import { canRunEvent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * `{ claim: true }` = "I'll bring it" (moves the material to you); `false`
 * un-claims your own ("can't now"). `{ here: true|false }` ticks it off on
 * the day — anyone at the event.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const item = await getBringItem(id);
  if (!item) return notFound("Item not found");
  const body = await readJson(request);
  if (typeof body?.here === "boolean") return json(await markBrought(item.id, body.here));
  if (typeof body?.claim !== "boolean") return badRequest("claim must be true or false");
  if (body.claim && item.claimed_by && item.claimed_by !== actor.id) return badRequest("Someone is already bringing it");
  if (!body.claim && item.claimed_by !== actor.id) {
    const event = await getEvent(item.event_id);
    if (!event || !canRunEvent(actor, event)) return json({ error: "Only they or the lead can un-claim it" }, { status: 403 });
  }
  try {
    return json(await claimBringItem(actor, item, body.claim));
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const item = await getBringItem(id);
  if (!item) return notFound("Item not found");
  const event = await getEvent(item.event_id);
  if (!event || !canRunEvent(actor, event)) return json({ error: "Only the lead can change the bring list" }, { status: 403 });
  await deleteBringItem(id);
  return json({ ok: true });
}
