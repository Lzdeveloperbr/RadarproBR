import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// O cliente usa apenas a chave pública (anon). Todas as chaves privadas ficam nas Edge Functions.
export const supabase = createClient(SUPABASE_URL ?? "http://localhost:54321", SUPABASE_ANON_KEY ?? "public-anon-key-missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
