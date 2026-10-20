import { json, readJson, badRequest, serverError } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

/** Sign in with a password, for accounts given one (works when sign-in emails don't). */
export async function POST(request: Request) {
  if (!isSupabaseConfigured) return json({ error: "Demo mode — pick a comrade to continue" }, { status: 400 });
  const body = await readJson(request);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return badRequest("Email and password, please");
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return json({ error: "That email and password don't match. No password? Use the email link instead." }, { status: 400 });
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
