import { json, requireOwnerOrRole, readJson, badRequest, notFound } from "@/lib/api";
import { addContactNote, getContact } from "@/lib/data";
import { contactOwner } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) return notFound("Contact not found");
  const { actor, error } = await requireOwnerOrRole(contactOwner(contact));
  if (error) return error;
  const body = await readJson(request);
  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    return badRequest("Note text is required");
  }
  const updated = await addContactNote(id, body.text.trim(), actor.id);
  return json(updated, { status: 201 });
}
