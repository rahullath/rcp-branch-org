import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getContact, getReadingGroup, listReadingGroupMembers } from "@/lib/data";
import { addReadingGroupContact, listReadingGroupContacts } from "@/lib/data-extras";
import { groupStats } from "@/lib/reading-groups";
import { contactOwner, contactTier } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Bring one of your own contacts into a group (strong contacts are who these are for). */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const group = await getReadingGroup(id);
  if (!group || group.archived) return notFound("Reading group not found");
  const body = await readJson(request);
  const contact = typeof body?.contact_id === "string" ? await getContact(body.contact_id) : null;
  if (!contact || contact.archived) return badRequest("Pick one of your contacts");
  if (contactOwner(contact) !== actor.id && !actor.role.includes("general_secretary")) return json({ error: "That's someone else's contact" }, { status: 403 });
  if (contactTier(contact) === "cold") return badRequest("Move them out of Cold first");
  const [members, contacts] = await Promise.all([listReadingGroupMembers(id), listReadingGroupContacts()]);
  if (contacts.some((c) => c.group_id === id && c.contact_id === contact.id)) return badRequest("Already in this group");
  if (groupStats(group, members, contacts).full) return badRequest("This group is full");
  try {
    return json(await addReadingGroupContact(actor, id, contact.id), { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
