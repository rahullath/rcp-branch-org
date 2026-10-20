import { json, serverError, withActor, readJson, badRequest } from "@/lib/api";
import { listAvailability, upsertAvailability } from "@/lib/data";
import { applyAway, sameRange } from "@/lib/away";
import { WEEKDAYS, type AwayRange, type Weekday } from "@/lib/types";

const SLOT_RE = /^(mon|tue|wed|thu|fri|sat|sun):(am|aft|eve)$/;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { error } = await withActor();
  if (error) return error;
  const activity = new URL(request.url).searchParams.get("activity") ?? undefined;
  try {
    return json(await listAvailability(activity));
  } catch (e) {
    return serverError(e);
  }
}

/** Self-serve upsert of the signed-in member's own availability for one activity. */
export async function PATCH(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (!body || typeof body.activity !== "string" || !body.activity.trim()) {
    return badRequest("Activity is required");
  }
  if (body.days !== undefined) {
    if (!Array.isArray(body.days) || !body.days.every((d) => typeof d === "string" && WEEKDAYS.includes(d as Weekday))) {
      return badRequest("Days must be an array of weekday codes");
    }
  }
  if (body.slots !== undefined) {
    const ok = Array.isArray(body.slots) && body.slots.every((s) => typeof s === "string" && SLOT_RE.test(s));
    if (!ok) return badRequest('Slots look like "mon:eve"');
  }
  let added: AwayRange[] = [];
  if (body.away !== undefined) {
    const TIME = /^\d{2}:\d{2}$/;
    const ok =
      Array.isArray(body.away) &&
      body.away.every((a) => a && typeof a.from === "string" && typeof a.to === "string" && a.to >= a.from && (a.start == null || TIME.test(a.start)) && (a.end == null || TIME.test(a.end)) && (!a.start === !a.end) && (!a.start || a.end > a.start));
    if (!ok) return badRequest("Away needs a day (or from–to), and a start and end time if it's part of a day");
    const before = (await listAvailability(body.activity.trim())).find((r) => r.user_id === actor.id)?.away ?? [];
    added = (body.away as AwayRange[]).filter((a) => !before.some((b) => sameRange(a, b)));
  }
  try {
    const row = await upsertAvailability(actor.id, body.activity.trim(), {
      days: body.days as Weekday[] | undefined,
      note: "note" in body ? ((body.note as string | null) ?? null) : undefined,
      slots: body.slots as string[] | undefined,
      away: body.away as AwayRange[] | undefined,
    });
    // Last-minute or not: whatever you'd signed up for in that time is handed back, and the lead hears.
    const changed = await applyAway(actor, added);
    return json({ ...row, handedBack: changed.events });
  } catch (e) {
    return serverError(e);
  }
}
