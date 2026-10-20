import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { castVote, getPoll } from "@/lib/data-v2";
import { pollIsOpen } from "@/lib/inbox";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** `{ option }` votes (or moves your vote); `{ option: null }` withdraws it. */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const poll = await getPoll(id);
  if (!poll) return notFound("Poll not found");
  if (!pollIsOpen(poll, Date.now())) return badRequest("This poll has closed");
  const body = await readJson(request);
  const option = body?.option;
  if (option !== null && (typeof option !== "string" || !poll.options.includes(option))) return badRequest("Not one of the options");
  try {
    await castVote(actor, id, option as string | null);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
