import { json, requireRole, readJson, badRequest, notFound } from "@/lib/api";
import { deletePledge, updatePledge } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireRole("finance_officer", "general_secretary");
  if (error) return error;
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  const patch: Record<string, unknown> = {};
  for (const key of ["amount", "status", "method", "paid_at"] as const) {
    if (key in body) patch[key] = body[key];
  }

  const updated = await updatePledge(id, patch);
  if (!updated) return notFound("Pledge not found");
  return json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { error } = await requireRole("general_secretary");
  if (error) return error;
  const { id } = await params;
  const ok = await deletePledge(id);
  if (!ok) return notFound("Pledge not found");
  return json({ ok: true });
}
