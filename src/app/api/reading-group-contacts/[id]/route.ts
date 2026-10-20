import { json, notFound, withActor } from "@/lib/api";
import { getReadingGroupContact, removeReadingGroupContact } from "@/lib/data-v2";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const row = await getReadingGroupContact(id);
  if (!row) return notFound();
  if (row.added_by !== actor.id && !actor.role.includes("general_secretary")) return json({ error: "Only whoever added them can take them out" }, { status: 403 });
  await removeReadingGroupContact(id);
  return json({ ok: true });
}
