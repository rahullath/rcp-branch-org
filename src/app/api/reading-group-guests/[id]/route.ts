import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getReadingGroup, listReadingGroupMembers } from "@/lib/data";
import { getReadingGroupGuest, removeReadingGroupGuest, setReadingGroupGuestLead } from "@/lib/data-v2";
import { canRunGroup } from "@/lib/reading-groups";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function guard(id: string) {
  const { actor, error } = await withActor();
  if (error) return { error };
  const guest = await getReadingGroupGuest(id);
  if (!guest) return { error: notFound("Not found") };
  const group = await getReadingGroup(guest.group_id);
  if (!group || !canRunGroup(actor, group, await listReadingGroupMembers(group.id))) return { error: json({ error: "Only its leads or an officer can change this" }, { status: 403 }) };
  return { guest };
}

/** `{ is_lead }` — e.g. Dan co-leads before he's on the app. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await guard(id);
  if (error) return error;
  const body = await readJson(request);
  if (typeof body?.is_lead !== "boolean") return badRequest("is_lead must be true or false");
  try {
    return json(await setReadingGroupGuestLead(id, body.is_lead));
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await guard(id);
  if (error) return error;
  try {
    await removeReadingGroupGuest(id);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
