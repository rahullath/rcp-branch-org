import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { getProfile } from "@/lib/data";
import { createComrade, listComrades } from "@/lib/data-v2";

export const dynamic = "force-dynamic";

/** People named in agendas — with or without an account. Everyone can read them (follow-up labels). */
export async function GET() {
  const { actor, error } = await withActor();
  if (error) return error;
  try {
    const rows = await listComrades();
    // View-only accounts see names, not numbers.
    return json(actor.viewOnly ? rows.map((c) => ({ ...c, phone: null })) : rows);
  } catch (e) {
    return serverError(e);
  }
}

/** Add someone by name and short forms ("Dan Price", ["DP", "Dan"]). Officers. */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  if (!actor.role.some((r) => r !== "member")) return json({ error: "People are kept by officers" }, { status: 403 });
  const body = await readJson(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("Give their name");
  const aliases = Array.isArray(body?.aliases) ? body.aliases.filter((a): a is string => typeof a === "string") : [];
  const profile = typeof body?.profile_id === "string" ? await getProfile(body.profile_id) : null;
  try {
    return json(await createComrade(actor, { name, aliases, profile_id: profile?.id ?? null }), { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
