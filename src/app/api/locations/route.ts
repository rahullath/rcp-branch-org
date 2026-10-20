import { json, serverError, withActor, readJson, badRequest } from "@/lib/api";
import { createLocation, listLocations } from "@/lib/data";
import type { LocationCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

const CATEGORIES: LocationCategory[] = ["paper_sale", "meeting", "uni_stall", "social"];

/** Up to 8 short lowercase labels. */
function cleanTags(v: unknown) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase().slice(0, 24)).filter(Boolean))].slice(0, 8);
}

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listLocations());
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
  if (body.category && !CATEGORIES.includes(body.category as LocationCategory)) {
    return badRequest("Invalid category");
  }
  try {
    const location = await createLocation(actor, {
      name: body.name.trim(),
      category: (body.category as LocationCategory) ?? "paper_sale",
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
      description: typeof body.description === "string" ? body.description : null,
      area: typeof body.area === "string" && body.area.trim() ? body.area.trim().slice(0, 40) : null,
      tags: cleanTags(body.tags),
      book_url: typeof body.book_url === "string" && /^https?:\/\//.test(body.book_url) ? body.book_url : null,
    });
    return json(location, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
