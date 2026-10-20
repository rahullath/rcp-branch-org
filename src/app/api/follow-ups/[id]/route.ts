import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getProfile } from "@/lib/data";
import { endFollowUp, getComrade, getFollowUp, handOverFollowUp, touchFollowUp, updateFollowUp } from "@/lib/data-v2";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * `{ touch: true, note? }` — "spoke to them", the note kept in the history.
 * `{ handover_to: "p:<profile>" | "c:<People entry>", note? }` — pass them on.
 * `{ with_id: "<profile>" | null }` — someone experienced going along (or
 * "I'll come with you", which anyone can offer while nobody is).
 * The follower or an officer.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const f = await getFollowUp(id);
  if (!f || !f.active) return notFound("Not found");
  const body = await readJson(request);
  if (body && "with_id" in body) {
    const offering = body.with_id === actor.id && !f.with_id && f.follower_id !== actor.id;
    const allowed = offering || f.follower_id === actor.id || f.with_id === actor.id || actor.role.some((r) => r !== "member");
    if (!allowed) return json({ error: "Ask them or an officer" }, { status: 403 });
    if (body.with_id !== null && !(typeof body.with_id === "string" && (await getProfile(body.with_id)))) return badRequest("Pick who's going with them");
    if (body.with_id === f.follower_id) return badRequest("That's who follows them up already");
    return json(await updateFollowUp(id, { with_id: (body.with_id as string | null) ?? null }));
  }
  if (f.follower_id !== actor.id && !actor.role.some((r) => r !== "member")) return json({ error: "Only whoever follows them up can log this" }, { status: 403 });
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  try {
    if (typeof body?.handover_to === "string") {
      const raw = body.handover_to;
      if (raw.startsWith("p:")) {
        const p = await getProfile(raw.slice(2));
        if (!p) return badRequest("Pick who takes over");
        return json(await handOverFollowUp(actor, id, { profile_id: p.id, label: p.name }, note));
      }
      if (raw.startsWith("c:")) {
        const c = await getComrade(raw.slice(2));
        if (!c) return badRequest("Pick who takes over");
        return json(await handOverFollowUp(actor, id, c.profile_id ? { profile_id: c.profile_id, label: c.name } : { comrade_id: c.id, label: c.name }, note));
      }
      return badRequest("Pick who takes over");
    }
    if (body?.touch !== true) return badRequest("Nothing to change");
    return json(await touchFollowUp(actor, id, note));
  } catch (e) {
    return serverError(e);
  }
}

/** Stop following them up. The follower or an officer. */
export async function DELETE(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const f = await getFollowUp(id);
  if (!f) return notFound("Not found");
  if (f.follower_id !== actor.id && !actor.role.some((r) => r !== "member")) return json({ error: "Only whoever follows them up can end it" }, { status: 403 });
  try {
    await endFollowUp(id);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
