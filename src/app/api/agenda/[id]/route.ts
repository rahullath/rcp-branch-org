import { withTitles } from "@/lib/link-title";
import type { PrepLink } from "@/lib/types";
import { syncPrepReads } from "@/lib/preread-sync";
import { json, readJson, badRequest, notFound, withActor } from "@/lib/api";
import { archiveAgendaItem, getAgendaItem, getEvent, updateAgendaItem } from "@/lib/data";
import { syncMeetingTitle } from "@/lib/meeting-title";
import type { AgendaSection, Role } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Each agenda section is owned by the officer who runs that part of the branch. */
const SECTION_ROLE: Record<AgendaSection, Role> = {
  paper: "paper_sales_officer",
  political: "education_officer",
  organizational: "organizer",
};

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const item = await getAgendaItem(id);
  if (!item) return notFound("Agenda item not found");
  // CRUD everywhere: whoever added it, the section's officer, the GS — and for
  // organisational items any officer or the meeting's chair too.
  const { actor, error: authError } = await withActor();
  if (authError) return authError;
  const meeting = item.event_id ? await getEvent(item.event_id) : null;
  const allowed =
    item.created_by === actor.id ||
    actor.role.includes(SECTION_ROLE[item.section]) ||
    actor.role.includes("general_secretary") ||
    (item.section !== "political" && (actor.role.some((r) => r !== "member") || meeting?.chair_id === actor.id));
  if (!allowed) return json({ error: "Ask whoever added it, or an officer" }, { status: 403 });
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  const patch: Record<string, unknown> = {};
  for (const key of [
    "section",
    "title",
    "duration",
    "description",
    "icon",
    "attachment",
    "leadoff_name",
    "chair_name",
    "reading",
    "reports",
    "tasks",
    "event_id",
    "prep_links",
    "link",
    "sort_order",
    "meeting_date",
  ] as const) {
    if (key in body) patch[key] = body[key];
  }
  if (Array.isArray(patch.prep_links)) patch.prep_links = await withTitles(patch.prep_links as PrepLink[]);

  const updated = await updateAgendaItem(id, patch);
  if (!updated) return notFound("Agenda item not found");
  if (updated.section === "political") await syncMeetingTitle(updated.event_id, item.title);
  if ("prep_links" in patch && updated.section === "political") await syncPrepReads(actor, updated.event_id);
  return json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const item = await getAgendaItem(id);
  if (!item) return notFound("Agenda item not found");
  const { actor, error } = await withActor();
  if (error) return error;
  const allowed =
    item.created_by === actor.id ||
    actor.role.includes(SECTION_ROLE[item.section]) ||
    actor.role.includes("general_secretary") ||
    (item.section !== "political" && actor.role.some((r) => r !== "member"));
  if (!allowed) return json({ error: "Ask whoever added it, or an officer" }, { status: 403 });
  const ok = await archiveAgendaItem(id);
  if (!ok) return notFound("Agenda item not found");
  if (item.section === "political") await syncMeetingTitle(item.event_id, item.title);
  return json({ ok: true });
}
