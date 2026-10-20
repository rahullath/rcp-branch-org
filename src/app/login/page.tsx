import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { listProfiles } from "@/lib/data";
import { APP_ORG, APP_PRODUCT } from "@/lib/config";
import { HammerSickle } from "@/components/emblem";
import { DemoLogin } from "@/components/demo-login";
import { MagicLinkLogin } from "@/components/magic-link-login";
import { safeNext } from "@/lib/safe-next";
import { branchForCode } from "@/lib/branches";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  const actor = await getActor();
  if (actor) redirect(next);
  // Arrived from an invite: say which branch, so the sign-in makes sense.
  const inviteCode = next.startsWith("/welcome?code=") ? decodeURIComponent(next.slice("/welcome?code=".length)) : null;
  const invitedTo = inviteCode ? await branchForCode(inviteCode) : null;

  const profiles = isSupabaseConfigured ? [] : await listProfiles();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-24 w-24 items-center justify-center bg-primary brand-shadow">
            <HammerSickle color="yellow" height={68} title="Hammer and sickle" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{APP_ORG}</p>
          <h1 className="font-headline-md text-2xl font-bold uppercase tracking-wider text-on-surface">{APP_PRODUCT}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {invitedTo ? `You've been invited to join ${invitedTo}. Sign in with your email to continue.` : "What's on, who's going, and what needs doing."}
          </p>
        </div>

        <div className="border border-paper-shadow bg-surface-container-lowest p-6 organic-shadow">
          {error && <p className="mb-3 text-sm font-medium text-error">{error.slice(0, 160)}</p>}
          {isSupabaseConfigured ? (
            <MagicLinkLogin next={next} />
          ) : (
            <Suspense fallback={<p className="py-8 text-center text-sm text-on-surface-variant">Loading…</p>}>
              <DemoLogin profiles={profiles} />
            </Suspense>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-on-surface-variant">
          {isSupabaseConfigured
            ? "No password: we email you a link each time."
            : "Demo: a made-up branch. Pick someone to see it as they would. Changes reset now and then."}
        </p>
        <p className="mt-2 text-center text-xs">
          <Link className="underline" href="/guide">
            What this is and how to use it
          </Link>
        </p>
      </div>
    </div>
  );
}
