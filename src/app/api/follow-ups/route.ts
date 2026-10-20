import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { getComrade, getFollowUp, listFollowUps, setFollowUp } from "@/lib/data-v2";
import { comradeForName } from "@/lib/comrade-match";
import { getProfile } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listFollowUps());
  } catch (e) {
    return serverError(e);
  }
}

/**
 * `{ person_id | person_name, follower_id? | follower_comrade_id? }` — who
 * follows up whom. Without a follower it's you. Officers can set anyone;
 * members can only take someone on themselves.
 */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  const isOfficer = actor.role.some((r) => r !== "member");
  try {
    const person =
      typeof body?.person_id === "string" ? await getComrade(body.person_id) : typeof body?.person_name === "string" && body.person_name.trim() ? await comradeForName(actor, body.person_name) : null;
    if (!person) return badRequest("Who are you following up?");
    let follower: { profile_id?: string | null; comrade_id?: string | null } = { profile_id: actor.id };
    if (typeof body?.follower_id === "string" && body.follower_id !== actor.id) {
      if (!isOfficer) return json({ error: "Officers set follow-ups for others — you can take people on yourself" }, { status: 403 });
      if (!(await getProfile(body.follower_id))) return badRequest("That account doesn't exist");
      follower = { profile_id: body.follower_id };
    } else if (typeof body?.follower_comrade_id === "string") {
      if (!isOfficer) return json({ error: "Officers set follow-ups for others" }, { status: 403 });
      const c = await getComrade(body.follower_comrade_id);
      if (!c) return badRequest("Who's following up?");
      follower = c.profile_id ? { profile_id: c.profile_id } : { comrade_id: c.id };
    }
    if (person.profile_id && person.profile_id === follower.profile_id) return badRequest("That's you");
    const row = await setFollowUp(actor, person.id, follower);
    return json((await getFollowUp(row.id)) ?? row, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
