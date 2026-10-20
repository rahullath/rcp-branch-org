import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { listProfiles } from "@/lib/data";
import { createAgendaAction, createComrade, getComrade, listComrades } from "@/lib/data-v2";
import { resolvePerson } from "@/lib/agenda-import-apply";
import { londonDay, parseActionLines } from "@/lib/follow-through";
import type { AgendaAction } from "@/lib/types";

export const dynamic = "force-dynamic";

/** One owner as the screen sends it back: an account, a People entry, or a new name. */
type Owner = { profile_id?: string; comrade_id?: string; name?: string };

/**
 * Paste the actions from a BC, the minutes or the chat; get tasks with a
 * person and a date. `{ text }` previews (names matched against accounts and
 * People); `{ rows, source, event_id }` saves — one action per owner, so
 * "Owen and Jo to…" lands in both inboxes. Officers.
 */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  if (!actor.role.some((r) => r !== "member")) return json({ error: "Actions are recorded by officers" }, { status: 403 });
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");
  try {
    const [profiles, comrades] = await Promise.all([listProfiles(), listComrades()]);

    if (typeof body.text === "string") {
      const today = londonDay(Date.now());
      const rows = parseActionLines(body.text, today).map((a, i) => ({
        key: i,
        text: a.text,
        due: a.due,
        line: a.line,
        who: a.who.map((raw) => {
          const p = resolvePerson(raw, profiles, comrades);
          return { raw, name: p.name, status: p.status, profile_id: p.id, comrade_id: p.comradeId };
        }),
      }));
      if (rows.length === 0) return badRequest("No actions found. One per line: “DP to send the article by Friday”.");
      return json({ rows });
    }

    if (!Array.isArray(body.rows)) return badRequest("Nothing to save");
    const source = typeof body.source === "string" && body.source.trim() ? body.source.trim().slice(0, 60) : null;
    const eventId = typeof body.event_id === "string" && body.event_id ? body.event_id : null;
    const created: AgendaAction[] = [];
    const fresh = new Map<string, string>();
    for (const row of body.rows as { text?: unknown; due?: unknown; owners?: unknown }[]) {
      const text = typeof row.text === "string" ? row.text.trim() : "";
      if (!text) continue;
      const due = typeof row.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.due) ? row.due : null;
      const owners = (Array.isArray(row.owners) ? (row.owners as Owner[]) : []).filter((o) => o && (o.profile_id || o.comrade_id || o.name));
      if (owners.length === 0) continue;
      for (const o of owners) {
        let ownerId: string | null = null;
        let comradeId: string | null = null;
        if (o.profile_id && profiles.some((p) => p.id === o.profile_id)) ownerId = o.profile_id;
        else if (o.comrade_id) {
          const c = await getComrade(o.comrade_id);
          if (!c) continue;
          comradeId = c.id;
          ownerId = c.profile_id ?? null;
        } else if (o.name) {
          // A name the app hasn't seen: remember it in People so the follow-up can wait for them.
          const key = o.name.trim().toLowerCase();
          comradeId = fresh.get(key) ?? (await createComrade(actor, { name: o.name.trim(), aliases: [] })).id;
          fresh.set(key, comradeId);
        }
        if (!ownerId && !comradeId) continue;
        created.push(await createAgendaAction(actor, { text, owner_id: ownerId, owner_comrade_id: comradeId, event_id: eventId, due_date: due, source }));
      }
    }
    return json({ created: created.length }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
