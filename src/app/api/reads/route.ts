import { resolveTitle } from "@/lib/link-title";
import { after } from "next/server";
import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { createSharedRead, listSharedReads } from "@/lib/data-extras";
import { getEvent } from "@/lib/data";
import { linkKind, mirrorToPrep, readersFor } from "@/lib/preread-sync";
import { allMemberIds, sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listSharedReads());
  } catch (e) {
    return serverError(e);
  }
}

/**
 * `{ url, title?, note?, event_id? }` — share something to read. With an
 * event it's the reading for that event and goes to whoever's going; without,
 * the whole branch. One push, and it sits in the inbox until read.
 */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!/^https?:\/\/\S+$/.test(url)) return badRequest("Paste a link starting with http");
  const title = await resolveTitle(typeof body?.title === "string" ? body.title : null, url);
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  const event = typeof body?.event_id === "string" ? await getEvent(body.event_id) : null;
  // An event's first reading is news; the rest are "also good" and don't ping anyone.
  const first = !event || !(await listSharedReads()).some((r) => r.event_id === event.id);
  try {
    const read = await createSharedRead(actor, { url, title: title.slice(0, 200), note, event_id: event?.id ?? null });
    // A branch meeting's reading is its prep too: the programme counts it.
    if (event) await mirrorToPrep(event.id, { label: read.title, url, kind: linkKind(url) });
    if (first) after(async () => {
      const ids = event ? await readersFor(actor, event) : await allMemberIds(actor.branch?.id ?? null);
      await sendPush(
        ids.filter((id) => id !== actor.id),
        "lead_updates",
        {
          title: event ? `Before ${event.title.split(" — ")[0]}` : `${actor.name.replace(/^Comrade\s+/i, "").split(" ")[0]} shared: ${read.title}`,
          body: event ? "Something to read or listen to beforehand. It's in your inbox." : (note ?? read.title),
          url: "/inbox",
          tag: `read-${read.id}`,
          actions: [{ action: "open", title: "Open" }],
        },
      );
    });
    return json(read, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
