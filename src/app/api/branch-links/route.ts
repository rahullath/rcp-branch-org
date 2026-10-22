import { badRequest, json, readJson, requireRole, serverError, withActor } from "@/lib/api";
import { getBranchLinks, saveBranchLinks } from "@/lib/branch-links";

export const dynamic = "force-dynamic";

/** Your branch's saved WhatsApp and Instagram links (null if none yet). */
export async function GET() {
  const { actor, error } = await withActor();
  if (error) return error;
  return json(await getBranchLinks(actor));
}

/** `{ whatsapp?, instagram? }` — social media officer, organizer or GS. Send "" or null to clear one. */
export async function PUT(request: Request) {
  const { actor, error } = await requireRole("social_media_officer", "organizer", "general_secretary");
  if (error) return error;
  const body = await readJson(request);
  const pick = (key: "whatsapp" | "instagram") => {
    if (!body || !(key in body)) return undefined;
    const v = typeof body[key] === "string" ? (body[key] as string).trim() : "";
    return v || null;
  };
  const whatsapp = pick("whatsapp");
  const instagram = pick("instagram");
  for (const v of [whatsapp, instagram]) if (v && !/^https?:\/\/\S+$/.test(v)) return badRequest("A link should start with https://");
  const current = await getBranchLinks(actor);
  try {
    return json(
      await saveBranchLinks(actor, {
        whatsapp: whatsapp === undefined ? (current?.whatsapp ?? null) : whatsapp,
        instagram: instagram === undefined ? (current?.instagram ?? null) : instagram,
      }),
    );
  } catch (e) {
    return serverError(e);
  }
}
