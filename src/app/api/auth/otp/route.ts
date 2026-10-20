import { json, readJson, badRequest, serverError } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return json({ error: "Demo mode — pick a comrade to continue" }, { status: 400 });
  }
  const body = await readJson(request);
  if (!body || typeof body.email !== "string" || !body.email.trim()) {
    return badRequest("Email is required");
  }
  try {
    const supabase = await createClient();
    const origin = request.headers.get("origin") ?? "http://localhost:3000";
    const next = safeNext(typeof body.next === "string" ? body.next : null);
    // The invite's code, kept on the account itself too: it survives the email being opened on another device.
    const inviteCode = next.match(/^\/welcome\?code=([A-Za-z0-9]{4,12})/)?.[1]?.toUpperCase() ?? request.headers.get("cookie")?.match(/(?:^|;\s*)pending_join=([A-Za-z0-9]{4,12})/)?.[1] ?? null;
    const { error } = await supabase.auth.signInWithOtp({
      email: body.email.trim(),
      // Carry where they were headed (e.g. an invite's /welcome?code=…) through the email link.
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`, ...(inviteCode ? { data: { invite_code: inviteCode } } : {}) },
    });
    if (error) {
      // Supabase's built-in mail only sends a few sign-in emails an hour for the whole app.
      if (error.code === "over_email_send_rate_limit" || error.status === 429) {
        return json({ error: "Too many sign-in emails have gone out in the last hour, so this one couldn't send. Try again in a little while. If it keeps happening, tell whoever runs the app." }, { status: 429 });
      }
      return json({ error: error.message }, { status: 400 });
    }
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
