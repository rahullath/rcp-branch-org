import { json, serverError, withActor } from "@/lib/api";
import { listEventGuests } from "@/lib/data-extras";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listEventGuests());
  } catch (e) {
    return serverError(e);
  }
}
