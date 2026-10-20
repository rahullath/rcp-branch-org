import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getReadingGroup, joinReadingGroup, listReadingGroupMembers } from "@/lib/data";
import { getReadingGroupInvite, listReadingGroupContacts, listReadingGroupGuests, setInviteStatus } from "@/lib/data-v2";
import { canRunGroup, groupStats } from "@/lib/reading-groups";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * `{ accept: true|false }`. An invite is answered by the person invited; a
 * request by the group's leads. Accepting puts them in the group.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const invite = await getReadingGroupInvite(id);
  if (!invite || invite.status !== "open") return notFound("Nothing to answer");
  const group = await getReadingGroup(invite.group_id);
  if (!group || group.archived) return notFound("Reading group not found");
  const body = await readJson(request);
  if (typeof body?.accept !== "boolean") return badRequest("accept must be true or false");
  const members = await listReadingGroupMembers(group.id);
  const mayAnswer = invite.kind === "invite" ? invite.user_id === actor.id : canRunGroup(actor, group, members);
  if (!mayAnswer) return json({ error: invite.kind === "invite" ? "That invite isn't yours" : "Only its leads can answer" }, { status: 403 });
  try {
    if (body.accept && !members.some((m) => m.user_id === invite.user_id)) {
      const [contacts, guests] = await Promise.all([listReadingGroupContacts(), listReadingGroupGuests()]);
      if (groupStats(group, members, contacts, guests).full) return badRequest("The group filled up — ask a lead about the next one");
      await joinReadingGroup(group.id, invite.user_id, false);
    }
    return json(await setInviteStatus(id, body.accept ? "accepted" : "declined"));
  } catch (e) {
    return serverError(e);
  }
}
