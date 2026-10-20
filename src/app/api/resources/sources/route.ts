import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { resourceSources, saveResourceSource } from "@/lib/resource-sources";
import { RESOURCE_SOURCES } from "@/data/resource-sources";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await resourceSources());
  } catch (e) {
    return serverError(e);
  }
}

const okUrl = (v: unknown) => v === null || v === "" || (typeof v === "string" && /^https:\/\/[^\s]+$/.test(v));

/** `{ key, url?, feed? }` — fix an outlet's link or feed (e.g. the podcast RSS). GS, education or social media officer. */
export async function PATCH(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  // Feed and link settings are app maintenance — admin only.
  if (!actor.isAdmin) {
    return json({ error: "Officers keep these up to date" }, { status: 403 });
  }
  if (!isSupabaseConfigured) return badRequest("Not in the demo");
  const body = await readJson(request);
  const key = typeof body?.key === "string" ? body.key : "";
  if (!RESOURCE_SOURCES.some((s) => s.key === key)) return badRequest("Unknown outlet");
  if (!okUrl(body?.url) || !okUrl(body?.feed)) return badRequest("Links must start with https://");
  try {
    await saveResourceSource(actor.id, { key, url: (body?.url as string) || null, feed: (body?.feed as string) || null });
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
