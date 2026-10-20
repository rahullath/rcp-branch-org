import { after } from "next/server";
import { json, serverError, withActor, readJson, badRequest } from "@/lib/api";
import { createEvent, listEvents, setRsvp } from "@/lib/data";
import { notifyNewEvent } from "@/lib/notify";
import { canSeeCommittee } from "@/lib/auth";
import type { Event, EventType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPES: EventType[] = [
  "paper_sale",
  "social",
  "branch",
  "open_meeting",
  "uni_stall",
  "phonebank",
  "postering",
  "mobilization",
  "one_on_one",
  "committee",
  "reading_group",
];

/**
 * A number and a deadline make it tentative ("needs 4 by Wed 5pm");
 * paper sale issue/copies; the reading group a session belongs to.
 */
function planFields(body: Record<string, unknown>): Partial<Event> {
  const out: Partial<Event> = {};
  const confirmBy = typeof body.confirm_by === "string" && !Number.isNaN(Date.parse(body.confirm_by)) ? body.confirm_by : null;
  const target = typeof body.target === "number" && body.target > 0;
  if (confirmBy && target) {
    out.confirm_by = confirmBy;
    out.status = "tentative";
  }
  if (typeof body.paper_issue === "string" && body.paper_issue.trim()) out.paper_issue = body.paper_issue.trim();
  if (typeof body.copies_out === "number" && body.copies_out >= 0) out.copies_out = Math.round(body.copies_out);
  if (typeof body.reading_group_id === "string" && body.reading_group_id) out.reading_group_id = body.reading_group_id;
  if (body.scope === "district" || body.scope === "national") out.scope = body.scope;
  return out;
}

export async function GET(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? undefined;
  try {
    return json(await listEvents({ type }, canSeeCommittee(actor), actor.id));
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return badRequest("Title is required");
  }
  if (body.event_type && !TYPES.includes(body.event_type as EventType)) {
    return badRequest("Invalid event type");
  }
  try {
    const event = await createEvent(actor, {
      title: body.title.trim(),
      event_type: (body.event_type as EventType) ?? "branch",
      start_time: typeof body.start_time === "string" ? body.start_time : new Date().toISOString(),
      location: typeof body.location === "string" ? body.location : "",
      description: typeof body.description === "string" ? body.description : null,
      is_mobilization: Boolean(body.is_mobilization),
      meetup_time: typeof body.meetup_time === "string" ? body.meetup_time : null,
      chair_id: typeof body.chair_id === "string" ? body.chair_id : null,
      minutes_id: typeof body.minutes_id === "string" ? body.minutes_id : null,
      lead_id: typeof body.lead_id === "string" ? body.lead_id : actor.id,
      target: typeof body.target === "number" && body.target > 0 ? Math.round(body.target) : null,
      session_id: typeof body.session_id === "string" ? body.session_id : null,
      ...planFields(body),
    });
    // Whoever makes an event is going to it; everyone else gets one push.
    await setRsvp(actor, event.id, "going").catch(() => {});
    after(() => notifyNewEvent(actor, event));
    return json(event, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
