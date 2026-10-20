import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { getProfile, updateProfile } from "@/lib/data";
import { prefsOf } from "@/lib/push";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const { actor, error } = await withActor();
  if (error) return error;
  return json(prefsOf(await getProfile(actor.id)));
}

/** Patch your own notification settings. Unknown keys are ignored. */
export async function PATCH(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");
  const current = prefsOf(await getProfile(actor.id));
  const next: NotificationPrefs = { ...current };
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFS) as (keyof NotificationPrefs)[]) {
    if (!(key in body)) continue;
    const value = body[key];
    if (key === "quiet_start" || key === "quiet_end") {
      if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return badRequest(`${key} must be HH:MM`);
      next[key] = value;
    } else {
      if (typeof value !== "boolean") return badRequest(`${key} must be true or false`);
      next[key] = value;
    }
  }
  try {
    await updateProfile(actor.id, { notification_prefs: next });
    return json(next);
  } catch (e) {
    return serverError(e);
  }
}
