import { badRequest, json, readJson, requireRole, serverError, withActor } from "@/lib/api";
import { createGraphicTemplate, listGraphicTemplates } from "@/lib/graphic-templates";

export const dynamic = "force-dynamic";

const TPLS = ["event", "quote", "reading", "paper"] as const;
/** Options a template may carry, with the type each must have. Anything else is dropped. */
const OPTION_TYPES: Record<string, "string" | "number" | "boolean"> = {
  layout: "string",
  cw: "string",
  size: "string",
  rough: "boolean",
  align: "string",
  emblem: "boolean",
  grain: "boolean",
  scale: "number",
  qr: "string",
  qrCaption: "string",
  qrCorner: "string",
  qrSize: "number",
  qrBrand: "boolean",
  qrLower: "boolean",
};
/** Wording that varies every time is never kept. */
const NEVER_KEPT = new Set(["date", "time"]);

/** The branch's saved designs, newest first. */
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listGraphicTemplates());
  } catch (e) {
    return serverError(e);
  }
}

/** `{ name, tpl, options, fields?, event_type? }` — social media officer, organizer or secretary. */
export async function POST(request: Request) {
  const { actor, error } = await requireRole("social_media_officer", "organizer", "general_secretary");
  if (error) return error;
  const body = await readJson(request);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) return badRequest("Give the design a name");
  const tpl = TPLS.find((t) => t === body?.tpl);
  if (!tpl) return badRequest("Which kind of graphic?");
  const options: Record<string, unknown> = {};
  for (const [k, type] of Object.entries(OPTION_TYPES)) {
    const v = (body?.options as Record<string, unknown> | undefined)?.[k];
    if (typeof v === type && (type !== "string" || (v as string).length <= 500)) options[k] = v;
  }
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries((body?.fields ?? {}) as Record<string, unknown>).slice(0, 12)) {
    if (typeof v === "string" && !NEVER_KEPT.has(k) && /^[a-z]{1,20}$/i.test(k)) fields[k] = v.slice(0, 300);
  }
  const event_type = typeof body?.event_type === "string" && /^[a-z_]{1,30}$/.test(body.event_type) ? body.event_type : null;
  try {
    return json(await createGraphicTemplate(actor, { name, tpl, options, fields, event_type }), { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
