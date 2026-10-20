import Link from "next/link";
import { getActor } from "@/lib/auth";
import { branchForCode } from "@/lib/branches";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/**
 * An invite link: says which branch, then signs you in and drops you on the
 * join step with the code filled in. Shows nothing but the branch name.
 */
export default async function JoinPage({ params }: Params) {
  const { code } = await params;
  const upper = code.toUpperCase();
  const [name, actor] = await Promise.all([branchForCode(upper), getActor()]);
  const next = `/welcome?code=${encodeURIComponent(upper)}`;

  return (
    <main className="v2 pg" style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
      {name ? (
        <>
          <div>
            <span className="kicker">Revolutionary Communist Party</span>
            <h1 style={{ fontSize: 28, marginTop: 4 }}>Join {name}</h1>
            <p className="sub">The branch app: what&apos;s on this week, who&apos;s going, reading groups, the agenda — in one place.</p>
          </div>
          {actor?.branch ? (
            <p className="small">You&apos;re already in {actor.branch.name}.</p>
          ) : (
            <Link className="btn btn-p" href={actor ? next : `/login?next=${encodeURIComponent(next)}`}>
              {actor ? "Join" : "Sign in to join"}
            </Link>
          )}
        </>
      ) : (
        <>
          <h1>Invite not found</h1>
          <p className="sub">That code doesn&apos;t match a branch any more. Ask whoever sent it for a fresh invite.</p>
        </>
      )}
    </main>
  );
}
