import { json, serverError, withActor, readJson, badRequest, notFound } from "@/lib/api";
import { getEvent, getEventChecklistByEvent, upsertEventChecklist } from "@/lib/data";
import {
  CHECKLIST_EVENT_TYPES,
  CHECKLIST_ITEM_LABELS,
  type ChecklistItemValue,
  type ChecklistItems,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const ITEM_KEYS = Object.keys(CHECKLIST_ITEM_LABELS) as (keyof ChecklistItems)[];

type Params = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { error } = await withActor();
  if (error) return error;
  const { eventId } = await params;
  try {
    return json(await getEventChecklistByEvent(eventId));
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event) return notFound("Event not found");
  if (!CHECKLIST_EVENT_TYPES.includes(event.event_type)) {
    return badRequest("This event type doesn't take a checklist");
  }
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  const items: ChecklistItems = {};
  if (body.items && typeof body.items === "object") {
    for (const key of ITEM_KEYS) {
      const raw = (body.items as Record<string, unknown>)[key];
      if (typeof raw === "boolean") {
        items[key] = { checked: raw };
      } else if (
        raw &&
        typeof raw === "object" &&
        typeof (raw as ChecklistItemValue).checked === "boolean"
      ) {
        items[key] = { checked: (raw as ChecklistItemValue).checked };
      }
    }
  }
  const photoUrl = "photo_url" in body ? ((body.photo_url as string | null) ?? null) : undefined;
  const videoUrls = Array.isArray(body.video_urls) ? (body.video_urls as string[]).filter((v) => typeof v === "string") : undefined;

  try {
    const updated = await upsertEventChecklist(actor, eventId, { items, photo_url: photoUrl, video_urls: videoUrls });
    return json(updated);
  } catch (e) {
    return serverError(e);
  }
}
