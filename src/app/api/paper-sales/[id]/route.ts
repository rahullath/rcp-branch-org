import { json, requireOwnerOrRole, readJson, badRequest, notFound } from "@/lib/api";
import { archiveEvent, getEvent, updateEvent } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** paper_sales is a filtered view over `events` (event_type: "paper_sale") —
 * mirrors how listPaperSales/createPaperSale already wrap listEvents/createEvent. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || event.event_type !== "paper_sale") return notFound("Paper sale not found");
  const { error } = await requireOwnerOrRole(event.posted_by, "paper_sales_officer", "finance_officer");
  if (error) return error;
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  const patch: Record<string, unknown> = {};
  if (typeof body.location === "string") patch.location = body.location;
  if (typeof body.sale_date === "string") patch.start_time = body.sale_date;
  if (typeof body.sale_time === "string" || body.sale_time === null) patch.meetup_time = body.sale_time;

  const updated = await updateEvent(id, patch);
  if (!updated) return notFound("Paper sale not found");
  return json({
    id: updated.id,
    location: updated.location,
    sale_date: updated.start_time,
    sale_time: updated.meetup_time,
    channel: "whatsapp",
    status: "announced",
    created_by: updated.posted_by,
    created_at: updated.created_at,
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || event.event_type !== "paper_sale") return notFound("Paper sale not found");
  const { error } = await requireOwnerOrRole(event.posted_by, "paper_sales_officer", "finance_officer");
  if (error) return error;
  const ok = await archiveEvent(id);
  if (!ok) return notFound("Paper sale not found");
  return json({ ok: true });
}
