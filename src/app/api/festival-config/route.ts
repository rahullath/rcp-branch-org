import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { getActiveFestival, saveFestival } from "@/lib/festivals";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The current festival, or null if none is set up. */
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  return json(await getActiveFestival());
}

/** `{ name, start_date, end_date, location?, url? }` — the admin sets or changes it. */
export async function PUT(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  if (!actor.isAdmin) return json({ error: "Only the admin can change the festival's details" }, { status: 403 });
  const body = await readJson(request);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  const start = typeof body?.start_date === "string" ? body.start_date : "";
  const end = typeof body?.end_date === "string" ? body.end_date : "";
  if (!name) return badRequest("Name the festival");
  if (!DAY.test(start) || !DAY.test(end) || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return badRequest("Give the first and last day");
  if (end < start) return badRequest("The last day is before the first");
  const url = typeof body?.url === "string" && body.url.trim() ? body.url.trim() : null;
  if (url && !/^https:\/\/\S+$/.test(url)) return badRequest("The link should start with https://");
  const location = typeof body?.location === "string" && body.location.trim() ? body.location.trim().slice(0, 100) : null;
  try {
    return json(await saveFestival({ name, start_date: start, end_date: end, location, url }));
  } catch (e) {
    return serverError(e);
  }
}
