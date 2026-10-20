import { json, requireOwnerOrRole, withActor, readJson, badRequest, notFound } from "@/lib/api";
import { deleteMaterial, getMaterial, updateMaterial } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** These define the item itself — protected to creator/officers, matching
 * the protect_material_catalog_columns() DB trigger exactly. Everything
 * else (status, holder, notes) is day-to-day handover logistics, open to
 * any member — same as RSVPs. */
const CATALOG_FIELDS = ["name", "description", "category", "qty"] as const;

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const material = await getMaterial(id);
  if (!material) return notFound("Material not found");
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  const touchesCatalog = CATALOG_FIELDS.some((key) => key in body);
  if (touchesCatalog) {
    const { error } = await requireOwnerOrRole(material.created_by, "finance_officer", "paper_sales_officer");
    if (error) return error;
  } else {
    const { error } = await withActor();
    if (error) return error;
  }

  const patch: Record<string, unknown> = {};
  for (const key of ["name", "description", "icon", "category", "qty", "status", "holder_id", "holder_label", "note", "stock_badge", "holder_comrade_id", "wanted", "purpose"] as const) {
    if (key in body) patch[key] = body[key];
  }

  const updated = await updateMaterial(id, patch);
  if (!updated) return notFound("Material not found");
  return json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const material = await getMaterial(id);
  if (!material) return notFound("Material not found");
  const { error } = await requireOwnerOrRole(material.created_by, "finance_officer", "paper_sales_officer");
  if (error) return error;
  const ok = await deleteMaterial(id);
  if (!ok) return notFound("Material not found");
  return json({ ok: true });
}
