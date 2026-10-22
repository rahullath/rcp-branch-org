import { json, notFound, requireOwnerOrRole } from "@/lib/api";
import { archivePoll, getPoll } from "@/lib/data-extras";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Close a poll early — whoever asked, or the GS. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const poll = await getPoll(id);
  if (!poll) return notFound("Poll not found");
  const { error } = await requireOwnerOrRole(poll.created_by);
  if (error) return error;
  await archivePoll(id);
  return json({ ok: true });
}
