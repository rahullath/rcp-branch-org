import { json, serverError, withActor } from "@/lib/api";
import { listMaterialMoves } from "@/lib/data-v2";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listMaterialMoves());
  } catch (e) {
    return serverError(e);
  }
}
