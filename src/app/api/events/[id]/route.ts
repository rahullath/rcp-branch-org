import { json, requireOwnerOrRole, readJson, badRequest, notFound, withActor } from "@/lib/api";
import { canRunEvent } from "@/lib/permissions";
import { archiveAgendaItemsForEvent, archiveEvent, getEvent, updateEvent } from "@/lib/data";
import { announceStatusChange, confirmIfReached } from "@/lib/event-status";
import { notifyInvited } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return notFound("Event not found");
  // Whoever posted it, its lead, an organizer or the GS (same rule as the UI).
  const { actor, error } = await withActor();
  if (error) return error;
  if (!canRunEvent(actor, event)) return json({ error: "Only the lead or an organizer can edit this event" }, { status: 403 });
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  const patch: Record<string, unknown> = {};
  for (const key of [
    "title",
    "event_type",
    "start_time",
    "location",
    "description",
    "is_mobilization",
    "meetup_time",
    "chair_id",
    "minutes_id",
    "lead_id",
    "target",
    "session_id",
    "status",
    "confirm_by",
    "paper_issue",
    "copies_out",
    "reading_group_id",
    "scope",
    "invitees",
  ] as const) {
    if (key in body) patch[key] = body[key];
  }
  if (patch.invitees !== undefined) {
    if (event.event_type !== "committee" || !Array.isArray(patch.invitees) || !patch.invitees.every((x) => typeof x === "string")) return badRequest("Only committee meetings take invitees");
    if (!actor.role.some((r) => r !== "member")) return json({ error: "Officers invite people to committee meetings" }, { status: 403 });
  }
  if (patch.scope !== undefined && !["branch", "district", "national"].includes(patch.scope as string)) return badRequest("Scope is branch, district or national");
  if (patch.status !== undefined && !["tentative", "on", "off"].includes(patch.status as string)) {
    return badRequest("Status is tentative, on or off");
  }
  // Setting a deadline with a number makes it tentative again; clearing the deadline makes it simply on.
  if (patch.confirm_by && !("status" in body) && (patch.target ?? event.target) && event.status !== "off") patch.status = "tentative";
  if ("confirm_by" in body && !body.confirm_by && event.status === "tentative" && !("status" in body)) patch.status = "on";
  if (patch.title !== undefined && (typeof patch.title !== "string" || !patch.title.trim())) {
    return badRequest("Title cannot be empty");
  }

  const updated = await updateEvent(id, patch);
  if (!updated) return notFound("Event not found");
  await announceStatusChange(actor, event, updated);
  if (patch.invitees) await notifyInvited(actor, updated, (patch.invitees as string[]).filter((x) => !(event.invitees ?? []).includes(x))).catch(() => undefined);
  if (updated.status === "tentative") await confirmIfReached(updated.id);
  return json((await getEvent(id)) ?? updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return notFound("Event not found");
  const { error } = await requireOwnerOrRole(event.posted_by, "organizer");
  if (error) return error;
  const ok = await archiveEvent(id);
  if (!ok) return notFound("Event not found");
  await archiveAgendaItemsForEvent(id);
  return json({ ok: true });
}
