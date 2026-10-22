import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { WelcomeForms } from "./welcome-forms";
import { cookies } from "next/headers";
import { branchForCode } from "@/lib/branches";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

/** The invite code saved on the account when the sign-in email was sent (new accounts only). */
async function inviteOnAccount(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await (await createClient()).auth.getClaims();
  const meta = (data?.claims?.user_metadata ?? {}) as { invite_code?: unknown };
  return typeof meta.invite_code === "string" ? meta.invite_code : null;
}

export const dynamic = "force-dynamic";

/** First stop for anyone not in a branch yet: join yours with its code, or start one. */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ code?: string; e?: string }> }) {
  const { code: fromLink, e: failed } = await searchParams;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(fromLink ? `/welcome?code=${fromLink}` : "/welcome")}`);
  if (actor.branch) redirect("/home");
  // An invite, from the link, the remembered cookie, or the account (set when the sign-in email was sent).
  const code = (fromLink ?? (await cookies()).get("pending_join")?.value ?? (await inviteOnAccount()) ?? "").toUpperCase();
  // Came from an invite: join straight away, no extra screen. Only an error brings you back here.
  if (code && !failed && (await branchForCode(code))) redirect(`/welcome/join?code=${encodeURIComponent(code)}`);
  return (
    <main className="screen pg" style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
      <div>
        <h1>Welcome, {actor.name.split(/\s+/)[0]}</h1>
        <p className="sub">Which branch are you in? Each branch&apos;s events, contacts and plans stay its own. District demos and national events show for everyone.</p>
      </div>
      {failed && <p className="small red">{failed}</p>}
      <WelcomeForms code={code} />
    </main>
  );
}
