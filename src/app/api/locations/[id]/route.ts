import { json, requireOwnerOrRole, readJson, badRequest, notFound } from "@/lib/api";
import { archiveLocation, getLocation, updateLocation } from "@/lib/data";
import type { LocationCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

const CATEGORIES: LocationCategory[] = ["paper_sale", "meeting", "uni_stall", "social"];

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const location = await getLocation(id);
  if (!location) return notFound("Location not found");
  const { error } = await requireOwnerOrRole(location.created_by, "organizer");
  if (error) return error;
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");

  const patch: Record<string, unknown> = {};
  for (const key of ["name", "category", "lat", "lng", "description", "area", "tags", "book_url"] as const) {
    if (key in body) patch[key] = body[key];
  }
  if (patch.category !== undefined && !CATEGORIES.includes(patch.category as LocationCategory)) {
    return badRequest("Invalid category");
  }
  if (patch.tags !== undefined) {
    patch.tags = Array.isArray(patch.tags) ? [...new Set((patch.tags as unknown[]).filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase().slice(0, 24)).filter(Boolean))].slice(0, 8) : [];
  }
  if (patch.area !== undefined) patch.area = typeof patch.area === "string" && patch.area.trim() ? patch.area.trim().slice(0, 40) : null;
  if (patch.name !== undefined && (typeof patch.name !== "string" || !patch.name.trim())) {
    return badRequest("Name cannot be empty");
  }

  const updated = await updateLocation(id, patch);
  if (!updated) return notFound("Location not found");
  return json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const location = await getLocation(id);
  if (!location) return notFound("Location not found");
  const { error } = await requireOwnerOrRole(location.created_by, "organizer");
  if (error) return error;
  const ok = await archiveLocation(id);
  if (!ok) return notFound("Location not found");
  return json({ ok: true });
}
