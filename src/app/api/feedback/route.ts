import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { createFeedback, listFeedback } from "@/lib/feedback";
import type { Feedback } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS: Feedback["kind"][] = ["bug", "confusing", "idea", "works"];

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  return json(await listFeedback());
}

/** `{ kind, text, page? }` — the device is read from the request. */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!text) return badRequest("Say what happened");
  const kind = KINDS.includes(body?.kind as Feedback["kind"]) ? (body!.kind as Feedback["kind"]) : "bug";
  const page = typeof body?.page === "string" && body.page.startsWith("/") ? body.page.slice(0, 200) : null;
  const ua = request.headers.get("user-agent") ?? "";
  const device = [/iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : null, /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : /Firefox/.test(ua) ? "Firefox" : null]
    .filter(Boolean)
    .join(" · ") || null;
  try {
    return json(await createFeedback(actor, { kind, text, page, device }), { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
