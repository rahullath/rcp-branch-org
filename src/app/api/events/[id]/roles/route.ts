import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getEvent } from "@/lib/data";
import { addEventRole } from "@/lib/data-v2";
import { canRunEvent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || event.archived) return notFound("Event not found");
  if (!canRunEvent(actor, event)) return json({ error: "Only the lead can add roles" }, { status: 403 });
  const body = await readJson(request);
  const role = typeof body?.role === "string" ? body.role.trim() : "";
  if (!role) return badRequest("Name the role");
  try {
    // The lead can put someone straight in it.
    const userId = typeof body?.user_id === "string" && body.user_id ? body.user_id : null;
    return json(await addEventRole(id, role, userId), { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
