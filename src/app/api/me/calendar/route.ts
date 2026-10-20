import { json, serverError, withActor } from "@/lib/api";
import { calendarToken } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

const urls = (request: Request, token: string) => {
  const { host, origin } = new URL(request.url);
  const path = `/api/calendar/${token}.ics`;
  return {
    https: origin + path,
    webcal: `webcal://${host}${path}`,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://${host}${path}`)}`,
  };
};

/** Your private calendar-subscription links (made on first ask). */
export async function GET(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  try {
    return json(urls(request, await calendarToken(actor)));
  } catch (e) {
    return serverError(e);
  }
}

/** New link — the old one stops working (if it was shared by mistake). */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  try {
    return json(urls(request, await calendarToken(actor, true)));
  } catch (e) {
    return serverError(e);
  }
}
