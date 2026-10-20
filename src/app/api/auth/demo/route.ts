import { cookies } from "next/headers";
import { DEMO_COOKIE } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { findRow } from "@/lib/dev-store";
import { DEMO_USER_ID, seedProfiles } from "@/lib/seed";
import { json, badRequest } from "@/lib/api";
import type { Profile } from "@/lib/types";

export async function POST(request: Request) {
  if (isSupabaseConfigured) {
    return json({ demo: false, message: "Use Supabase auth" });
  }

  let body: { userId?: string } = {};
  try {
    body = (await request.json()) as { userId?: string };
  } catch {
    body = {};
  }

  const id = body.userId ?? DEMO_USER_ID;
  const profile = findRow<Profile>("profiles", id) ?? seedProfiles.find((p) => p.id === DEMO_USER_ID);
  if (!profile) return badRequest("Unknown user");

  const cookieStore = await cookies();
  cookieStore.set(DEMO_COOKIE, JSON.stringify({ id: profile.id, name: profile.name }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return json({ demo: true, profile });
}
