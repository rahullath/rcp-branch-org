import { json, serverError, withActor, readJson, badRequest, notFound } from "@/lib/api";
import { createAgendaContribution, getAgendaItem } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Open to every comrade, unlike agenda items themselves: prep for a
 * discussion shouldn't be curated by officers only. */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const item = await getAgendaItem(id);
  if (!item) return notFound("Agenda item not found");

  const body = await readJson(request);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return badRequest("Text is required");

  try {
    const contribution = await createAgendaContribution(actor, id, text);
    return json(contribution, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
