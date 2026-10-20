import { withTitles } from "@/lib/link-title";
import { syncPrepReads } from "@/lib/preread-sync";
import { json, serverError, withActor, readJson, badRequest } from "@/lib/api";
import { createAgendaItem, listAgenda } from "@/lib/data";
import { syncMeetingTitle } from "@/lib/meeting-title";
import type { AgendaLink, AgendaSection, PrepLink } from "@/lib/types";

export const dynamic = "force-dynamic";

const SECTIONS: AgendaSection[] = ["paper", "political", "organizational"];

function parsePrepLinks(value: unknown): PrepLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (l): l is PrepLink =>
        !!l && typeof l === "object" && typeof (l as PrepLink).label === "string" && typeof (l as PrepLink).url === "string",
    )
    .map((l) => ({
      label: l.label,
      url: l.url,
      kind: l.kind === "article" || l.kind === "youtube" || l.kind === "spotify" || l.kind === "podcast" ? l.kind : undefined,
    }));
}

function parseLink(value: unknown): AgendaLink | null {
  const l = value as AgendaLink | null;
  if (!l || typeof l !== "object" || typeof l.id !== "string") return null;
  return ["event", "material", "report"].includes(l.kind) ? { kind: l.kind, id: l.id } : null;
}

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listAgenda());
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return badRequest("Title is required");
  }
  if (body.section && !SECTIONS.includes(body.section as AgendaSection)) {
    return badRequest("Invalid section");
  }
  try {
    const item = await createAgendaItem(actor, {
      title: body.title.trim(),
      section: (body.section as AgendaSection) ?? "organizational",
      duration: typeof body.duration === "string" ? body.duration : null,
      description: typeof body.description === "string" ? body.description : null,
      icon: typeof body.icon === "string" ? body.icon : "event_note",
      attachment: typeof body.attachment === "string" ? body.attachment : null,
      leadoff_name: typeof body.leadoff_name === "string" ? body.leadoff_name : null,
      chair_name: typeof body.chair_name === "string" ? body.chair_name : null,
      reading: typeof body.reading === "string" ? body.reading : null,
      event_id: typeof body.event_id === "string" ? body.event_id : null,
      prep_links: await withTitles(parsePrepLinks(body.prep_links)),
      link: parseLink(body.link),
      sort_order: typeof body.sort_order === "number" ? body.sort_order : 99,
    });
    if (item.section === "political") await syncMeetingTitle(item.event_id);
    if (item.section === "political" && (item.prep_links ?? []).length) await syncPrepReads(actor, item.event_id);
    return json(item, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
