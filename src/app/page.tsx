import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";

/** Signed in: your week. Signed out: sign in, or on the public demo, the guide first. */
export default async function RootPage() {
  const actor = await getActor();
  redirect(actor ? "/home" : isSupabaseConfigured ? "/login" : "/guide");
}
