import { badRequest, json, notFound, serverError, withActor } from "@/lib/api";
import { listSessions, updateSession } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import type { Session } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * "I'll lead" — any comrade can take an unassigned lead-off, so the
 * education officer doesn't have to ask around. Only fills a gap; changing
 * an existing lead-off stays with the education officer (PATCH /api/sessions/:id).
 * Sessions are officer-write under RLS, so this one narrow write uses the
 * service role.
 */
export async function POST(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const session = (await listSessions()).find((s) => s.id === id);
  if (!session) return notFound("Session not found");
  if (session.leadoff_name) return badRequest(`${session.leadoff_name} is already leading off`);
  try {
    if (!isSupabaseConfigured) return json(await updateSession(id, { leadoff_name: actor.name }));
    const admin = createAdminClient();
    if (!admin) return json({ error: "Ask the education officer — self sign-up isn't configured" }, { status: 503 });
    const { data, error: dbError } = await admin
      .from("sessions")
      .update({ leadoff_name: actor.name })
      .eq("id", id)
      .is("leadoff_name", null)
      .select()
      .single();
    if (dbError) throw new Error(dbError.message);
    return json(data as Session);
  } catch (e) {
    return serverError(e);
  }
}
