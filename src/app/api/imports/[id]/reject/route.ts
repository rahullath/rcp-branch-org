import { json, withActor, badRequest, notFound } from "@/lib/api";
import { canVerifyImportRow } from "@/lib/permissions";
import { getImportRow, rejectImportRow } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;

  const row = await getImportRow(id);
  if (!row) return notFound("Import row not found");
  if (!canVerifyImportRow(actor, row.kind)) {
    return json({ error: `Forbidden — you don't verify "${row.kind}" imports` }, { status: 403 });
  }

  try {
    return json(await rejectImportRow(actor, id));
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Could not reject");
  }
}
