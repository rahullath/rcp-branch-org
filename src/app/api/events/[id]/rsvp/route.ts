import { json, serverError, withActor, readJson, badRequest, notFound } from "@/lib/api";
import { clearRsvp, getEvent, setRsvp } from "@/lib/data";
import { canSeeCommittee } from "@/lib/auth";
import { confirmIfReached } from "@/lib/event-status";
import { handBack } from "@/lib/away";
import { after } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const body = await readJson(request);
  // `status: null` clears the RSVP (tap the active answer again to undo).
  if (!body || (body.status !== null && !["going", "maybe", "no"].includes(body.status as string))) {
    return badRequest("Invalid status");
  }
  const event = await getEvent(id);
  if (!event || (event.archived) || (event.event_type === "committee" && !canSeeCommittee(actor))) {
    return notFound("Event not found");
  }
  try {
    if (body.status === null) await clearRsvp(actor, id);
    else await setRsvp(actor, id, body.status as "going" | "maybe" | "no");
    if (body.status === "going") await confirmIfReached(id);
    // Dropping out of something you'd taken on: it goes back on the list and the lead hears.
    if (body.status === "no" && Date.parse(event.start_time) > Date.now()) {
      const reason = typeof body.reason === "string" && body.reason.trim() ? `${body.reason.trim().slice(0, 140)}.` : "Can't make it now.";
      after(() => handBack(actor, event, { why: reason }).then(() => undefined));
    }
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
