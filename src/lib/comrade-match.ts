import type { Actor } from "./auth";
import type { Comrade, Profile } from "./types";
import { createComrade, listComrades } from "./data-v2";
import { listProfiles } from "./data";
import { resolvePerson } from "./agenda-import-apply";

/** The People entry for a name as someone typed it ("Ivy", "DP"), or a new one. */
export async function comradeForName(actor: Actor, raw: string): Promise<Comrade> {
  const [comrades, profiles] = await Promise.all([listComrades(), listProfiles()]);
  const hit = resolvePerson(raw, [], comrades);
  if (hit.comradeId) return comrades.find((c) => c.id === hit.comradeId)!;
  // Someone with an account: their People entry is linked to it (or made linked), so the app knows it's them.
  const account = resolvePerson(raw, profiles, []);
  if (account.id) {
    const linked = comrades.find((c) => c.profile_id === account.id);
    if (linked) return linked;
    const p = profiles.find((x) => x.id === account.id)!;
    return createComrade(actor, { name: p.name, aliases: raw.trim() !== p.name ? [raw.trim()] : [], profile_id: p.id });
  }
  return createComrade(actor, { name: raw.trim(), aliases: [] });
}

/** Who a written name is: an account, a People entry without one, or new. */
export async function whoIs(raw: string, profiles?: Profile[], comrades?: Comrade[]) {
  const [p, c] = await Promise.all([profiles ?? listProfiles(), comrades ?? listComrades()]);
  return resolvePerson(raw, p, c);
}
