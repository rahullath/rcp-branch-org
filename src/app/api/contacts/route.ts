import { json, serverError, withActor, readJson, badRequest } from "@/lib/api";
import { createContact, listContacts } from "@/lib/data";
import { normalizePhone } from "@/lib/phone";
import type { ContactStatus, ContactTier } from "@/lib/types";

const TIERS: ContactTier[] = ["priority", "potential", "cold"];
import { CONTACT_LABEL_VALUES } from "@/lib/contact-labels";

export const dynamic = "force-dynamic";

const STATUSES: ContactStatus[] = ["new", "contacted", "in_reading_group", "cold", "call_today"];

export async function GET(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const scope = url.searchParams.get("scope") === "all" ? "all" : "mine";

  try {
    // Contacts are personal — only the caller's own unless they're the GS asking for everything.
    return json(await listContacts({ search, status, scope }, actor));
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;

  const body = await readJson(request);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return badRequest("Name is required");
  }
  if (body.status && !STATUSES.includes(body.status as ContactStatus)) {
    return badRequest("Invalid status");
  }
  if (body.consent !== true) {
    return badRequest("Consent is required before saving a contact");
  }

  try {
    const contact = await createContact(actor, {
      name: body.name.trim(),
      met_date: typeof body.met_date === "string" ? body.met_date : null,
      location_type: typeof body.location_type === "string" ? body.location_type : null,
      about: typeof body.about === "string" ? body.about : null,
      what_worked: typeof body.what_worked === "string" ? body.what_worked : null,
      phone: typeof body.phone === "string" ? normalizePhone(body.phone) : null,
      status: (body.status as ContactStatus) ?? "new",
      labels: Array.isArray(body.labels)
        ? body.labels.filter((l): l is string => typeof l === "string" && CONTACT_LABEL_VALUES.includes(l))
        : [],
      notes: [],
      consent_given_at: new Date().toISOString(),
      tier: TIERS.includes(body.tier as ContactTier) ? (body.tier as ContactTier) : "potential",
      met_event_id: typeof body.met_event_id === "string" ? body.met_event_id : null,
      last_contact_at: new Date().toISOString(),
    });
    return json(contact, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
