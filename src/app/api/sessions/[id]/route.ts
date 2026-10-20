import { json, requireRole, readJson, badRequest, notFound } from "@/lib/api";
import { deleteSession, updateSession } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireRole("education_officer", "general_secretary");
  if (error) return error;
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  const patch: Record<string, unknown> = {};
  for (const key of ["completed", "session_date", "start_time", "location", "leadoff_name", "chair_name", "reading_link", "prep_questions", "summary"] as const) {
    if (key in body) patch[key] = body[key];
  }

  const updated = await updateSession(id, patch);
  if (!updated) return notFound("Session not found");
  return json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { error } = await requireRole("education_officer", "general_secretary");
  if (error) return error;
  const { id } = await params;
  const ok = await deleteSession(id);
  if (!ok) return notFound("Session not found");
  return json({ ok: true });
}
