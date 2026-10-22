import type { Actor } from "./auth";
import type { GraphicTemplate } from "./types";
import { isSupabaseConfigured } from "./config";
import { deleteRow, insertRow, listRows } from "./dev-store";
import { createClient } from "./supabase/server";

/* Saved graphic designs (schema v31): one set per branch, RLS keeps them to your branch. */

export async function listGraphicTemplates(): Promise<GraphicTemplate[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("graphic_templates").select("*").order("created_at", { ascending: false });
    return (data ?? []) as GraphicTemplate[];
  }
  return [...listRows<GraphicTemplate>("graphic_templates")].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function createGraphicTemplate(actor: Actor, input: Pick<GraphicTemplate, "name" | "tpl" | "options" | "fields" | "event_type">): Promise<GraphicTemplate> {
  const row = { ...input, created_by: actor.id, created_at: new Date().toISOString() };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("graphic_templates").insert(row).select().single();
    if (error) throw new Error(error.message);
    return data as GraphicTemplate;
  }
  return insertRow<GraphicTemplate>("graphic_templates", row);
}

export async function deleteGraphicTemplate(id: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("graphic_templates").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  deleteRow("graphic_templates", id);
}
