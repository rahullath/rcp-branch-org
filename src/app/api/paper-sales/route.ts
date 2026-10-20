import { json, serverError, withActor, readJson, badRequest } from "@/lib/api";
import { createPaperSale, listPaperSales } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listPaperSales());
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (!body || typeof body.location !== "string" || !body.location.trim()) {
    return badRequest("Location is required");
  }
  try {
    const sale = await createPaperSale(actor, {
      location: body.location.trim(),
      sale_date: typeof body.sale_date === "string" ? body.sale_date : undefined,
      sale_time: typeof body.sale_time === "string" ? body.sale_time : null,
    });
    return json(sale, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
