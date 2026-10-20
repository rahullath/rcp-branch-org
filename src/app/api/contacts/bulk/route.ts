import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { createContact, listContacts } from "@/lib/data";
import { normalizePhone } from "@/lib/phone";
import type { ContactTier } from "@/lib/types";
import { contactOwner } from "@/lib/types";

export const dynamic = "force-dynamic";

const TIERS: ContactTier[] = ["priority", "potential", "cold"];

/**
 * Several contacts at once — a pasted list, or the AI-tidied import. Each
 * becomes your contact. Skips anyone you already have with the same number
 * (or same name and no number). `consent: true` confirms they were OK with it.
 */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (!body || !Array.isArray(body.rows)) return badRequest("Nothing to import");
  if (body.consent !== true) return badRequest("Confirm they were OK with being noted down");
  if (body.rows.length > 300) return badRequest("Up to 300 at a time");
  try {
    const mine = (await listContacts()).filter((c) => contactOwner(c) === actor.id && !c.archived);
    const seenPhones = new Set(mine.map((c) => c.phone).filter(Boolean));
    const seenNames = new Set(mine.filter((c) => !c.phone).map((c) => c.name.trim().toLowerCase()));
    let created = 0;
    let skipped = 0;
    const now = new Date().toISOString();
    for (const r of body.rows as Record<string, unknown>[]) {
      const name = typeof r.name === "string" ? r.name.trim().slice(0, 80) : "";
      if (!name) continue;
      const phone = typeof r.phone === "string" ? normalizePhone(r.phone) : null;
      if ((phone && seenPhones.has(phone)) || (!phone && seenNames.has(name.toLowerCase()))) {
        skipped++;
        continue;
      }
      await createContact(actor, {
        name,
        phone,
        about: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim().slice(0, 1000) : null,
        tier: TIERS.includes(r.tier as ContactTier) ? (r.tier as ContactTier) : "potential",
        location_type: typeof r.source === "string" && r.source ? r.source.slice(0, 40) : "other",
        met_date: typeof r.met_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.met_date) ? r.met_date : null,
        status: "new",
        labels: [],
        notes: [],
        consent_given_at: now,
        last_contact_at: now,
      });
      if (phone) seenPhones.add(phone);
      else seenNames.add(name.toLowerCase());
      created++;
    }
    return json({ created, skipped }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
