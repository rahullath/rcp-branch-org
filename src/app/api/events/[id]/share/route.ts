import { json, notFound, serverError, withActor } from "@/lib/api";
import { getEvent } from "@/lib/data";
import { canSeeCommittee } from "@/lib/auth";
import { listShares, shareForEvent } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The event's share link, if it has one. */
export async function GET(_request: Request, { params }: Params) {
  const { error } = await withActor();
  if (error) return error;
  const { id } = await params;
  try {
    return json((await listShares()).find((s) => s.event_id === id) ?? null);
  } catch (e) {
    return serverError(e);
  }
}

/** Make (or fetch) the event's link. Any member — sharing an event is how you bring people. Never for committee meetings. */
export async function POST(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || event.archived || (event.event_type === "committee" && !canSeeCommittee(actor))) return notFound("Event not found");
  if (event.event_type === "committee" || event.event_type === "one_on_one") return json({ error: "Committee meetings and 1-on-1s aren't shared outside" }, { status: 400 });
  try {
    return json(await shareForEvent(actor, id), { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
