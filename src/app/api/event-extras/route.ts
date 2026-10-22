import { json, serverError, withActor } from "@/lib/api";
import { listEventExtras } from "@/lib/data-extras";

export const dynamic = "force-dynamic";

/** Bring lists, roles and lead updates for every event — small branch, one call. */
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listEventExtras());
  } catch (e) {
    return serverError(e);
  }
}
