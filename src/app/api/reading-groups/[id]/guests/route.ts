import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getReadingGroup, listReadingGroupMembers } from "@/lib/data";
import { addReadingGroupGuest, getComrade, listReadingGroupContacts, listReadingGroupGuests } from "@/lib/data-v2";
import { comradeForName } from "@/lib/comrade-match";
import { canRunGroup, groupStats } from "@/lib/reading-groups";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Add someone without an account — a new recruit not on the app yet. `{ name | comrade_id, is_lead? }`. Leads or officers. */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const group = await getReadingGroup(id);
  if (!group || group.archived) return notFound("Reading group not found");
  const members = await listReadingGroupMembers(id);
  if (!canRunGroup(actor, group, members)) return json({ error: "Only its leads or an officer can add people" }, { status: 403 });
  const body = await readJson(request);
  try {
    const comrade =
      typeof body?.comrade_id === "string" ? await getComrade(body.comrade_id) : typeof body?.name === "string" && body.name.trim() ? await comradeForName(actor, body.name) : null;
    if (!comrade) return badRequest("Who? Give a name");
    if (comrade.profile_id) return badRequest(`${comrade.name} has an account — invite them instead`);
    const [contacts, guests] = await Promise.all([listReadingGroupContacts(), listReadingGroupGuests()]);
    if (guests.some((g) => g.group_id === id && g.comrade_id === comrade.id)) return badRequest("Already in this group");
    if (groupStats(group, members, contacts, guests).full) return badRequest("This group is full");
    return json({ ...(await addReadingGroupGuest(actor, id, comrade.id, body?.is_lead === true)), comrade }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
