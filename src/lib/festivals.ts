import type { Festival } from "./types";
import { isSupabaseConfigured } from "./config";
import { insertRow, listRows, updateRow } from "./dev-store";
import { createClient } from "./supabase/server";

/* The festival itself (schema v33): set by the admin, so dates and links are data. Reads swallow errors into "none". */

export async function getActiveFestival(): Promise<Festival | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("festivals").select("*").eq("active", true).order("start_date", { ascending: false }).limit(1).maybeSingle();
    return (data as Festival) ?? null;
  }
  return [...listRows<Festival>("festivals")].filter((f) => f.active).sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null;
}

export async function saveFestival(input: Pick<Festival, "name" | "start_date" | "end_date" | "location" | "url">): Promise<Festival> {
  const current = await getActiveFestival();
  const row = { ...input, active: true, updated_at: new Date().toISOString() };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const q = current ? supabase.from("festivals").update(row).eq("id", current.id) : supabase.from("festivals").insert(row);
    const { data, error } = await q.select().single();
    if (error) throw new Error(error.message);
    return data as Festival;
  }
  return (current ? updateRow<Festival>("festivals", current.id, row) : insertRow<Festival>("festivals", row))!;
}
