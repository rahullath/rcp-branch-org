import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { getEvent } from "@/lib/data";
import { getContactRow, inviteContact, listEventInvites } from "@/lib/data-v2";
import { contactOwner } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Every invite in the branch (ids and statuses only — names stay with whoever works the contact). */
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listEventInvites());
  } catch (e) {
    return serverError(e);
  }
}

/** `{ event_id, contact_id }` — you invited one of your contacts. */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (typeof body?.event_id !== "string" || typeof body?.contact_id !== "string") return badRequest("event_id and contact_id are required");
  const [event, contact] = await Promise.all([getEvent(body.event_id), getContactRow(body.contact_id)]);
  if (!event || !contact) return badRequest("That event or contact is gone");
  if (contactOwner(contact) !== actor.id) return json({ error: "You can only invite your own contacts" }, { status: 403 });
  try {
    return json(await inviteContact(actor, event.id, contact.id), { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
