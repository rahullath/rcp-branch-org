import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { OnboardingFlow } from "./onboarding-flow";

export const dynamic = "force-dynamic";

/**
 * First run, once: who you are in the branch (claims your People entry, so
 * what was waiting on "Ben" or "BN" lands with you), your role (the
 * general secretary confirms), how the app works in a minute, and putting
 * it on your phone — install, notifications, calendar.
 */
export default async function OnboardingPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/onboarding");
  if (!actor.branch) redirect("/welcome");
  return (
    <main className="v2 pg" style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
      <OnboardingFlow
        branch={actor.branch.name}
        startName={actor.namePending ? "" : actor.name}
        roles={actor.role}
      />
    </main>
  );
}
