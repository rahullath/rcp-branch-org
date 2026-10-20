import { after } from "next/server";
import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { createPoll, listPolls } from "@/lib/data-v2";
import { notifyPoll } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    return json(await listPolls());
  } catch (e) {
    return serverError(e);
  }
}

/** Anyone can ask the branch something — replaces the WhatsApp poll. */
export async function POST(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const options = Array.isArray(body?.options)
    ? [...new Set(body.options.filter((o): o is string => typeof o === "string").map((o) => o.trim()).filter(Boolean))]
    : [];
  if (!question) return badRequest("Ask a question");
  if (options.length < 2 || options.length > 6) return badRequest("Give 2 to 6 options");
  const closesAt = typeof body?.closes_at === "string" && !Number.isNaN(Date.parse(body.closes_at)) ? body.closes_at : null;
  try {
    const poll = await createPoll(actor, { question, options, closes_at: closesAt });
    after(() => notifyPoll(actor, poll));
    return json(poll, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
