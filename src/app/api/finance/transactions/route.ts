import { json, serverError, withActor, requireRole, readJson, badRequest } from "@/lib/api";
import { createTransaction, listTransactions } from "@/lib/data";
import { TRANSACTION_CATEGORY_LABELS, type TransactionCategory, type TransactionType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPES: TransactionType[] = ["expense", "sale"];
const CATEGORIES = Object.keys(TRANSACTION_CATEGORY_LABELS) as TransactionCategory[];

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listTransactions());
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
  if (body.type && !TYPES.includes(body.type as TransactionType)) {
    return badRequest("Invalid type");
  }
  if (body.category && !CATEGORIES.includes(body.category as TransactionCategory)) {
    return badRequest("Invalid category");
  }
  try {
    const tx = await createTransaction(actor, {
      // The type carries the sign; a typed "-120" expense is still £120 out.
      amount: Math.abs(body.amount),
      type: (body.type as TransactionType) ?? "expense",
      category: (body.category as TransactionCategory) ?? null,
      description: typeof body.description === "string" ? body.description : "",
    });
    return json(tx, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
