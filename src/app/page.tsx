import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { APP_ORG, APP_PRODUCT, isSupabaseConfigured } from "@/lib/config";
import { HammerSickle } from "@/components/emblem";
import { CodeEntry } from "@/components/code-entry";

/**
 * Signed in: your week. Signed out: a landing page with three ways in: try the
 * demo, enter a code you were sent, or sign in. NEXT_PUBLIC_LIVE_URL points the
 * code box at the real copy when this deployment is only the demo;
 * NEXT_PUBLIC_DEMO_URL does the reverse.
 */
export default async function RootPage() {
  const actor = await getActor();
  if (actor) redirect("/home");

  const liveUrl = (process.env.NEXT_PUBLIC_LIVE_URL || "").replace(/\/$/, "");
  const demoUrl = (process.env.NEXT_PUBLIC_DEMO_URL || "").replace(/\/$/, "");
  const isDemoCopy = !isSupabaseConfigured;
  const demoHref = isDemoCopy ? "/login" : demoUrl ? `${demoUrl}/login` : null;
  const showCode = !isDemoCopy || Boolean(liveUrl);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-24 w-24 items-center justify-center bg-primary brand-shadow">
            <HammerSickle color="yellow" height={68} title="Hammer and sickle" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{APP_ORG}</p>
          <h1 className="font-headline-md text-2xl font-bold uppercase tracking-wider text-on-surface">{APP_PRODUCT}</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Run your branch&apos;s week from your phone: events, readings, invites, paper sales and who&apos;s doing what, in one inbox.
          </p>
        </div>

        <div className="space-y-6 border border-paper-shadow bg-surface-container-lowest p-6 organic-shadow">
          {demoHref && (
            <div className="space-y-2">
              <Link className="inline-flex h-11 w-full items-center justify-center bg-primary px-5 text-sm font-semibold uppercase tracking-wider text-on-primary hover:bg-on-primary-fixed-variant" href={demoHref}>
                Try the demo
              </Link>
              <p className="text-xs text-on-surface-variant">A made-up branch. Nothing you do there touches real data.</p>
            </div>
          )}
          {showCode && (
            <div className={demoHref ? "border-t border-paper-shadow pt-6" : ""}>
              <CodeEntry liveUrl={liveUrl} />
            </div>
          )}
          {!isDemoCopy && (
            <p className="border-t border-paper-shadow pt-4 text-center text-sm">
              Already in a branch?{" "}
              <Link className="underline" href="/login">
                Sign in
              </Link>
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs">
          <Link className="underline" href="/guide">
            What this is and how to use it
          </Link>
          {" · "}
          <Link className="underline" href="/guide/start-a-branch">
            Start a branch
          </Link>
        </p>
      </div>
    </div>
  );
}
