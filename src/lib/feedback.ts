import type { Actor } from "./auth";
import type { Feedback } from "./types";
import { isSupabaseConfigured } from "./config";
import { deleteRow, findRow, insertRow, listRows, updateRow } from "./dev-store";
import { createClient } from "./supabase/server";

/* Feedback while the branch tries the app. Same dual pattern as data.ts. */

export async function listFeedback(): Promise<Feedback[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("feedback").select("*").order("created_at", { ascending: false }).limit(300);
    return (data ?? []) as Feedback[];
  }
  return [...listRows<Feedback>("feedback")].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getFeedback(id: string): Promise<Feedback | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("feedback").select("*").eq("id", id).maybeSingle();
    return (data as Feedback) ?? null;
  }
  return findRow<Feedback>("feedback", id) ?? null;
}

export async function createFeedback(actor: Actor, input: Pick<Feedback, "kind" | "text" | "page" | "device">): Promise<Feedback> {
  const row = { ...input, user_id: actor.id, status: "open" as const, created_at: new Date().toISOString() };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("feedback").insert(row).select().single();
    if (error) throw new Error(error.message);
    return data as Feedback;
  }
  return insertRow<Feedback>("feedback", row);
}

export async function updateFeedback(id: string, patch: Partial<Feedback>): Promise<Feedback | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("feedback").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data as Feedback;
  }
  return updateRow<Feedback>("feedback", id, patch) ?? null;
}

export async function deleteFeedback(id: string) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("feedback").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  deleteRow("feedback", id);
}
