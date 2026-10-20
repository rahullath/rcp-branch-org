import { after } from "next/server";
import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { createEvent, getReadingGroup, listReadingGroupMembers, setRsvp, updateReadingGroup } from "@/lib/data";
import { canRunGroup } from "@/lib/reading-groups";
import { rsvpPayload } from "@/lib/notify";
import { sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Schedule the next session: `{ start_time, location?, reading }`. It becomes
 * an event (RSVPs, the 48h reminder, a short report after), the group's
 * "reading now" moves on, and only its members get the push.
 */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const group = await getReadingGroup(id);
  if (!group || group.archived) return notFound("Reading group not found");
  const members = await listReadingGroupMembers(id);
  if (!canRunGroup(actor, group, members)) return json({ error: "Only its leads or an officer can schedule a session" }, { status: 403 });
  const body = await readJson(request);
  const start = typeof body?.start_time === "string" && !Number.isNaN(Date.parse(body.start_time)) ? body.start_time : null;
  if (!start) return badRequest("When is it?");
  const reading = typeof body?.reading === "string" && body.reading.trim() ? body.reading.trim() : null;
  const location = typeof body?.location === "string" && body.location.trim() ? body.location.trim() : (group.location ?? "");
  try {
    const event = await createEvent(actor, {
      title: group.title,
      event_type: "reading_group",
      start_time: start,
      location,
      description: reading ? `Read before: ${reading}` : null,
      is_mobilization: false,
      lead_id: actor.id,
      reading_group_id: group.id,
    });
    await setRsvp(actor, event.id, "going").catch(() => {});
    if (reading) await updateReadingGroup(group.id, { current_chapter: reading });
    const others = members.map((m) => m.user_id).filter((u) => u !== actor.id);
    after(() => sendPush(others, "new_events", rsvpPayload(event, `${group.title} — next session`, reading ? `Read: ${reading}` : location || "Place TBC")));
    return json(event, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
