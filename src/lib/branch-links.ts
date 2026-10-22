import type { Actor } from "./auth";
import type { BranchLinks } from "./types";
import { isSupabaseConfigured } from "./config";
import { findRow, insertRow, updateRow } from "./dev-store";
import { createClient } from "./supabase/server";

/* The branch's saved WhatsApp and Instagram links (schema v29): one row per branch, RLS keeps it to your branch. */

export async function getBranchLinks(actor: Actor): Promise<BranchLinks | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("branch_links").select("*").maybeSingle();
    return (data as BranchLinks) ?? null;
  }
  return actor.branch ? (findRow<BranchLinks & { id: string }>("branch_links", actor.branch.id) ?? null) : null;
}

export async function saveBranchLinks(actor: Actor, input: Pick<BranchLinks, "whatsapp" | "instagram">): Promise<BranchLinks> {
  const row = { ...input, updated_by: actor.id, updated_at: new Date().toISOString() };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("branch_links")
      .upsert({ branch_id: actor.branch?.id, ...row })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as BranchLinks;
  }
  const id = actor.branch?.id ?? "branch";
  type Stored = BranchLinks & { id: string };
  const existing = findRow<Stored>("branch_links", id);
  return (existing ? updateRow<Stored>("branch_links", id, row) : insertRow<Stored>("branch_links", { id, branch_id: id, ...row }))!;
}
