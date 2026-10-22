import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getEvent } from "@/lib/data";
import { getComrade, setEventGuest } from "@/lib/data-extras";
import { comradeForName } from "@/lib/comrade-match";
import { confirmIfReached } from "@/lib/event-status";
import type { EventGuest } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const STATUSES: EventGuest["status"][] = ["going", "maybe", "no"];

/**
 * Mark someone without an account going/maybe/no — "Ivy, Morgan (maybe)"
 * from the chat. `{ comrade_id }` or `{ name }` (matched to People, or added).
 * They count toward the event's number like anyone else.
 */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || event.archived) return notFound("Event not found");
  const body = await readJson(request);
  const status = (body?.status ?? "going") as EventGuest["status"];
  if (!STATUSES.includes(status)) return badRequest("Status is going, maybe or no");
  try {
    const comrade =
      typeof body?.comrade_id === "string"
        ? await getComrade(body.comrade_id)
        : typeof body?.name === "string" && body.name.trim()
          ? await comradeForName(actor, body.name)
          : null;
    if (!comrade) return badRequest("Who? Give a name");
    if (comrade.profile_id) return badRequest(`${comrade.name} has an account — they can answer themselves`);
    const guest = await setEventGuest(actor, event.id, comrade.id, status);
    if (status === "going") await confirmIfReached(event.id);
    return json({ ...guest, comrade }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
