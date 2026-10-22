import { redirect } from "next/navigation";
import Shell from "@/components/shell";
import { LogoutButton } from "@/components/logout-button";
import { getActor } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Not in a branch yet → pick or start one before anything else (everything is per branch).
  const actor = await getActor();
  if (actor && !actor.branch) redirect("/welcome");
  if (actor?.branch?.approved === false && !actor.isAdmin) return <Waiting name={actor.branch.name} />;
  // Then once: who you are in the branch, your role, putting the app on your phone.
  if (actor && !actor.onboarded) redirect("/onboarding");
  return <Shell>{children}</Shell>;
}

/** A new branch on a shared copy, before an admin has let it in. */
function Waiting({ name }: { name: string }) {
  return (
    <div className="screen pg" style={{ maxWidth: 480, margin: "0 auto", paddingTop: 64 }}>
      <h1>{name}</h1>
      <p className="sub">Waiting for approval.</p>
      <p>
        This copy of the app is shared by several branches, so an admin checks each new one before it starts. They&apos;ve been told. Once they approve it, reload this page and
        you&apos;re in.
      </p>
      <LogoutButton />
    </div>
  );
}
