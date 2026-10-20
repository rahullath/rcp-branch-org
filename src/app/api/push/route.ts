import { json, withActor } from "@/lib/api";
import { listMyPushSubscriptions } from "@/lib/data-v2";
import { isPushConfigured, VAPID_PUBLIC_KEY } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Whether push is set up on the server, and how many of your devices get it. */
export async function GET() {
  const { actor, error } = await withActor();
  if (error) return error;
  const subs = await listMyPushSubscriptions(actor.id).catch(() => []);
  return json({ configured: isPushConfigured, publicKey: VAPID_PUBLIC_KEY, devices: subs.length });
}
