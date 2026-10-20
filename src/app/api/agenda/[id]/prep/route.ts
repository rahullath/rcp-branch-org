import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getAgendaItem, getProfile, updateAgendaItem } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import type { AgendaItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * `{ with_id }` — who helps the lead-off prepare. Anyone can offer
 * themselves while nobody is; the education officer (or any officer) can
 * set or clear it. Agenda items are officer-edit under RLS, so the
 * self-offer uses the service role, as "I'll lead" does.
 */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const item = await getAgendaItem((await params).id);
  if (!item || item.archived) return notFound("Topic not found");
  if (item.section !== "political") return badRequest("Only discussion topics have a lead-off");
  const body = await readJson(request);
  const withId = body?.with_id === null ? null : typeof body?.with_id === "string" ? body.with_id : undefined;
  if (withId === undefined) return badRequest("with_id is required");
  if (withId && !(await getProfile(withId))) return badRequest("Pick who's helping");
  const isOfficer = actor.role.some((r) => r !== "member");
  const selfOffer = withId === actor.id && !item.prep_with_id;
  if (!isOfficer && !selfOffer && !(withId === null && item.prep_with_id === actor.id)) return json({ error: "Ask the education officer" }, { status: 403 });
  try {
    if (!isSupabaseConfigured || isOfficer) return json(await updateAgendaItem(item.id, { prep_with_id: withId }));
    const admin = createAdminClient();
    if (!admin) return json({ error: "Ask the education officer to put you down" }, { status: 503 });
    const { data, error: dbError } = await admin.from("agenda_items").update({ prep_with_id: withId }).eq("id", item.id).select().single();
    if (dbError) throw new Error(dbError.message);
    return json(data as AgendaItem);
  } catch (e) {
    return serverError(e);
  }
}
