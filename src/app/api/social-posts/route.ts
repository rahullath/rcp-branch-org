import { json, serverError, withActor, readJson, badRequest } from "@/lib/api";
import { createSocialPost, listSocialPosts } from "@/lib/data";
import type { SocialPostStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: SocialPostStatus[] = ["ready", "draft", "needs_review"];

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listSocialPosts());
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return badRequest("Title is required");
  }
  if (body.status && !STATUSES.includes(body.status as SocialPostStatus)) {
    return badRequest("Invalid status");
  }
  try {
    const post = await createSocialPost(actor, {
      title: body.title.trim(),
      day: typeof body.day === "string" ? body.day : "Mon",
      day_num: typeof body.day_num === "number" ? body.day_num : 1,
      platforms: typeof body.platforms === "string" ? body.platforms : "",
      status: (body.status as SocialPostStatus) ?? "draft",
      post_date: typeof body.post_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.post_date) ? body.post_date : null,
      event_id: typeof body.event_id === "string" ? body.event_id : null,
      image: typeof body.image === "string" && (body.image.startsWith("data:image/") || body.image.startsWith("https://")) ? body.image : null,
    });
    return json(post, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
