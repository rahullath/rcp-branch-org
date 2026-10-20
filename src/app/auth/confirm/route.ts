import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

const TYPES: EmailOtpType[] = ["email", "signup", "magiclink", "invite", "recovery", "email_change"];

/**
 * Where the sign-in emails link to: /auth/confirm?token_hash=…&type=email.
 * The token is checked here, so the link doesn't depend on Supabase's Site URL
 * or redirect list, and works in whichever browser the email opens in.
 * No branch yet → /home sends them to /welcome, which joins their invite.
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured) redirect("/login");
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next") ?? "/home");
  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next);
  }
  return NextResponse.redirect(new URL("/login?error=That sign-in link has expired or was already used. Send yourself a new one.", request.url));
}
