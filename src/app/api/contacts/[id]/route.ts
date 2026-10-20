import { json, requireOwnerOrRole, readJson, badRequest, notFound } from "@/lib/api";
import { comradeForName } from "@/lib/comrade-match";
import { setFollowUp, updateComrade } from "@/lib/data-v2";
import { normalizePhone } from "@/lib/phone";
import { addContactNote, archiveContact, getContact, getProfile, updateContact } from "@/lib/data";
import { contactOwner, type ContactStatus, type ContactTier } from "@/lib/types";

const TIERS: ContactTier[] = ["priority", "potential", "cold"];
import { CONTACT_LABEL_VALUES } from "@/lib/contact-labels";

export const dynamic = "force-dynamic";

const STATUSES: ContactStatus[] = ["new", "contacted", "in_reading_group", "cold", "call_today"];
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) return notFound("Contact not found");
  const { error } = await requireOwnerOrRole(contactOwner(contact));
  if (error) return error;
  return json(contact);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) return notFound("Contact not found");
  // Only the comrade who owns a contact (or the GS) can change it — contacts are personal.
  const { actor, error } = await requireOwnerOrRole(contactOwner(contact));
  if (error) return error;
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  const patch: Record<string, unknown> = {};
  for (const key of ["name", "met_date", "location_type", "about", "what_worked", "phone", "status", "labels", "buddy_id", "tier"] as const) {
    if (key in body) patch[key] = body[key];
  }
  if (typeof patch.phone === "string") patch.phone = normalizePhone(patch.phone);
  if (patch.tier !== undefined && !TIERS.includes(patch.tier as ContactTier)) {
    return badRequest("Invalid list");
  }
  if ("stage" in body) {
    if (!["met", "talked", "came", "joined"].includes(body.stage as string)) return badRequest("Invalid stage");
    patch.stage = body.stage;
    patch.stage_at = new Date().toISOString();
  }
  // "Message" / "Invite" taps stamp this, so quiet contacts resurface after a week.
  if (body.touched === true) patch.last_contact_at = new Date().toISOString();
  if (patch.status !== undefined && !STATUSES.includes(patch.status as ContactStatus)) {
    return badRequest("Invalid status");
  }
  if (patch.name !== undefined && (typeof patch.name !== "string" || !patch.name.trim())) {
    return badRequest("Name cannot be empty");
  }
  if (patch.labels !== undefined) {
    patch.labels = Array.isArray(patch.labels)
      ? patch.labels.filter((l): l is string => typeof l === "string" && CONTACT_LABEL_VALUES.includes(l))
      : [];
  }

  // Hand-over: give this contact to another comrade, who then sees it in their list.
  if (typeof body.owner_id === "string" && body.owner_id !== contactOwner(contact)) {
    const target = await getProfile(body.owner_id);
    if (!target) return badRequest("That comrade doesn't exist");
    patch.owner_id = target.id;
  }

  const updated = await updateContact(id, patch);
  if (!updated) return notFound("Contact not found");
  // Joined: they become one of the branch's People, followed up by whoever recruited them,
  // so the new member doesn't drop out of sight now they're off the contacts list.
  if (patch.stage === "joined" && contact.stage !== "joined") {
    const owner = contactOwner(contact) ?? actor.id;
    const person = await comradeForName(actor, contact.name);
    if (contact.phone && !person.phone) await updateComrade(person.id, { phone: contact.phone }).catch(() => undefined);
    await setFollowUp(actor, person.id, { profile_id: owner }).catch(() => undefined);
    await addContactNote(id, `Joined · now in People, followed up by ${(await getProfile(owner))?.name ?? "their recruiter"}`, actor.id);
  }
  if (patch.owner_id) {
    const withNote = await addContactNote(id, `Handed over to ${(await getProfile(patch.owner_id as string))?.name ?? "another comrade"} by ${actor.name}`, actor.id);
    return json(withNote ?? updated);
  }
  return json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) return notFound("Contact not found");
  const { error } = await requireOwnerOrRole(contactOwner(contact));
  if (error) return error;
  const ok = await archiveContact(id);
  if (!ok) return notFound("Contact not found");
  return json({ ok: true });
}
