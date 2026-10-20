import { json, readJson, requireRole, serverError } from "@/lib/api";
import { acknowledgeCompletedChecklists } from "@/lib/data";

export const dynamic = "force-dynamic";

/** `{ id }` acknowledges one checklist; an empty body acknowledges all. */
export async function POST(request: Request) {
  const { error } = await requireRole("social_media_officer", "general_secretary");
  if (error) return error;
  const body = await readJson(request);
  try {
    await acknowledgeCompletedChecklists(typeof body?.id === "string" ? body.id : undefined);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
