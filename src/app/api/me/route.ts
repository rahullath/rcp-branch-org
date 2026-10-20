import { json, serverError } from "@/lib/api";
import { getActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getActor();
    return json({ actor });
  } catch (e) {
    return serverError(e);
  }
}
