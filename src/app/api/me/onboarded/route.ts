import { json, serverError, withActor } from "@/lib/api";
import { markOnboarded } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/** Finished the first-run steps — the app stops sending you to /onboarding. */
export async function POST() {
  const { actor, error } = await withActor();
  if (error) return error;
  try {
    await markOnboarded(actor);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
