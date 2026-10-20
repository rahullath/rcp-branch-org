import { json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getEvent } from "@/lib/data";
import { deleteSharedRead, getSharedRead, setMainRead, updateSharedRead } from "@/lib/data-v2";
import { eventLead } from "@/lib/types";
import { mirrorToPrep } from "@/lib/preread-sync";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * `{ read: true }`: you've read it (drops out of your inbox). `{ main: true }`:
 * the one to do if you only do one (the event's lead, whoever shared it, or an officer).
 */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const r = await getSharedRead((await params).id);
  if (!r) return notFound("Not found");
  const body = await readJson(request);
  if (body?.main === true) {
    const e = r.event_id ? await getEvent(r.event_id) : null;
    if (r.shared_by !== actor.id && !actor.role.some((x) => x !== "member") && !(e && eventLead(e) === actor.id)) return json({ error: "The lead or an officer picks the main one" }, { status: 403 });
    return json(await setMainRead(r));
  }
  try {
    const read_by = body?.read === false ? r.read_by.filter((x) => x !== actor.id) : [...new Set([...r.read_by, actor.id])];
    return json(await updateSharedRead(r.id, { read_by }));
  } catch (e) {
    return serverError(e);
  }
}

/** Whoever shared it, or an officer. */
export async function DELETE(_: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const r = await getSharedRead((await params).id);
  if (!r) return notFound("Not found");
  if (r.shared_by !== actor.id && !actor.role.some((x) => x !== "member")) return json({ error: "Only whoever shared it" }, { status: 403 });
  await deleteSharedRead(r.id);
  if (r.event_id) await mirrorToPrep(r.event_id, { label: r.title, url: r.url }, true);
  return json({ ok: true });
}
