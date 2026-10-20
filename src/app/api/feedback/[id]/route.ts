import { json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { deleteFeedback, getFeedback, updateFeedback } from "@/lib/feedback";
import type { Feedback } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const STATUSES: Feedback["status"][] = ["open", "fixed", "wontfix"];

/** The writer edits their note; the writer or the GS sets status and replies. */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const row = await getFeedback(id);
  if (!row) return notFound("Not found");
  // Status and replies are the admin's (the app's developer); the writer can edit their own note.
  if (row.user_id !== actor.id && !actor.isAdmin) return json({ error: "Only the writer can change this" }, { status: 403 });
  const body = await readJson(request);
  const patch: Partial<Feedback> = {};
  if (typeof body?.text === "string" && row.user_id === actor.id && body.text.trim()) patch.text = body.text.trim().slice(0, 2000);
  if (STATUSES.includes(body?.status as Feedback["status"]) && (actor.isAdmin || row.user_id === actor.id)) {
    patch.status = body!.status as Feedback["status"];
    patch.resolved_at = patch.status === "open" ? null : new Date().toISOString();
  }
  if (typeof body?.reply === "string" && actor.isAdmin) patch.reply = body.reply.trim().slice(0, 1000) || null;
  try {
    return json(await updateFeedback(id, patch));
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const row = await getFeedback(id);
  if (!row) return notFound("Not found");
  if (row.user_id !== actor.id && !actor.isAdmin) return json({ error: "Only the writer can delete this" }, { status: 403 });
  try {
    await deleteFeedback(id);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
