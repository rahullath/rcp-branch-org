import { json, serverError, withActor } from "@/lib/api";
import { listImportRequests } from "@/lib/data-extras";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Imports waiting for the admin (the admin sees all; anyone else their own). */
export async function GET() {
  const { actor, error } = await withActor();
  if (error) return error;
  try {
    const rows = await listImportRequests();
    // Supabase RLS already does this; the demo store doesn't.
    const visible = isSupabaseConfigured || actor.isAdmin ? rows : rows.filter((r) => r.user_id === actor.id);
    return json(visible.map(({ data, ...r }) => ({ ...r, rows: Object.values(r.only_rows ?? {}).reduce((n, a) => n + a.length, 0), modules: Object.keys(data ?? {}) })));
  } catch (e) {
    return serverError(e);
  }
}
