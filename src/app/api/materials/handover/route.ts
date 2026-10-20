import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { createMaterial, getMaterial, getProfile } from "@/lib/data";
import { addMaterialMove, getComrade, moveMaterial } from "@/lib/data-v2";

export const dynamic = "force-dynamic";

/**
 * Hand several things to one person at once: `{ to, items: [{ id, qty }], bag? }`.
 * `bag` is for a lot nobody counted ("bag of leftover papers and IDOMs"): it's
 * recorded as one line with them, so it isn't lost track of.
 */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  const raw = typeof body?.to === "string" ? body.to : "";
  let to: { id: string; name: string; comrade?: boolean } | null = null;
  if (raw.startsWith("c:")) {
    const c = await getComrade(raw.slice(2));
    if (c) to = c.profile_id ? { id: c.profile_id, name: c.name } : { id: c.id, name: c.name, comrade: true };
  } else if (raw) {
    const p = await getProfile(raw.startsWith("p:") ? raw.slice(2) : raw);
    if (p) to = { id: p.id, name: p.name };
  }
  if (!to) return badRequest("Pick who you handed them to");
  const items = Array.isArray(body?.items) ? (body.items as { id?: unknown; qty?: unknown }[]) : [];
  const bag = typeof body?.bag === "string" ? body.bag.trim().slice(0, 140) : "";
  if (!items.length && !bag) return badRequest("Pick what you handed over");
  try {
    let moved = 0;
    for (const it of items) {
      if (typeof it.id !== "string") continue;
      const m = await getMaterial(it.id);
      if (!m || m.qty <= 0) continue;
      const qty = typeof it.qty === "number" && it.qty > 0 ? Math.min(it.qty, m.qty) : m.qty;
      await moveMaterial(actor, m, "pass", { to, qty });
      moved += qty;
    }
    if (bag) {
      const created = await createMaterial(actor, {
        name: bag,
        category: "literature",
        qty: 1,
        status: "in_use",
        ...(to.comrade ? { holder_comrade_id: to.id } : { holder_id: to.id }),
        holder_label: null,
        note: "Not counted. Open it and add what's inside when you can.",
        wanted: 0,
      });
      await addMaterialMove(actor, created.id, `handed it to ${to.name.replace(/^Comrade\s+/i, "")}`);
    }
    return json({ ok: true, moved, bag: !!bag, to: to.name });
  } catch (e) {
    return serverError(e);
  }
}
