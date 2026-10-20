import { after } from "next/server";
import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getProfile, getReadingGroup, listReadingGroupMembers } from "@/lib/data";
import { createReadingGroupInvite, listReadingGroupContacts, listReadingGroupGuests, listReadingGroupInvites } from "@/lib/data-v2";
import { canRunGroup, groupLeadIds, groupStats } from "@/lib/reading-groups";
import { notifyReadingInvite, notifyReadingRequest } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * `{ user_id }` — a lead invites a comrade (it lands in their inbox: Join /
 * Not now). `{ request: true, note }` — you ask to join ("I've read the
 * Manifesto"); it lands with the leads. Replaces the open "join" button, so
 * groups are put together on purpose.
 */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const group = await getReadingGroup(id);
  if (!group || group.archived) return notFound("Reading group not found");
  const body = await readJson(request);
  const [members, contacts, guests, invites] = await Promise.all([listReadingGroupMembers(id), listReadingGroupContacts(), listReadingGroupGuests(), listReadingGroupInvites()]);
  const open = invites.filter((i) => i.group_id === id && i.status === "open");
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;
  try {
    if (body?.request === true) {
      if (members.some((m) => m.user_id === actor.id)) return badRequest("You're already in this group");
      if (open.some((i) => i.user_id === actor.id)) return badRequest("Already asked — the leads will answer");
      const invite = await createReadingGroupInvite(actor, { group_id: id, user_id: actor.id, kind: "request", note });
      const leads = groupLeadIds(group, members).filter((x) => x !== actor.id);
      if (leads.length) after(() => notifyReadingRequest(actor, group.title, leads));
      return json(invite, { status: 201 });
    }

    if (!canRunGroup(actor, group, members)) return json({ error: "Only its leads or an officer can invite" }, { status: 403 });
    const invitee = typeof body?.user_id === "string" ? await getProfile(body.user_id) : null;
    if (!invitee) return badRequest("Pick who to invite");
    if (members.some((m) => m.user_id === invitee.id)) return badRequest(`${invitee.name} is already in it`);
    if (open.some((i) => i.user_id === invitee.id && i.kind === "invite")) return badRequest("Already invited");
    if (groupStats(group, members, contacts, guests).full) return badRequest("This group is full");
    const invite = await createReadingGroupInvite(actor, { group_id: id, user_id: invitee.id, kind: "invite", note });
    after(() => notifyReadingInvite(actor, group.title, invitee.id));
    return json(invite, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
