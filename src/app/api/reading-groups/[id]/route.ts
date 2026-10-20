import { json, readJson, badRequest, notFound, serverError, withActor } from "@/lib/api";
import { archiveReadingGroup, getReadingGroup, listReadingGroupMembers, updateReadingGroup } from "@/lib/data";
import { canRunGroup, groupDetails } from "@/lib/reading-groups";
import type { ReadingGroup } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Edit the specifics, move it on (proposed → running → finished). Its leads or an officer. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const group = await getReadingGroup(id);
  if (!group) return notFound("Reading group not found");
  const { actor, error } = await withActor();
  if (error) return error;
  if (!canRunGroup(actor, group, await listReadingGroupMembers(id))) return json({ error: "Only its leads or an officer can change this group" }, { status: 403 });
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  const patch: Partial<ReadingGroup> = groupDetails(body);
  for (const key of ["title", "book", "runner_id", "cadence", "current_chapter"] as const) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key];
  }
  if ("capacity" in body) {
    const c = Number(body.capacity);
    if (!(c >= 2 && c <= 12)) return badRequest("Between 2 and 12 people");
    patch.capacity = Math.round(c);
  }
  if ("status" in body) {
    if (!["proposed", "running", "finished"].includes(body.status as string)) return badRequest("Status is proposed, running or finished");
    patch.status = body.status as ReadingGroup["status"];
    if (patch.status === "running" && !group.runner_id && !patch.runner_id) patch.runner_id = actor.id;
  }
  if (patch.title !== undefined && (typeof patch.title !== "string" || !patch.title.trim())) return badRequest("Title cannot be empty");
  try {
    const updated = await updateReadingGroup(id, patch);
    if (!updated) return notFound("Reading group not found");
    return json(updated);
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const group = await getReadingGroup(id);
  if (!group) return notFound("Reading group not found");
  const { actor, error } = await withActor();
  if (error) return error;
  if (!canRunGroup(actor, group, await listReadingGroupMembers(id))) return json({ error: "Only its leads or an officer can close this group" }, { status: 403 });
  const ok = await archiveReadingGroup(id);
  if (!ok) return notFound("Reading group not found");
  return json({ ok: true });
}
