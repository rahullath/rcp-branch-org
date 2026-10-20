import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { createTopicIdea, listTopicIdeas } from "@/lib/data-v2";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  return json(await listTopicIdeas());
}

/** `{ title, kind?: "branch" | "open_meeting", note? }` — anyone can suggest a topic. */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) return badRequest("What's the topic?");
  try {
    return json(
      await createTopicIdea(actor, {
        title,
        kind: body?.kind === "open_meeting" ? "open_meeting" : "branch",
        note: typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null,
      }),
      { status: 201 },
    );
  } catch (e) {
    return serverError(e);
  }
}
