import { json, serverError, withActor } from "@/lib/api";
import { listEventReports } from "@/lib/data-v2";

export const dynamic = "force-dynamic";

/** Every report in the branch: what actually sold, for the paper sales list. */
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listEventReports());
  } catch (e) {
    return serverError(e);
  }
}
