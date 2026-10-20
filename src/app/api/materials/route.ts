import { json, serverError, withActor, readJson, badRequest } from "@/lib/api";
import { createMaterial, listMaterials } from "@/lib/data";
import type { MaterialCategory, MaterialStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const CATEGORIES: MaterialCategory[] = ["gear", "book", "literature"];
const STATUSES: MaterialStatus[] = ["available", "in_use", "missing"];

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listMaterials());
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return badRequest("Name is required");
  }
  if (body.category && !CATEGORIES.includes(body.category as MaterialCategory)) {
    return badRequest("Invalid category");
  }
  if (body.status && !STATUSES.includes(body.status as MaterialStatus)) {
    return badRequest("Invalid status");
  }
  try {
    const material = await createMaterial(actor, {
      name: body.name.trim(),
      description: typeof body.description === "string" ? body.description : null,
      icon: typeof body.icon === "string" ? body.icon : null,
      category: (body.category as MaterialCategory) ?? "gear",
      qty: typeof body.qty === "number" ? Math.max(0, body.qty) : 1,
      status: (body.status as MaterialStatus) ?? "available",
      holder_id: typeof body.holder_id === "string" ? body.holder_id : null,
      holder_label: typeof body.holder_label === "string" ? body.holder_label : null,
      note: typeof body.note === "string" ? body.note : null,
      holder_comrade_id: typeof body.holder_comrade_id === "string" ? body.holder_comrade_id : null,
      wanted: typeof body.wanted === "number" ? Math.max(0, body.wanted) : 0,
      purpose: typeof body.purpose === "string" && body.purpose.trim() ? body.purpose.trim().slice(0, 60) : null,
    });
    return json(material, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
