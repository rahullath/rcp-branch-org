import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { getEvent, getProfile } from "@/lib/data";
import { createAgendaAction, getComrade, listAgendaActions } from "@/lib/data-v2";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listAgendaActions());
  } catch (e) {
    return serverError(e);
  }
}

/**
 * An action point from the minutes, with an owner. Recorded by the minutes
 * taker, the chair or an officer; it sits in the owner's inbox until done.
 * `open: true` (no owner) asks the branch instead: anyone can post one, and
 * anyone can take it. Anyone can also give a task to themselves.
 */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return badRequest("Describe the action");
  const owner = typeof body?.owner_id === "string" ? await getProfile(body.owner_id) : null;
  const comrade = !owner && typeof body?.owner_comrade_id === "string" ? await getComrade(body.owner_comrade_id) : null;
  const open = body?.open === true;
  if (!owner && !comrade && !open) return badRequest("Pick who it's for, or ask the branch");
  const due = typeof body?.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null;
  const eventId = typeof body?.event_id === "string" ? body.event_id : null;
  const meeting = eventId ? await getEvent(eventId) : null;
  const isOfficer = actor.role.some((r) => r !== "member");
  // Prep tasks on an event can be added by its lead too ("Ben to book the room").
  const leads = meeting && (meeting.lead_id ?? meeting.posted_by) === actor.id;
  const self = owner?.id === actor.id;
  if (!open && !self && !isOfficer && !leads && meeting?.minutes_id !== actor.id && meeting?.chair_id !== actor.id) {
    return json({ error: "Actions are recorded by the minutes taker or the chair" }, { status: 403 });
  }
  try {
    return json(
      await createAgendaAction(actor, {
        text,
        owner_id: owner?.id ?? comrade?.profile_id ?? null,
        owner_comrade_id: comrade?.id ?? null,
        event_id: meeting?.id ?? null,
        due_date: due,
        source: typeof body?.source === "string" ? body.source : null,
      }),
      { status: 201 },
    );
  } catch (e) {
    return serverError(e);
  }
}
