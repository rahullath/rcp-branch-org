import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getEvent } from "@/lib/data";
import { canRunEvent } from "@/lib/permissions";
import { getShare, revokeShare, setShareGraphic } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_IMAGE = 1_500_000;

/** `{ graphic, image }` — the picture the link shows and previews with. Any member. */
export async function PATCH(request: Request, { params }: Params) {
  const { error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const share = await getShare(id);
  if (!share || share.revoked_at) return notFound("Link not found");
  const body = await readJson(request);
  const image = typeof body?.image === "string" ? body.image : null;
  if (image && (!/^data:image\/(jpeg|png);base64,/.test(image) || image.length > MAX_IMAGE)) return badRequest("That image is too big or not a picture");
  const graphic = body?.graphic && typeof body.graphic === "object" ? (body.graphic as typeof share.graphic) : null;
  try {
    await setShareGraphic(id, graphic, image);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

/** Turn the link off — whoever made it, the event's lead, or an officer. */
export async function DELETE(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const share = await getShare(id);
  if (!share) return notFound("Link not found");
  const event = await getEvent(share.event_id);
  const allowed = share.created_by === actor.id || (event && canRunEvent(actor, event)) || actor.role.some((r) => r !== "member");
  if (!allowed) return json({ error: "Ask whoever made the link, or the event's lead" }, { status: 403 });
  try {
    await revokeShare(id);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
