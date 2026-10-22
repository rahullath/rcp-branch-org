import { json, readJson, serverError, withActor } from "@/lib/api";
import { setDismissed } from "@/lib/announcements";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** `{ dismissed?: boolean }` — hide it for you only (default), or bring it back with `false`. */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const body = await readJson(request);
  try {
    await setDismissed(actor, id, body?.dismissed !== false);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
