import { badRequest, json, readJson, withActor } from "@/lib/api";
import { districtSales, joinDistrictSale } from "@/lib/district";

export const dynamic = "force-dynamic";

/** Other branches' upcoming paper sales and stalls in your district. */
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  return json(await districtSales());
}

/** `{ event_id, status: "going" | "maybe" | "no" }` — join another branch's sale. */
export async function POST(request: Request) {
  const { error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  const status = body?.status;
  if (typeof body?.event_id !== "string" || !["going", "maybe", "no"].includes(status as string)) return badRequest("event_id and status");
  const res = await joinDistrictSale(body.event_id, status as "going" | "maybe" | "no");
  return res.ok ? json(res) : badRequest(res.error ?? "Couldn't do that");
}
