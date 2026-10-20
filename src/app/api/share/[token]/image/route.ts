import { getPublicShareImage } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/** Public: the link's graphic as a real image — the WhatsApp/Instagram preview. */
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const data = await getPublicShareImage(token);
  const m = data?.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=300" },
  });
}
