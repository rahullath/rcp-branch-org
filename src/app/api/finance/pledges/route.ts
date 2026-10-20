import { json, serverError, withActor, requireRole, readJson, badRequest } from "@/lib/api";
import { createPledge, listPledges } from "@/lib/data";
import type { Pledge, PledgeStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: PledgeStatus[] = ["paid", "unpaid"];

/** Officers get every pledge; members only their own (the database enforces the same). */
export async function GET() {
  const { actor, error } = await withActor();
  if (error) return error;
  try {
    const rows = await listPledges();
    return json(actor.role.some((r) => r !== "member") ? rows : rows.filter((p) => p.user_id === actor.id));
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  const { actor, error } = await requireRole("finance_officer", "general_secretary");
  if (error) return error;
  const body = await readJson(request);
  if (typeof body?.amount !== "number" || !Number.isFinite(body.amount)) {
    return badRequest("Amount is required");
  }
  if (body.status && !STATUSES.includes(body.status as PledgeStatus)) {
    return badRequest("Invalid status");
  }
  try {
    const pledge = await createPledge(actor, {
      user_id: typeof body.user_id === "string" ? body.user_id : undefined,
      comrade_id: typeof body.comrade_id === "string" ? body.comrade_id : undefined,
      amount: body.amount,
      status: (body.status as PledgeStatus) ?? "unpaid",
      method: typeof body.method === "string" ? (body.method as Pledge["method"]) : null,
    });
    return json(pledge, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
