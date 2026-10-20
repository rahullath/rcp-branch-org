import { json, serverError, withActor } from "@/lib/api";
import { listRsvps } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listRsvps());
  } catch (e) {
    return serverError(e);
  }
}
