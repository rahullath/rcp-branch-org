import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getReadingGroup, joinReadingGroup, leaveReadingGroup, listReadingGroupMembers, setReadingGroupLead, updateReadingGroup } from "@/lib/data";
import { listReadingGroupContacts, listReadingGroupGuests } from "@/lib/data-v2";
import { canRunGroup, groupStats } from "@/lib/reading-groups";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Join yourself — as a lead (taking on a proposal), or as an officer. Everyone else asks or is invited (./invites). */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const group = await getReadingGroup(id);
  if (!group) return notFound("Reading group not found");
  const body = await readJson(request);
  const [members, contacts, guests] = await Promise.all([listReadingGroupMembers(id), listReadingGroupContacts(), listReadingGroupGuests()]);
  if (members.some((m) => m.user_id === actor.id)) return badRequest("You're already in this group");
  if (groupStats(group, members, contacts, guests).full) return badRequest("This group is full — start another on the same book");
  // Joining directly is for leading ("I'll lead" on a proposal) and for officers; everyone else asks or is invited.
  const lead = body?.lead === true;
  if (!lead && !canRunGroup(actor, group, members)) return json({ error: "Ask to join — the leads will add you" }, { status: 403 });
  try {
    await joinReadingGroup(id, actor.id, lead);
    if (lead && !group.runner_id) await updateReadingGroup(id, { runner_id: actor.id });
    return json({ ok: true }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}

/** `{ is_lead }` — volunteer as co-lead, or step back. Your own row only. */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const body = await readJson(request);
  if (typeof body?.is_lead !== "boolean") return badRequest("is_lead must be true or false");
  try {
    await setReadingGroupLead(id, actor.id, body.is_lead);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  try {
    await leaveReadingGroup(id, actor.id);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
