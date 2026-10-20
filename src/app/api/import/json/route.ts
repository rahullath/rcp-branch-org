import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { IMPORT_MODULES, runJsonImport, type ImportModule } from "@/lib/json-import";
import { createImportRequest } from "@/lib/data-v2";

export const dynamic = "force-dynamic";

/**
 * `{ data, apply?, only? }` — the AI-tidied JSON. Without `apply` it's a
 * preview; `only` lists, per module, which rows to import (the ones left ticked).
 *
 * Your own contacts go straight in. Anything else from an officer is sent
 * to the admin to check first (`sent: true`), since only a person can tell
 * that two differently worded things are the same. The admin's own imports
 * go straight in. Members can import their own contacts only.
 */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  let data = body?.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      return badRequest("That isn't valid JSON — paste exactly what the AI replied.");
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return badRequest("Paste the JSON object the AI gave you.");
  const isOfficer = actor.role.some((r) => r !== "member");
  const record = data as Record<string, unknown>;
  if (!isOfficer) {
    const others = IMPORT_MODULES.filter((m) => m !== "contacts" && Array.isArray(record[m]) && (record[m] as unknown[]).length);
    if (others.length) return json({ error: "Members can import their own contacts; ask an officer for the rest." }, { status: 403 });
  }
  const only = body?.only && typeof body.only === "object" ? (body.only as Partial<Record<ImportModule, number[]>>) : undefined;
  const apply = body?.apply === true;
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  try {
    if (!apply || actor.isAdmin) return json(await runJsonImport(actor, record, { apply, only }));
    // Contacts now; the rest waits for the admin.
    const res = await runJsonImport(actor, record, { apply: true, only, skip: IMPORT_MODULES.filter((m) => m !== "contacts") });
    const rest = Object.fromEntries(
      IMPORT_MODULES.filter((m) => m !== "contacts")
        .map((m) => [m, only ? (only[m] ?? []) : (Array.isArray(record[m]) ? (record[m] as unknown[]).map((_, i) => i) : [])] as const)
        .filter(([, rows]) => rows.length),
    );
    if (!Object.keys(rest).length) return json(res);
    const { contacts: _mine, ...forReview } = record;
    void _mine; // contacts never leave the importer's hands
    const req = await createImportRequest(actor, { data: forReview, only_rows: rest, note });
    return json({ ...res, sent: true, requestId: req.id });
  } catch (e) {
    return serverError(e);
  }
}
