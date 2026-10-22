import { badRequest, json, notFound, readJson, requireRole, serverError } from "@/lib/api";
import { parseAnnouncement } from "@/lib/announcement-rules";
import { deleteAnnouncement, updateAnnouncement } from "@/lib/announcements";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const WRITERS = ["social_media_officer", "organizer", "general_secretary"] as const;

/** Edit an announcement. Same people who can post one. */
export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireRole(...WRITERS);
  if (error) return error;
  const { id } = await params;
  const parsed = parseAnnouncement(await readJson(request));
  if ("error" in parsed) return badRequest(parsed.error);
  try {
    const updated = await updateAnnouncement(id, parsed.value);
    return updated ? json(updated) : notFound("Announcement not found");
  } catch (e) {
    return serverError(e);
  }
}

/** Remove an announcement for everyone. */
export async function DELETE(_request: Request, { params }: Params) {
  const { error } = await requireRole(...WRITERS);
  if (error) return error;
  const { id } = await params;
  try {
    await deleteAnnouncement(id);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
