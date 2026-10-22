import { type NextRequest, NextResponse } from "next/server";
import { isDemoAllowed, isSupabaseConfigured } from "@/lib/config";
import { LIMITS, retryAfter } from "@/lib/rate-limit";

/** Cookie holding an invite's branch code until the person has joined. */
const PENDING_JOIN = "pending_join";
/** The address people are given (NEXT_PUBLIC_SITE_URL). Unset: no redirect. */
const CANONICAL_HOST = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host : null;

const PUBLIC_PATHS = [
  "/login",
  // The root page sends you on: your week, sign-in, or (on the demo) the guide.
  "/",
  // How the app works and how to run it.
  "/guide",
  "/auth/callback",
  "/auth/confirm",
  "/api/auth",
  // Public resource-library feed — every linked item is already public
  // content (communist.red, marxist.com, YouTube), nothing member-specific.
  "/feed.xml",
  // Reminder cron — authenticates itself with CRON_SECRET.
  "/api/cron",
  // Share links: one event per unguessable token, read through narrow
  // SQL functions — nothing else is reachable from these.
  "/s",
  "/api/share",
  // Branch invites: shows the branch name for a code, then sends you to sign in.
  "/join",
  // PWA files: installable and offline-capable from the sign-in page too.
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
  "/icons",
  // Calendar subscription feed: calendar apps can't sign in; a secret token per person.
  "/api/calendar",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isSupabaseConfigured && !isDemoAllowed) {
    return new NextResponse("This copy isn't set up yet: its database settings are missing. See /docs/run-your-own.md in the repository.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const rule = LIMITS.find((l) => l.path.test(pathname));
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  const wait = rule && ip ? retryAfter(`${rule.path.source}|${ip}`, rule.limit, rule.windowMs) : null;
  if (wait !== null) {
    const headers = { "retry-after": String(wait), "content-type": pathname.startsWith("/api/") ? "application/json" : "text/plain; charset=utf-8" };
    return new NextResponse(pathname.startsWith("/api/") ? JSON.stringify({ error: "Too many attempts. Try again in a minute." }) : "Too many attempts. Try again in a minute.", { status: 429, headers });
  }

  // One address for everyone: other production aliases (team and git URLs) send pages
  // to it, so sign-in, invite codes and installed apps all live on one domain.
  // API calls (cron, calendar feeds) are left alone.
  const host = request.headers.get("host") ?? "";
  if (CANONICAL_HOST && process.env.VERCEL_ENV === "production" && request.method === "GET" && !pathname.startsWith("/api/") && host.endsWith(".vercel.app") && host !== CANONICAL_HOST) {
    const url = request.nextUrl.clone();
    url.protocol = "https";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  // A sign-in link that landed somewhere other than /auth/callback (Supabase falls
  // back to its Site URL when it doesn't accept the redirect): finish signing in.
  const code = request.nextUrl.searchParams.get("code");
  // (Branch join codes on /welcome?code= are short; Supabase's are long UUIDs.)
  if (code && code.length >= 20 && !pathname.startsWith("/auth/") && !pathname.startsWith("/api/") && !pathname.startsWith("/welcome")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.search = "";
    url.searchParams.set("code", code);
    url.searchParams.set("next", pathname === "/" ? "/home" : pathname);
    return NextResponse.redirect(url);
  }

  // An invite link: remember its code for 30 days, so the join survives however
  // sign-in goes (email opened in another app, redirect dropped, coming back later).
  const invite = pathname.match(/^\/join\/([A-Za-z0-9]{4,12})\/?$/);
  if (invite) {
    const res = NextResponse.next();
    res.cookies.set(PENDING_JOIN, invite[1].toUpperCase(), { maxAge: 30 * 86400, sameSite: "lax", path: "/", httpOnly: true, secure: request.nextUrl.protocol === "https:" });
    return res;
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const hasSupabaseSession = Boolean(request.cookies.get("sb-" + "branch-app" + "-auth-token")) ||
    request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  const hasDemo = Boolean(request.cookies.get("branch-app-demo-user"));

  if (hasSupabaseSession || hasDemo) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
