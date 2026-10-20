import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { dismissAsk } from "@/lib/data-v2";

export const dynamic = "force-dynamic";

/** "Not me" — hides one ask for this person only. */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (!body || typeof body.key !== "string" || !/^[a-z]+-[\w-]+$/.test(body.key)) return badRequest("Invalid key");
  try {
    await dismissAsk(actor.id, body.key);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
