import { normalizePhone } from "@/lib/phone";
import { badRequest, json, readJson, serverError, withActor } from "@/lib/api";
import { getProfile, updateProfile } from "@/lib/data";
import { cleanAliases, createComrade, linkComrade, listComrades, updateComrade } from "@/lib/data-extras";

export const dynamic = "force-dynamic";

const norm = (s: string) => s.replace(/^Comrade\s+/i, "").trim().toLowerCase();

/**
 * Who you are, as the branch writes you: `{ name, initials, aliases }` —
 * "Jo Bloggs", "JB", ["Jo"]. Saves your profile and your People entry
 * together, so imports and the app treat "JB" and you as one person. If the
 * branch already had an entry for you without an account, it's linked and
 * anything waiting on it moves to your inbox. `comrade_id` picks that entry
 * explicitly (onboarding's "that's me").
 */
export async function PATCH(request: Request) {
  const { actor, error } = await withActor();
  if (error) return error;
  const body = await readJson(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("Your name, as the branch knows you");
  const initials = typeof body?.initials === "string" ? body.initials.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) : "";
  const aliases = Array.isArray(body?.aliases) ? body.aliases.filter((a): a is string => typeof a === "string") : [];
  const pronouns = typeof body?.pronouns === "string" ? body.pronouns.trim() || null : undefined;
  // Optional WhatsApp number; "" clears it.
  const phone = typeof body?.phone === "string" ? normalizePhone(body.phone) : undefined;
  try {
    const profile = await updateProfile(actor.id, {
      name,
      initials: initials || null,
      ...(pronouns !== undefined ? { pronouns } : {}),
      ...(phone !== undefined ? { phone } : {}),
    });
    const forms = cleanAliases(name, [...(initials ? [initials] : []), ...aliases]);
    const comrades = await listComrades();
    let mine = comrades.find((c) => c.profile_id === actor.id);
    let moved = 0;
    if (!mine) {
      // "That's me" (onboarding picked an entry), or the branch already knows
      // you by one of these names — claim that entry.
      const picked = typeof body?.comrade_id === "string" ? comrades.find((c) => c.id === body.comrade_id && !c.profile_id) : undefined;
      const keys = new Set([name, ...forms].map(norm));
      const known = picked ?? comrades.find((c) => !c.profile_id && [c.name, ...c.aliases].some((n) => keys.has(norm(n))));
      if (known) {
        const linked = await linkComrade(known.id, actor.id);
        mine = linked.comrade ?? known;
        moved = linked.moved;
      }
    }
    if (mine) await updateComrade(mine.id, { name, aliases: cleanAliases(name, [...forms, ...mine.aliases.filter((a) => norm(a) !== norm(mine!.name))]) });
    else {
      try {
        await createComrade(actor, { name, aliases: forms, profile_id: actor.id });
      } catch (e) {
        // Their People entry is in another branch (an admin working in a branch
        // that isn't their own): the profile is saved, so leave that entry be.
        if (!String((e as Error).message).includes("comrades_profile_id_key")) throw e;
      }
    }
    return json({ profile: profile ?? (await getProfile(actor.id)), moved });
  } catch (e) {
    return serverError(e);
  }
}
