import { json, notFound, withActor } from "@/lib/api";
import { getEvent, listProfiles, listRsvps } from "@/lib/data";
import { canRunEvent } from "@/lib/permissions";
import { claimOnce, sendPush } from "@/lib/push";
import { rsvpPayload } from "@/lib/notify";
import { shortTitle } from "@/lib/data-v2";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The lead's one extra nudge to people who haven't answered. Once per event — that's it. */
export async function POST(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || event.archived) return notFound("Event not found");
  if (!canRunEvent(actor, event)) return json({ error: "Only the lead can send a reminder" }, { status: 403 });
  const [profiles, rsvps] = await Promise.all([listProfiles(), listRsvps()]);
  const answered = new Set(rsvps.filter((r) => r.event_id === id).map((r) => r.user_id));
  const unanswered = profiles.map((p) => p.id).filter((pid) => !answered.has(pid));
  if (!(await claimOnce(`lead-remind-${id}`))) return json({ error: "A reminder was already sent for this event" }, { status: 409 });
  const sent = await sendPush(unanswered, "reminders", rsvpPayload(event, `${shortTitle(event.title)}: are you coming?`, `${actor.name.replace(/^Comrade\s+/i, "")} is asking everyone who hasn't answered.`));
  return json({ ok: true, people: unanswered.length, devices: sent });
}
