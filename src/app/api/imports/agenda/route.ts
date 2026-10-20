import { badRequest, json, readJson, requireRole, serverError } from "@/lib/api";
import { parseAgendaDoc } from "@/lib/agenda-import";
import { runAgendaImport, type PersonHint } from "@/lib/agenda-import-apply";
import { syncAllPrepReads } from "@/lib/preread-sync";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/** Pull text out of a PDF keeping line breaks — the parser reads the doc line by line. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    let page = "";
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      page += item.str ?? "";
      if (item.hasEOL) page += "\n";
    }
    pages.push(page);
  }
  return pages.join("\n");
}

/**
 * Import the branch agenda doc. Send `{ text }` for a preview of what would
 * change, `{ text, apply: true }` to save it, or a multipart `file` (.txt /
 * .pdf) to get its text back for the same flow. Organisers, the education
 * officer and the GS — the people who write the agenda.
 */
export async function POST(request: Request) {
  const { actor, error } = await requireRole("general_secretary", "organizer", "education_officer");
  if (error) return error;

  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return badRequest("Attach a .txt or .pdf file");
    if (file.size > MAX_BYTES) return badRequest("That file is over 5 MB");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const text = isPdf ? await pdfText(bytes) : new TextDecoder().decode(bytes);
      if (!text.trim()) return badRequest(isPdf ? "No text in that PDF — is it a scan? Paste the text instead." : "That file is empty");
      return json({ text });
    } catch (e) {
      console.error("[imports/agenda] read file", e);
      return badRequest("Couldn't read that file. Paste the text instead.");
    }
  }

  const body = await readJson(request);
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return badRequest("Paste the agenda text");
  try {
    const parsed = parseAgendaDoc(text);
    if (!parsed.meeting.date && parsed.programme.length === 0) {
      return badRequest("Couldn't find a meeting date or a programme in that text.");
    }
    // Answers from the preview's "Who's who" for names the app hasn't seen.
    const people: PersonHint[] = (Array.isArray(body?.people) ? (body.people as Record<string, unknown>[]) : []).flatMap((p) =>
      p && typeof p.raw === "string" && p.raw.trim()
        ? [
            {
              raw: p.raw.trim(),
              name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : null,
              profile_id: typeof p.profile_id === "string" && p.profile_id ? p.profile_id : null,
            },
          ]
        : [],
    );
    const result = await runAgendaImport(actor, parsed, { apply: body?.apply === true, people });
    if (result.applied) await syncAllPrepReads(actor);
    return json(result);
  } catch (e) {
    return serverError(e);
  }
}
