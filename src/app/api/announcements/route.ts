import { badRequest, json, readJson, requireRole, serverError, withActor } from "@/lib/api";
import { parseAnnouncement } from "@/lib/announcement-rules";
import { createAnnouncement, listAnnouncements } from "@/lib/announcements";

export const dynamic = "force-dynamic";

const WRITERS = ["social_media_officer", "organizer", "general_secretary"] as const;

/** Your branch's announcements that are still live. `?tag=` narrows to one group; `?all=1` (officers) includes ones past their end. */
export async function GET(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const q = new URL(request.url).searchParams;
  const all = q.get("all") === "1" && actor.role.some((r) => (WRITERS as readonly string[]).includes(r));
  try {
    return json(await listAnnouncements(actor, { all, tag: q.get("tag") ?? undefined }));
  } catch (e) {
    return serverError(e);
  }
}

/** `{ title, body?, link?, link_label?, deadline?, ends_on?, tag?, urgent?, signed_by? }` — social media officer, organizer or secretary. */
export async function POST(request: Request) {
  const { actor, error } = await requireRole(...WRITERS);
  if (error) return error;
  const parsed = parseAnnouncement(await readJson(request));
  if ("error" in parsed) return badRequest(parsed.error);
  try {
    return json(await createAnnouncement(actor, parsed.value), { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
