import { badRequest, json, readJson } from "@/lib/api";
import { addPublicRsvp } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/** Public: "I'm coming" from the share page. Name (and a note) only. */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const body = await readJson(request);
  if (typeof body?.name !== "string") return badRequest("Your name, so they know who's coming");
  const res = await addPublicRsvp(token, body.name, typeof body.note === "string" ? body.note : null);
  return res.ok ? json({ ok: true }) : json({ error: res.error }, { status: 400 });
}
