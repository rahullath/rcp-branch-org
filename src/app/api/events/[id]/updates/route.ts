import { after } from "next/server";
import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getEvent } from "@/lib/data";
import { addEventUpdate } from "@/lib/data-extras";
import { canRunEvent } from "@/lib/permissions";
import { notifyLeadUpdate } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The lead's message to everyone going — pushed only to people going. */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || event.archived) return notFound("Event not found");
  if (!canRunEvent(actor, event)) return json({ error: "Only the lead can post updates" }, { status: 403 });
  const body = await readJson(request);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return badRequest("Write something");
  if (text.length > 500) return badRequest("Keep it under 500 characters");
  try {
    const update = await addEventUpdate(actor, id, text);
    after(() => notifyLeadUpdate(actor, event, update));
    return json(update, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
