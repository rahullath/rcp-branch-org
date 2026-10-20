import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/lib/auth";
import { branchForCode } from "@/lib/branches";
import { getPublicShare } from "@/lib/shares";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/** Where onboarding sends you when it's done (read by the onboarding flow). */
const RETURN_TO = "return_to";

/**
 * "Open in the app" from a share link. In the branch and signed in: straight
 * to the event. Otherwise: sign in, join with the code the branch-chat link
 * carried (`?c=`), do the first-run steps, then land on this event, not /home.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const share = await getPublicShare(token);
  if (!share) return NextResponse.redirect(new URL(`/s/${token}`, request.url));
  const eventPath = `/events/${share.event.id}`;
  const raw = (request.nextUrl.searchParams.get("c") ?? "").toUpperCase();
  const code = /^[A-Z0-9]{4,12}$/.test(raw) && (await branchForCode(raw)) ? raw : null;
  const actor = await getActor();

  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url));
    const opts = { maxAge: 7 * 86400, sameSite: "lax" as const, path: "/", secure: request.nextUrl.protocol === "https:" };
    res.cookies.set(RETURN_TO, eventPath, opts);
    if (code) res.cookies.set("pending_join", code, { ...opts, httpOnly: true });
    return res;
  };

  if (actor?.branch) {
    const res = NextResponse.redirect(new URL(actor.onboarded ? eventPath : "/onboarding", request.url));
    if (!actor.onboarded) res.cookies.set(RETURN_TO, eventPath, { maxAge: 7 * 86400, sameSite: "lax", path: "/" });
    return res;
  }
  if (actor) return go(code ? `/welcome/join?code=${code}` : "/welcome");
  // Back here after the email link, which then sorts out the rest.
  const back = `/s/${token}/go${code ? `?c=${code}` : ""}`;
  return go(`/login?next=${encodeURIComponent(back)}`);
}
