import { badRequest, json, notFound, serverError, withActor } from "@/lib/api";
import { getAgendaItem, updateAgendaItem } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import type { AgendaItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * "I'll lead" on a programme topic with no lead-off yet. Only fills a gap —
 * changing an existing lead-off stays with the education officer. Agenda
 * items are officer-edit under RLS, so this one narrow write uses the
 * service role.
 */
export async function POST(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const item = await getAgendaItem(id);
  if (!item || item.archived) return notFound("Topic not found");
  if (item.section !== "political") return badRequest("Only discussion topics have a lead-off");
  if (item.leadoff_name) return badRequest(`${item.leadoff_name} is already down to lead off`);
  try {
    if (!isSupabaseConfigured) return json(await updateAgendaItem(id, { leadoff_name: actor.name }));
    const admin = createAdminClient();
    if (!admin) return json({ error: "Ask the education officer — self sign-up isn't configured" }, { status: 503 });
    const { data, error: dbError } = await admin.from("agenda_items").update({ leadoff_name: actor.name }).eq("id", id).select().single();
    if (dbError) throw new Error(dbError.message);
    return json(data as AgendaItem);
  } catch (e) {
    return serverError(e);
  }
}
