import { json, serverError, withActor, readJson, badRequest } from "@/lib/api";
import { createReadingGroup, joinReadingGroup, listAllReadingGroupMembers, listReadingGroups } from "@/lib/data";
import { listReadingGroupContacts } from "@/lib/data-v2";
import { DEFAULT_CAPACITY, groupDetails, openGroupForBook } from "@/lib/reading-groups";

export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listReadingGroups());
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  const book = typeof body?.book === "string" && body.book.trim() ? body.book.trim() : typeof body?.title === "string" ? body.title.trim() : "";
  if (!book) return badRequest("Which book?");
  const capacity = typeof body?.capacity === "number" && body.capacity >= 2 && body.capacity <= 12 ? Math.round(body.capacity) : DEFAULT_CAPACITY;
  try {
    // Keep groups few and full: no second group on a book while one has room.
    const [groups, members, contacts] = await Promise.all([listReadingGroups(), listAllReadingGroupMembers(), listReadingGroupContacts()]);
    const open = openGroupForBook(book, groups, members, contacts);
    if (open) {
      return json({ error: `“${open.title}” is already reading this and has space — join it instead.`, group_id: open.id }, { status: 409 });
    }
    // A proposal ("Women's oppression") gathers interest until someone leads it; anything else starts led by its creator.
    const proposed = body?.status === "proposed";
    const group = await createReadingGroup(actor, {
      title: typeof body?.title === "string" && body.title.trim() ? body.title.trim() : book,
      book,
      capacity,
      cadence: str(body?.schedule) ?? str(body?.cadence),
      current_chapter: str(body?.current_chapter),
      ...groupDetails(body ?? {}),
      status: proposed ? "proposed" : "running",
      runner_id: proposed ? null : actor.id,
    });
    if (!proposed) await joinReadingGroup(group.id, actor.id, true);
    return json(group, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
