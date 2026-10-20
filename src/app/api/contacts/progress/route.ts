import { json, serverError, withActor } from "@/lib/api";
import { listContacts } from "@/lib/data";
import { listEventInvites } from "@/lib/data-v2";
import { contactOwner } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Recruitment, as numbers only: per comrade, how many of their contacts
 * moved on (talked / came / joined) since `?since=`, and the branch totals
 * at each stage. No names — contacts stay with whoever works them.
 */
export async function GET(request: Request) {
  const { error } = await withActor();
  if (error) return error;
  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = sinceParam ? Date.parse(sinceParam) : Date.now() - 14 * 86400_000;
  try {
    const [contacts, invites] = await Promise.all([listContacts(), listEventInvites()]);
    const per = new Map<string, { talked: number; came: number; joined: number; invited: number }>();
    const bump = (owner: string | null, k: "talked" | "came" | "joined" | "invited") => {
      if (!owner) return;
      const cur = per.get(owner) ?? { talked: 0, came: 0, joined: 0, invited: 0 };
      cur[k]++;
      per.set(owner, cur);
    };
    for (const c of contacts) {
      if (c.stage && c.stage !== "met" && c.stage_at && Date.parse(c.stage_at) >= since) bump(contactOwner(c), c.stage);
    }
    for (const i of invites) if (Date.parse(i.created_at) >= since) bump(i.invited_by, "invited");
    const order = ["met", "talked", "came", "joined"];
    const reached = (st: string) => contacts.filter((c) => order.indexOf(c.stage ?? "met") >= order.indexOf(st)).length;
    return json({
      since: new Date(since).toISOString(),
      people: [...per.entries()].map(([owner_id, n]) => ({ owner_id, ...n })),
      totals: { met: contacts.length, talked: reached("talked"), came: reached("came"), joined: reached("joined") },
    });
  } catch (e) {
    return serverError(e);
  }
}
