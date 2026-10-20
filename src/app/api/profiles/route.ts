import { json, serverError, withActor } from "@/lib/api";
import { listProfiles } from "@/lib/data";
import { sanitizeProfilesFor } from "@/lib/profile-visibility";

export const dynamic = "force-dynamic";

export async function GET() {
  const { actor, error } = await withActor();
  if (error) return error;
  try {
    const profiles = await listProfiles();
    return json(sanitizeProfilesFor(profiles, actor));
  } catch (e) {
    return serverError(e);
  }
}
