import { badRequest, json, notFound, readJson, serverError, withActor } from "@/lib/api";
import { getEvent } from "@/lib/data";
import { listEventExtras, listEventReports, saveEventReport, updateEventReport } from "@/lib/data-v2";
import type { Actor } from "@/lib/auth";
import type { Event } from "@/lib/types";
import { eventLead, reportWriter } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Can this person write (or correct) the event's report? */
async function canReport(actor: Actor, event: Event) {
  const writer = reportWriter(event, (await listEventExtras()).roles);
  return writer === actor.id || eventLead(event) === actor.id || actor.role.includes("paper_sales_officer") || actor.role.includes("general_secretary") || (event.event_type === "reading_group" && actor.role.includes("education_officer"));
}

/** Pulls the numbers out of a report form; a string is the error to show. */
function readReport(event: Event, body: Record<string, unknown> | null) {
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null;
  if (event.event_type === "reading_group") {
    const attended = Number(body?.attended);
    if (!Number.isFinite(attended) || attended < 0) return "How many came?";
    return { sold: 0, money: 0, contacts: Number(body?.contacts) || 0, attended: Math.round(attended), notes };
  }
  const sold = Number(body?.sold);
  const money = Number(body?.money);
  const contacts = Number(body?.contacts);
  if (![sold, money, contacts].every((n) => Number.isFinite(n) && n >= 0)) return "Numbers only, zero or more";
  return { sold: Math.round(sold), money: Math.round(money * 100) / 100, contacts: Math.round(contacts), notes };
}

export async function GET(_: Request, { params }: Params) {
  const { error } = await withActor();
  if (error) return error;
  const { id } = await params;
  return json((await listEventReports()).find((r) => r.event_id === id) ?? null);
}

/** Fix the numbers after the fact (copies sold, money, how many came). */
export async function PATCH(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return notFound("Event not found");
  if (!(await canReport(actor, event))) return json({ error: "Only whoever wrote it, the lead or an officer" }, { status: 403 });
  const report = (await listEventReports()).find((r) => r.event_id === id);
  if (!report) return notFound("No report yet");
  const input = readReport(event, await readJson(request));
  if (typeof input === "string") return badRequest(input);
  try {
    return json(await updateEventReport(event, report, input));
  } catch (e) {
    return serverError(e);
  }
}

/** The report after a sale or session, by whoever writes it (or the lead). Goes onto the next branch agenda by itself. */
export async function POST(request: Request, { params }: Params) {
  const { actor, error } = await withActor();
  if (error) return error;
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return notFound("Event not found");
  if (!(await canReport(actor, event))) return json({ error: "Only whoever writes the report, or the lead, can" }, { status: 403 });
  if ((await listEventReports()).some((r) => r.event_id === id)) return badRequest("This already has a report");
  const input = readReport(event, await readJson(request));
  if (typeof input === "string") return badRequest(input);
  try {
    return json(await saveEventReport(actor, event, input), { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
