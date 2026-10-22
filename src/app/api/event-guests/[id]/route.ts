import { json, notFound, serverError, withActor } from "@/lib/api";
import { getEventGuest, removeEventGuest } from "@/lib/data-extras";
import { removeShareRsvp } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { error } = await withActor();
  if (error) return error;
  const { id } = await params;
  try {
    // Someone who replied on the share link.
    if (id.startsWith("link-")) {
      await removeShareRsvp(id.slice(5));
      return json({ ok: true });
    }
    if (!(await getEventGuest(id))) return notFound("Not found");
    await removeEventGuest(id);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
