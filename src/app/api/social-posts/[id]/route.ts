import { json, requireRole, readJson, badRequest, notFound } from "@/lib/api";
import { deleteSocialPost, updateSocialPost } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireRole("social_media_officer", "general_secretary");
  if (error) return error;
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  const patch: Record<string, unknown> = {};
  for (const key of ["day", "day_num", "title", "platforms", "status", "post_date", "event_id"] as const) {
    if (key in body) patch[key] = body[key];
  }
  // The graphic made for it — a JPEG data URL, kept small by the maker.
  if ("image" in body) {
    if (body.image !== null && !(typeof body.image === "string" && (body.image.startsWith("data:image/") || body.image.startsWith("https://")) && body.image.length < 1_500_000)) return badRequest("That image is too big or not an image");
    patch.image = body.image;
  }

  const updated = await updateSocialPost(id, patch);
  if (!updated) return notFound("Post not found");
  return json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { error } = await requireRole("social_media_officer", "general_secretary");
  if (error) return error;
  const { id } = await params;
  const ok = await deleteSocialPost(id);
  if (!ok) return notFound("Post not found");
  return json({ ok: true });
}
