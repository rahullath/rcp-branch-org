import { json, serverError, withActor, readJson, badRequest } from "@/lib/api";
import { createImport, type IngestRowInput } from "@/lib/data";
import { IMPORT_VERIFIERS, type ImportKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS = Object.keys(IMPORT_VERIFIERS) as ImportKind[];

export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");
  if (typeof body.source !== "string" || !body.source.trim()) {
    return badRequest("Field `source` is required");
  }
  if (!Array.isArray(body.rows)) return badRequest("Field `rows` (array) is required");

  const rows: IngestRowInput[] = [];
  for (const raw of body.rows as unknown[]) {
    const r = raw as Record<string, unknown>;
    if (!r || typeof r !== "object") return badRequest("Each row must be an object");
    const kind = r.kind as ImportKind;
    if (!KINDS.includes(kind)) {
      return badRequest(`Unknown kind "${String(r.kind)}" — expected one of ${KINDS.join(", ")}`);
    }
    const payload = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : {};
    rows.push({ kind, payload });
  }

  try {
    const batch = await createImport(actor, {
      source: (body.source as string).trim(),
      raw: typeof body.raw === "string" ? body.raw : undefined,
      rows,
    });
    return json(batch, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}