import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/lib/auth";
import { joinBranch } from "@/lib/branches";

export const dynamic = "force-dynamic";

/**
 * Joins the branch an invite pointed at, straight after sign-in, so nobody
 * is left on an empty screen wondering what to do. Clears the remembered
 * code; on any problem goes back to /welcome with the code filled in.
 */
export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") ?? "").toUpperCase();
  const actor = await getActor();
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url));
    res.cookies.set("pending_join", "", { maxAge: 0, path: "/" });
    return res;
  };
  if (!actor) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/welcome?code=${code}`)}`, request.url));
  if (actor.branch) return to("/home");
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return to("/welcome");
  const res = await joinBranch(code);
  if (!res.ok) return to(`/welcome?code=${encodeURIComponent(code)}&e=${encodeURIComponent(res.error ?? "That code didn't work")}`);
  return to("/onboarding");
}
