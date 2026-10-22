import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { listReadingTicks, setReadingTick } from "@/lib/data-extras";

export const dynamic = "force-dynamic";

/** "I've done the reading" — private to you, never shown to anyone else. */
export async function GET() {
  const { actor, error } = await withActor();
  if (error) return error;
  try {
    return json(await listReadingTicks(actor.id));
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (typeof body?.session_id !== "string" || typeof body.on !== "boolean") return badRequest("session_id and on are required");
  try {
    await setReadingTick(actor.id, body.session_id, body.on);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
