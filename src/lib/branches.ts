import type { Branch } from "./types";
import { isSupabaseConfigured } from "./config";
import { findRow, updateRow } from "./dev-store";
import { createClient } from "./supabase/server";
import { DEMO_BRANCH_ID } from "./seed";

/*
 * Branches: start one (you become its GS), join one with its code, see and
 * share your own branch's code. Membership and every bit of isolation are
 * enforced in Postgres (create_branch / join_branch / new_join_code and the
 * "same branch" policies); this is the thin wrapper the app calls.
 * Demo mode is a single branch.
 */

type Result = { ok: boolean; error?: string; id?: string; name?: string; join_code?: string; approved?: boolean; view_only?: boolean };

export async function myBranch(): Promise<Branch | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("branches").select("*").maybeSingle();
    return (data as Branch) ?? null;
  }
  return findRow<Branch>("branches", DEMO_BRANCH_ID) ?? null;
}

/** The name of the branch a join code belongs to (public — for the invite page). */
export async function branchForCode(code: string): Promise<string | null> {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(c)) return null;
  if (!isSupabaseConfigured) {
    const b = findRow<Branch>("branches", DEMO_BRANCH_ID);
    return b && b.join_code === c ? b.name : null;
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("branch_for_code", { p_code: c });
  return (data as string) ?? null;
}

export async function createBranch(name: string, district: string): Promise<Result> {
  if (!isSupabaseConfigured) return { ok: false, error: "The demo is a single branch" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_branch", { p_name: name, p_district: district });
  if (error) return { ok: false, error: error.message };
  return data as Result;
}

export async function joinBranch(code: string): Promise<Result> {
  if (!isSupabaseConfigured) return { ok: false, error: "The demo is a single branch" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_branch", { p_code: code });
  if (error) return { ok: false, error: error.message };
  return data as Result;
}

export async function newJoinCode(): Promise<string> {
  if (!isSupabaseConfigured) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    updateRow<Branch>("branches", DEMO_BRANCH_ID, { join_code: code });
    return code;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("new_join_code");
  if (error) throw new Error(error.message);
  return data as string;
}

export async function renameBranch(id: string, name: string): Promise<Branch | null> {
  if (!isSupabaseConfigured) return updateRow<Branch>("branches", id, { name }) ?? null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("branches").update({ name }).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as Branch;
}

/* ----------------------------- admin ----------------------------- */

type BranchRow = Pick<Branch, "id" | "name" | "district" | "approved" | "created_at">;

/** Every branch on this copy, waiting ones first. Admins only; [] for everyone else. */
export async function adminBranches(): Promise<BranchRow[]> {
  if (!isSupabaseConfigured) {
    const b = findRow<Branch>("branches", DEMO_BRANCH_ID);
    return b ? [{ id: b.id, name: b.name, district: b.district, approved: true }] : [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_branches");
  return error ? [] : ((data ?? []) as BranchRow[]);
}

/** Admin: let a new branch start using the app. */
export async function approveBranch(id: string): Promise<Result> {
  if (!isSupabaseConfigured) return { ok: true };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_branch", { p_branch: id });
  if (error) return { ok: false, error: error.message };
  return data as Result;
}

/** Secretary: a fresh viewer code, or null to switch the viewer link off. */
export async function setViewerCode(on: boolean): Promise<string | null> {
  if (!isSupabaseConfigured) {
    const code = on ? `V${Math.random().toString(36).slice(2, 9).toUpperCase()}` : null;
    updateRow<Branch>("branches", DEMO_BRANCH_ID, { viewer_code: code });
    return code;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_viewer_code", { p_on: on });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/** Admin: work in another branch. All the per-branch rules then follow it. */
export async function adminSwitchBranch(id: string): Promise<Result> {
  if (!isSupabaseConfigured) return { ok: false, error: "The demo is a single branch" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_switch_branch", { p_branch: id });
  if (error) return { ok: false, error: error.message };
  return data as Result;
}
