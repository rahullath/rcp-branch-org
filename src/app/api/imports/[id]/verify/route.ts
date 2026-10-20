import { json, withActor, readJson, badRequest, notFound } from "@/lib/api";
import { canVerifyImportRow } from "@/lib/permissions";
import { getImportRow, verifyImportRow } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;

  const row = await getImportRow(id);
  if (!row) return notFound("Import row not found");
  if (!canVerifyImportRow(actor, row.kind)) {
    return json({ error: `Forbidden — you don't verify "${row.kind}" imports` }, { status: 403 });
  }

  const body = (await readJson(request)) ?? {};
  try {
    const result = await verifyImportRow(actor, id, {
      payload: body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : undefined,
      mergeInto: typeof body.mergeInto === "string" ? body.mergeInto : undefined,
      consent: body.consent === true,
    });
    return json(result);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not verify");
  }
}
