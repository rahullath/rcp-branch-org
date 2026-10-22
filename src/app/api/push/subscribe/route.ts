import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { deletePushSubscription, savePushSubscription } from "@/lib/data-extras";

export const dynamic = "force-dynamic";

function parse(body: Record<string, unknown> | null) {
  const keys = body?.keys as { p256dh?: unknown; auth?: unknown } | undefined;
  if (typeof body?.endpoint !== "string" || !body.endpoint.startsWith("https://")) return null;
  if (typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") return null;
  return { endpoint: body.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** Body is the browser's PushSubscription.toJSON(). */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const sub = parse(await readJson(request));
  if (!sub) return badRequest("Invalid subscription");
  try {
    await savePushSubscription(actor.id, sub);
    return json({ ok: true }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(request: Request) {
  const { error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (typeof body?.endpoint !== "string") return badRequest("endpoint is required");
  await deletePushSubscription(body.endpoint);
  return json({ ok: true });
}
