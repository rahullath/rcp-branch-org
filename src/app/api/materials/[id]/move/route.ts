import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getMaterial, getProfile } from "@/lib/data";
import { getComrade, moveMaterial, type MaterialMoveKind } from "@/lib/data-extras";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const KINDS: MaterialMoveKind[] = ["take", "found", "return", "pass", "missing", "sold"];

/** Day-to-day handover and sales: open to any member, logged with a name and date. `qty` for part of a pile. */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const material = await getMaterial(id);
  if (!material) return notFound("Material not found");
  const body = await readJson(request);
  const kind = body?.kind as MaterialMoveKind;
  if (!KINDS.includes(kind)) return badRequest("Unknown move");
  let to: { id: string; name: string; comrade?: boolean } | undefined;
  if (kind === "pass") {
    // A profile id, or "c:<id>" for someone in People without an account.
    const raw = typeof body?.to === "string" ? body.to : "";
    if (raw.startsWith("c:")) {
      const c = await getComrade(raw.slice(2));
      if (!c) return badRequest("Pick who you passed it to");
      to = c.profile_id ? { id: c.profile_id, name: c.name } : { id: c.id, name: c.name, comrade: true };
    } else {
      const profile = raw ? await getProfile(raw) : null;
      if (!profile) return badRequest("Pick who you passed it to");
      to = { id: profile.id, name: profile.name };
    }
  }
  try {
    const qty = typeof body?.qty === "number" && body.qty > 0 ? body.qty : undefined;
    return json(await moveMaterial(actor, material, kind, { to, qty }));
  } catch (e) {
    return serverError(e);
  }
}
