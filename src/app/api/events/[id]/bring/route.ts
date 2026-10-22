import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getEvent, getMaterial } from "@/lib/data";
import { addBringItem } from "@/lib/data-extras";
import { canRunEvent } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Add to the bring list — a material from the shared list, or free text. Lead/organiser only. */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || event.archived) return notFound("Event not found");
  if (!canRunEvent(actor, event)) return json({ error: "Only the lead can change the bring list" }, { status: 403 });
  const body = await readJson(request);
  const materialId = typeof body?.material_id === "string" ? body.material_id : null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!materialId && !label) return badRequest("Pick a material or type what's needed");
  if (materialId && !(await getMaterial(materialId))) return badRequest("Unknown material");
  try {
    const item = await addBringItem(id, {
      material_id: materialId,
      label: materialId ? null : label,
      qty: typeof body?.qty === "string" && body.qty.trim() ? body.qty.trim() : null,
    });
    return json(item, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
