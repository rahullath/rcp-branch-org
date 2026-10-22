import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { deleteAgendaAction, getAgendaAction, pushAgendaAction, setAgendaActionDone, updateAgendaAction } from "@/lib/data-extras";
import { londonDay } from "@/lib/follow-through";
import { getProfile } from "@/lib/data";
import { isOpenTask } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Tick done, push a week, or change text/date/event — its owner, whoever
 * recorded it, or an officer. `{ claim: true }` takes an open ask (anyone).
 * `{ hand_on: "branch" | "p:<id>" | "c:<id>", note? }` passes it on.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const action = await getAgendaAction(id);
  if (!action) return notFound("Action not found");
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");
  if (body.claim === true) {
    if (!isOpenTask(action)) return json({ error: "Someone's already taken this" }, { status: 409 });
    return json(await updateAgendaAction(id, { owner_id: actor.id, open_since: null, claimed_at: new Date().toISOString() }));
  }
  const allowed = action.owner_id === actor.id || action.created_by === actor.id || actor.role.some((r) => r !== "member");
  if (!allowed) return json({ error: "Only its owner can tick this off" }, { status: 403 });
  try {
    if (typeof body.hand_on === "string") {
      const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
      const from = action.owner_id ?? actor.id;
      const [kind, to] = body.hand_on.split(":");
      if (body.hand_on === "branch") {
        return json(await updateAgendaAction(id, { owner_id: null, owner_comrade_id: null, open_since: new Date().toISOString(), claimed_at: null, handed_from: from, hand_note: note }));
      }
      if (kind === "p" && to && (await getProfile(to))) {
        return json(await updateAgendaAction(id, { owner_id: to, owner_comrade_id: null, open_since: null, handed_from: from, hand_note: note }));
      }
      if (kind === "c" && to) return json(await updateAgendaAction(id, { owner_id: null, owner_comrade_id: to, open_since: null, handed_from: from, hand_note: note }));
      return badRequest("Hand it to the branch or a person");
    }
    if (typeof body.done === "boolean") return json(await setAgendaActionDone(id, body.done));
    // "Push a week" — the owner's honest answer when it isn't done; the count shows at branch.
    if (body.push === true) return json(await pushAgendaAction(action, londonDay(Date.now())));
    const patch: Parameters<typeof updateAgendaAction>[1] = {};
    if (typeof body.text === "string" && body.text.trim()) patch.text = body.text.trim();
    if ("due_date" in body) {
      if (body.due_date !== null && !(typeof body.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date))) return badRequest("due_date is YYYY-MM-DD");
      patch.due_date = body.due_date as string | null;
    }
    if ("event_id" in body) patch.event_id = typeof body.event_id === "string" ? body.event_id : null;
    if (Object.keys(patch).length === 0) return badRequest("Nothing to change");
    return json(await updateAgendaAction(id, patch));
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const action = await getAgendaAction(id);
  if (!action) return notFound("Action not found");
  const { actor, error } = await withActor();
  if (error) return error;
  if (action.created_by !== actor.id && !actor.role.some((r) => r !== "member")) return json({ error: "Ask whoever recorded it, or an officer" }, { status: 403 });
  await deleteAgendaAction(id);
  return json({ ok: true });
}
