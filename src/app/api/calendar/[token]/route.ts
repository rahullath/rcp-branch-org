import { calendarFeed } from "@/lib/onboarding";
import { buildFeed } from "@/lib/ics";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * The subscribed calendar (webcal://…/api/calendar/TOKEN.ics). No session —
 * calendar apps can't sign in — the secret token picks the person.
 */
export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const events = await calendarFeed(token.replace(/\.ics$/, ""));
  if (!events) return new Response("Not found", { status: 404 });
  const origin = new URL(request.url).origin;
  return new Response(buildFeed("Branch events", origin, events), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, max-age=900",
      "content-disposition": 'inline; filename="branch.ics"',
    },
  });
}
