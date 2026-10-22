import { normalizePhone } from "@/lib/phone";
import { badRequest, json, notFound, readJson, requireRole, serverError, withActor } from "@/lib/api";
import { getProfile } from "@/lib/data";
import { deleteComrade, getComrade, linkComrade, setCandidacy, updateComrade, listFollowUps } from "@/lib/data-extras";
import { addMonths, CANDIDATE_MONTHS } from "@/lib/candidates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Rename, change short forms, or link to an account (`profile_id`, null to
 * unlink). Linking moves their waiting follow-ups into that inbox. Officers.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const { actor, error } = await withActor();
  if (error) return error;
  const current = await getComrade(id);
  if (!current) return notFound("Person not found");
  const body = await readJson(request);
  if (!body) return badRequest("Invalid body");
  const isOfficer = actor.role.some((r) => r !== "member");
  // Whoever follows someone up can add their WhatsApp number; everything else is for officers.
  const onlyPhone = Object.keys(body).every((k) => k === "phone");
  const follows = onlyPhone && (await listFollowUps()).some((f) => f.person_id === id && f.active && f.follower_id === actor.id);
  if (!isOfficer && !follows) return json({ error: "People are kept by officers" }, { status: 403 });
  try {
    let comrade = current;
    let moved = 0;
    if ("name" in body || "aliases" in body) {
      const name = typeof body.name === "string" ? body.name : undefined;
      if (name !== undefined && !name.trim()) return badRequest("Name can't be empty");
      const aliases = Array.isArray(body.aliases) ? body.aliases.filter((a): a is string => typeof a === "string") : undefined;
      comrade = (await updateComrade(id, { name, aliases })) ?? comrade;
    }
    if ("phone" in body) {
      const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : null;
      comrade = (await updateComrade(id, { phone })) ?? comrade;
    }
    // Candidacy: `{ candidacy: "start" | "extend" | "member" | "left", since?, months?, note? }` — officers.
    if (typeof body.candidacy === "string") {
      const today = new Date().toISOString().slice(0, 10);
      const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
      const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
      const log = (line: string) => [comrade.candidate_note, `${today}: ${line}${note ? ` (${note})` : ""}`].filter(Boolean).join("\n").slice(-2000);
      const months = typeof body.months === "number" && body.months > 0 && body.months <= 12 ? Math.round(body.months) : 1;
      if (body.candidacy === "start") {
        const since = day(body.since) ?? today;
        comrade = (await setCandidacy(id, { candidate_since: since, candidate_until: addMonths(since, CANDIDATE_MONTHS), left_at: null, candidate_note: log("candidate") })) ?? comrade;
      } else if (body.candidacy === "extend") {
        const from = comrade.candidate_until && comrade.candidate_until > today ? comrade.candidate_until : today;
        comrade = (await setCandidacy(id, { candidate_until: addMonths(from, months), candidate_note: log(`extended ${months} month${months === 1 ? "" : "s"}`) })) ?? comrade;
      } else if (body.candidacy === "member") {
        comrade = (await setCandidacy(id, { candidate_since: null, candidate_until: null, candidate_note: log("full member") })) ?? comrade;
      } else if (body.candidacy === "left") {
        comrade = (await setCandidacy(id, { left_at: today, candidate_note: log("left") })) ?? comrade;
      } else if (body.candidacy === "since") {
        const since = day(body.since);
        if (!since) return badRequest("Pick the date their candidacy started");
        comrade = (await setCandidacy(id, { candidate_since: since, candidate_until: addMonths(since, CANDIDATE_MONTHS) })) ?? comrade;
      } else if (body.candidacy === "until") {
        // The review date as the party portal has it.
        const until = day(body.until);
        if (!until) return badRequest("Pick the date their candidacy ends");
        comrade = (await setCandidacy(id, { candidate_since: comrade.candidate_since ?? addMonths(until, -CANDIDATE_MONTHS), candidate_until: until, left_at: null, candidate_note: log(`review date ${until} (portal)`) })) ?? comrade;
      } else return badRequest("candidacy is start, extend, member, left, since or until");
    }
    if ("profile_id" in body) {
      const profile = typeof body.profile_id === "string" ? await getProfile(body.profile_id) : null;
      if (body.profile_id && !profile) return badRequest("That account doesn't exist");
      const result = await linkComrade(id, profile?.id ?? null);
      comrade = result.comrade ?? comrade;
      moved = result.moved;
    }
    return json({ ...comrade, moved });
  } catch (e) {
    if (e instanceof Error && /duplicate|unique/i.test(e.message)) return badRequest("That account is already linked to someone else");
    return serverError(e);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await requireRole("general_secretary");
  if (error) return error;
  if (!(await getComrade(id))) return notFound("Person not found");
  try {
    await deleteComrade(id);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
