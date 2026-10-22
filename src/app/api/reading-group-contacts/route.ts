import { json, serverError, withActor } from "@/lib/api";
import { listReadingGroupContacts } from "@/lib/data-extras";

export const dynamic = "force-dynamic";

/** Which groups have contacts in them — ids only; names stay with whoever added them. */
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listReadingGroupContacts());
  } catch (e) {
    return serverError(e);
  }
}
