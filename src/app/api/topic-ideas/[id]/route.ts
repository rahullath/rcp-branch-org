import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { createAgendaItem, getEvent } from "@/lib/data";
import { getTopicIdea, updateTopicIdea } from "@/lib/data-extras";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const PLANNERS = ["general_secretary", "organizer", "education_officer"];

/**
 * `{ interested: boolean }` — anyone, for themselves.
 * `{ event_id }` — organiser / education officer / GS: put it on that meeting as the discussion.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const idea = await getTopicIdea(id);
  if (!idea) return notFound("Not found");
  const body = await readJson(request);
  try {
    if (typeof body?.interested === "boolean") {
      const set = new Set(idea.interested ?? []);
      if (body.interested) set.add(actor.id);
      else set.delete(actor.id);
      return json(await updateTopicIdea(id, { interested: [...set] }));
    }
    if (typeof body?.event_id === "string") {
      if (!actor.role.some((r) => PLANNERS.includes(r))) return json({ error: "Organisers plan the programme" }, { status: 403 });
      const ev = await getEvent(body.event_id);
      if (!ev) return badRequest("Pick a meeting");
      await createAgendaItem(actor, { title: idea.title, section: "political", event_id: ev.id, meeting_date: ev.start_time.slice(0, 10), description: idea.note ?? null });
      return json(await updateTopicIdea(id, { used_event_id: ev.id }));
    }
    return badRequest("Nothing to change");
  } catch (e) {
    return serverError(e);
  }
}

/** Remove an idea — whoever suggested it, or an officer. */
export async function DELETE(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const idea = await getTopicIdea(id);
  if (!idea) return notFound("Not found");
  if (idea.created_by !== actor.id && !actor.role.some((r) => r !== "member")) return json({ error: "Only whoever suggested it, or an officer" }, { status: 403 });
  await updateTopicIdea(id, { archived: true });
  return json({ ok: true });
}
