import { json, requireRole, serverError } from "@/lib/api";
import { deleteGraphicTemplate } from "@/lib/graphic-templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Remove a saved design. Same people who can save one. */
export async function DELETE(_request: Request, { params }: Params) {
  const { error } = await requireRole("social_media_officer", "organizer", "general_secretary");
  if (error) return error;
  const { id } = await params;
  try {
    await deleteGraphicTemplate(id);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
