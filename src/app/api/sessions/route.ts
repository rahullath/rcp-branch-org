import { json, serverError, withActor, requireRole, readJson, badRequest } from "@/lib/api";
import { createSession, listSessions } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listSessions());
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  const { error } = await requireRole("education_officer", "general_secretary");
  if (error) return error;
  const body = await readJson(request);
  if (!body || typeof body.topic !== "string" || !body.topic.trim()) {
    return badRequest("Topic is required");
  }
  try {
    const session = await createSession({
      series_id: typeof body.series_id === "string" ? body.series_id : undefined,
      position: typeof body.position === "number" ? body.position : undefined,
      topic: body.topic.trim(),
      session_date: typeof body.session_date === "string" ? body.session_date : null,
      start_time: typeof body.start_time === "string" ? body.start_time : null,
      location: typeof body.location === "string" ? body.location : null,
      leadoff_name: typeof body.leadoff_name === "string" ? body.leadoff_name : null,
      chair_name: typeof body.chair_name === "string" ? body.chair_name : null,
      reading_link: typeof body.reading_link === "string" ? body.reading_link : null,
    });
    return json(session, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
