import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getImportRequest, updateImportRequest } from "@/lib/data-v2";
import { runJsonImport, type ImportModule } from "@/lib/json-import";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function adminRequest(params: Params["params"]) {
  const { actor, error } = await withActor();
  if (error) return { error };
  if (!actor.isAdmin) return { error: json({ error: "Only the admin reviews imports." }, { status: 403 }) };
  const req = await getImportRequest((await params).id);
  if (!req) return { error: notFound("Import not found") };
  return { actor, req };
}

/** The preview the admin reviews: every row, what it looks like already, what the sender ticked. */
export async function GET(_: Request, { params }: Params) {
  const r = await adminRequest(params);
  if (r.error) return r.error;
  try {
    const preview = await runJsonImport(r.actor, r.req.data, { apply: false, skip: ["contacts"] });
    return json({ request: r.req, lines: preview.lines.filter((l) => l.module !== "contacts"), warnings: preview.warnings });
  } catch (e) {
    return serverError(e);
  }
}

/** `{ approve: true, only }` imports the ticked rows, led by the sender. `{ approve: false, reply? }` declines. */
export async function PATCH(request: Request, { params }: Params) {
  const r = await adminRequest(params);
  if (r.error) return r.error;
  const { actor, req } = r;
  const body = await readJson(request);
  if (typeof body?.approve !== "boolean") return badRequest("approve must be true or false");
  if (req.status !== "pending") return json(req);
  const reply = typeof body.reply === "string" && body.reply.trim() ? body.reply.trim().slice(0, 500) : null;
  const decided = { decided_by: actor.id, decided_at: new Date().toISOString(), reply };
  try {
    if (!body.approve) return json(await updateImportRequest(req.id, { ...decided, status: "declined" }));
    const only = (body.only && typeof body.only === "object" ? body.only : req.only_rows ?? {}) as Partial<Record<ImportModule, number[]>>;
    await runJsonImport(actor, req.data, { apply: true, only, skip: ["contacts"], by: req.user_id });
    const imported = Object.entries(only).reduce((n, [m, a]) => n + (m === "contacts" ? 0 : (a?.length ?? 0)), 0);
    return json(await updateImportRequest(req.id, { ...decided, status: "approved", result: { imported } }));
  } catch (e) {
    return serverError(e);
  }
}
