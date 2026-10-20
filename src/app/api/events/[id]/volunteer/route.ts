import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getEvent, updateEvent } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import type { Event } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * "I'll chair" / "I'll take minutes" on a branch meeting with that slot
 * empty. Only fills a gap — changing who's down stays with the organisers.
 * Events are lead/officer-edit under RLS, so this one narrow write uses the
 * service role (as "I'll lead" on a programme topic does).
 */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const body = await readJson(request);
  const role = body?.role;
  if (role !== "chair" && role !== "minutes") return badRequest("role is chair or minutes");
  const event = await getEvent(id);
  if (!event || event.archived) return notFound("Meeting not found");
  if (event.event_type !== "branch") return badRequest("Only branch meetings have a chair and minutes");
  const column = role === "chair" ? "chair_id" : "minutes_id";
  if (event[column]) return badRequest(event[column] === actor.id ? "You're already down for it" : "Someone's already down for it");
  const other = role === "chair" ? event.minutes_id : event.chair_id;
  if (other === actor.id) return badRequest("Chairing and taking minutes at once is a lot — let someone else have this one");
  try {
    if (!isSupabaseConfigured) return json(await updateEvent(id, { [column]: actor.id }));
    const admin = createAdminClient();
    if (!admin) return json({ error: "Ask an organiser to put you down" }, { status: 503 });
    const { data, error: dbError } = await admin.from("events").update({ [column]: actor.id }).eq("id", id).is(column, null).select().single();
    if (dbError) throw new Error(dbError.message);
    return json(data as Event);
  } catch (e) {
    return serverError(e);
  }
}
