import { json, withActor } from "@/lib/api";
import { districtMaterials } from "@/lib/district";

export const dynamic = "force-dynamic";

/** What the other branches in your district hold — to borrow, read only. */
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  return json(await districtMaterials());
}
