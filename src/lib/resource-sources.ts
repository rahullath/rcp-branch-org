import { RESOURCE_SOURCES, type ResourceSource } from "@/data/resource-sources";
import { isSupabaseConfigured } from "./config";
import { createClient } from "./supabase/server";

type Override = { key: string; url?: string | null; feed?: string | null; sitemap?: string | null; search?: string | null };

/** The built-in outlets with any officer corrections applied. */
export async function resourceSources(): Promise<ResourceSource[]> {
  let overrides: Override[] = [];
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("resource_sources").select("*");
    overrides = (data ?? []) as Override[];
  }
  return RESOURCE_SOURCES.map((s) => {
    const o = overrides.find((x) => x.key === s.key);
    if (!o) return s;
    return {
      ...s,
      url: o.url || s.url,
      feed: o.feed ?? s.feed,
      sitemap: o.sitemap ?? s.sitemap,
      search: o.search ?? s.search,
      // A pasted feed replaces finding one from the YouTube channel page.
      youtube: o.feed ? null : s.youtube,
    };
  });
}

export async function saveResourceSource(actorId: string, o: Override) {
  const supabase = await createClient();
  const { error } = await supabase.from("resource_sources").upsert({ ...o, updated_by: actorId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
