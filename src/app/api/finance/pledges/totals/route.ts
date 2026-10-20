import { json, serverError, withActor } from "@/lib/api";
import { pledgeTotals } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Branch levy totals — for everyone, without showing who pledged what. */
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await pledgeTotals());
  } catch (e) {
    return serverError(e);
  }
}
