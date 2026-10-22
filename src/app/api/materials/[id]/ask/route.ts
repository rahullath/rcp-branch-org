import { after } from "next/server";
import { json, notFound, withActor, badRequest } from "@/lib/api";
import { getMaterial, getProfile } from "@/lib/data";
import { listMaterialMoves, MISSING_ACTION } from "@/lib/data-extras";
import { notifyMaterialAsk } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** "Ask Jo" — nudges whoever was last logged with a missing item. They also see it in their inbox. */
export async function POST(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const material = await getMaterial(id);
  if (!material) return notFound("Material not found");
  const last = (await listMaterialMoves()).find((m) => m.material_id === id && m.action !== MISSING_ACTION);
  if (!last?.actor_id || last.actor_id === actor.id) return badRequest("Nobody else to ask");
  const who = await getProfile(last.actor_id);
  after(() => notifyMaterialAsk(actor, material, last.actor_id));
  return json({ ok: true, asked: who?.name ?? "them" });
}
