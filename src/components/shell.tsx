import Link from "next/link";
import { getActor } from "@/lib/auth";
import { listEventChecklists, listProfiles } from "@/lib/data";
import { listImportRequests } from "@/lib/data-v2";
import { sanitizeProfilesFor } from "@/lib/profile-visibility";
import { APP_PRODUCT } from "@/lib/config";
import { initials } from "@/lib/utils";
import { ActorProvider } from "@/lib/actor-context";
import { ProfilesProvider } from "@/lib/profiles-context";
import { LogoutButton } from "./logout-button";
import { SideNav, BottomNav } from "./nav";
import { InstallBanner } from "./install-banner";
import { ToastProvider } from "./v2/toast";
import { SheetProvider } from "./v2/sheets";
import { NavBadgesProvider } from "./v2/nav-badges";
import { HammerSickle } from "./emblem";
import { FeedbackButton } from "./v2/feedback-button";
import { NotifyPrompt } from "./v2/notify-prompt";

export default async function Shell({ children }: { children: React.ReactNode }) {
  const [actor, rawProfiles] = await Promise.all([getActor(), listProfiles()]);
  const profiles = sanitizeProfilesFor(rawProfiles, actor);

  const canSeeChecklistBadge =
    !!actor && (actor.role.includes("social_media_officer") || actor.role.includes("general_secretary"));
  // In parallel — every page waits on these.
  const [checklists, importRows] = await Promise.all([
    canSeeChecklistBadge ? listEventChecklists() : Promise.resolve([]),
    actor?.isAdmin ? listImportRequests() : Promise.resolve([]),
  ]);
  const pendingChecklists = checklists.filter((c) => c.completed_at && !c.acknowledged).length;
  const pendingImports = importRows.filter((r) => r.status === "pending").length;
  const badgeEntries: [string, number][] = [];
  if (pendingChecklists > 0) badgeEntries.push(["/social-media", pendingChecklists]);
  if (pendingImports > 0) badgeEntries.push(["/imports", pendingImports]);
  const navBadges = badgeEntries.length > 0 ? Object.fromEntries(badgeEntries) : undefined;

  return (
    <ActorProvider actor={actor}>
    <ProfilesProvider initialProfiles={profiles}>
    <ToastProvider>
    <SheetProvider>
    <NavBadgesProvider badges={navBadges}>
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-paper-shadow bg-surface-container-lowest lg:flex">
        <div className="border-b-4 border-b-on-surface bg-primary px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-surface text-primary">
              <HammerSickle color="red" height={26} />
            </span>
            <div className="min-w-0 leading-tight text-on-primary">
              <p className="truncate font-headline-md text-sm font-bold uppercase tracking-wider">
                {APP_PRODUCT}
              </p>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-80">
                {actor?.branch?.name ?? "Branch"}
                {actor?.isAdmin ? " · admin" : ""}
              </p>
            </div>
          </div>
        </div>

        <SideNav badges={navBadges} roles={actor?.role} isAdmin={actor?.isAdmin} viewOnly={actor?.viewOnly} />
        <div className="px-3 pb-3">
          {!actor?.viewOnly && <FeedbackButton wide />}
        </div>

        <div className="border-t border-paper-shadow p-3">
          {actor && (
            <div className="flex items-center gap-3">
              <Link href="/settings" aria-label="Your profile and settings" className="flex h-9 w-9 shrink-0 items-center justify-center bg-on-surface text-xs font-bold text-on-primary">
                {initials(actor.name)}
              </Link>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate font-headline-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  {actor.name}
                </p>
                <p className="truncate text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
                  {actor.role.join(", ").replace(/_/g, " ")}
                </p>
              </div>
              <LogoutButton />
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b-4 border-b-on-surface bg-primary px-4 py-3 text-on-primary lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-surface text-primary">
                <HammerSickle color="red" height={26} />
              </span>
              <p className="truncate font-headline-md text-sm font-bold uppercase tracking-wider">
                {shortBranch(actor?.branch?.name)}
                {actor?.isAdmin ? <span className="opacity-70"> · admin</span> : null}
              </p>
            </div>
            {actor && (
              <div className="flex items-center gap-2">
                {!actor.viewOnly && <FeedbackButton />}
                <span className="hidden text-xs font-semibold uppercase tracking-wider sm:block">{actor.name}</span>
                <Link href="/settings" aria-label="Your profile and settings" className="flex h-8 w-8 items-center justify-center bg-on-surface text-xs font-bold text-on-primary">
                  {initials(actor.name)}
                </Link>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-6 sm:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-5xl">
            {actor?.viewOnly ? (
              <p className="mb-4 border border-paper-shadow px-3 py-2 text-sm">
                View only. You can look around {actor.branch?.name ?? "the branch"} as it really runs; contacts, money and follow-ups are hidden, and nothing can be changed.
              </p>
            ) : (
              <InstallBanner />
            )}
            {children}
          </div>
        </main>
      </div>


      <BottomNav badges={navBadges} roles={actor?.role} viewOnly={actor?.viewOnly} />
      {actor && !actor.viewOnly && <NotifyPrompt />}
    </div>
    </NavBadgesProvider>
    </SheetProvider>
    </ToastProvider>
    </ProfilesProvider>
    </ActorProvider>
  );
}

/** "Leeds Branch 2" → "Branch 2" for the narrow mobile header. */
function shortBranch(name?: string | null) {
  if (!name) return "Branch";
  const m = name.match(/branch\s*\S+$/i);
  return m ? m[0] : name;
}
