import { json, serverError, withActor } from "@/lib/api";
import { buildInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";

/** Everything waiting on the signed-in comrade, plus lead updates for events they're going to. */
export async function GET() {
  const { actor, error } = await withActor();
  if (error) return error;
  try {
    return json(await buildInbox(actor));
  } catch (e) {
    return serverError(e);
  }
}
