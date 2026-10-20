export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const APP_NAME = "Revolutionary Communist International | Branch Organizer";
/** The two halves, for places that stack them (header, splash). */
export const APP_ORG = "Revolutionary Communist International";
export const APP_PRODUCT = "Branch Organizer";
export const APP_VERSION = "1.2.0";
