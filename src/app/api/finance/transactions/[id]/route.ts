import { json, requireRole, readJson, badRequest, notFound } from "@/lib/api";
import { deleteTransaction, updateTransaction } from "@/lib/data";
import type { TransactionType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPES: TransactionType[] = ["expense", "sale"];

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireRole("finance_officer", "general_secretary");
  if (error) return error;
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");
  if (body.type !== undefined && !TYPES.includes(body.type as TransactionType)) {
    return badRequest("Invalid type");
  }
  if (body.amount !== undefined && (typeof body.amount !== "number" || !Number.isFinite(body.amount))) {
    return badRequest("Amount must be a number");
  }

  const patch: Record<string, unknown> = {};
  for (const key of ["amount", "type", "category", "description"] as const) {
    if (key in body) patch[key] = body[key];
  }
  if (typeof patch.amount === "number") patch.amount = Math.abs(patch.amount);
  const updated = await updateTransaction(id, patch);
  if (!updated) return notFound("Transaction not found");
  return json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { error } = await requireRole("general_secretary");
  if (error) return error;
  const { id } = await params;
  const ok = await deleteTransaction(id);
  if (!ok) return notFound("Transaction not found");
  return json({ ok: true });
}
