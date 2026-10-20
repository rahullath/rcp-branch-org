import { json, serverError, withActor } from "@/lib/api";
import { listPendingImportRows } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const { actor, error } = await withActor();
  if (error) return error;

  try {
    return json(await listPendingImportRows(actor));
  } catch (e) {
    return serverError(e);
  }
}
