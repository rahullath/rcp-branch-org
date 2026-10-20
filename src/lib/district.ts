import type { Event, Material } from "./types";
import { isSupabaseConfigured } from "./config";
import { createClient } from "./supabase/server";

/*
 * What branches in a district share — and only this: each other's paper
 * sales and stalls (so a comrade free on another branch's day can join it),
 * and what each branch holds (to borrow a table or swap papers). Everything
 * else — agendas, contacts, follow-ups, reading groups — stays per branch.
 * Read through district_sales / district_materials / join_district_sale
 * In the single-branch demo these are empty.
 */

export type DistrictSale = Pick<Event, "id" | "title" | "event_type" | "start_time" | "location" | "status" | "target"> & {
  branch: string;
  going: number;
  mine: "going" | "maybe" | null;
};

export type DistrictMaterial = Pick<Material, "id" | "name" | "category" | "qty"> & { branch: string; holder: string };

export async function districtSales(): Promise<DistrictSale[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("district_sales");
  return error ? [] : ((data ?? []) as DistrictSale[]);
}

export async function joinDistrictSale(eventId: string, status: "going" | "maybe" | "no"): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "The demo is a single branch" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_district_sale", { p_event: eventId, p_status: status });
  if (error) return { ok: false, error: "Couldn't do that — try again" };
  return data as { ok: boolean; error?: string };
}

export async function districtMaterials(): Promise<DistrictMaterial[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("district_materials");
  return error ? [] : ((data ?? []) as DistrictMaterial[]);
}
