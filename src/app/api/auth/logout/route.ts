import { cookies } from "next/headers";
import { DEMO_COOKIE } from "@/lib/auth";
import { json } from "@/lib/api";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_COOKIE);
  return json({ ok: true });
}
