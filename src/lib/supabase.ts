import { createClient } from "@supabase/supabase-js";

// Configuração: variáveis de build (VITE_*) ou, em sites estáticos (GitHub Pages), configuração
// salva no navegador pela tela de configuração inicial. Apenas chaves PÚBLICAS (anon) ficam aqui.
const RUNTIME_KEY = "radar.supabase.config";
function runtimeConfig(): { url?: string; anon?: string } {
  try {
    return JSON.parse(localStorage.getItem(RUNTIME_KEY) ?? "{}");
  } catch {
    return {};
  }
}
const rc = runtimeConfig();

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || rc.url;
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || rc.anon;
export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
export const isRuntimeConfigured = !import.meta.env.VITE_SUPABASE_URL && !!rc.url;

export function saveRuntimeConfig(url: string, anon: string) {
  localStorage.setItem(RUNTIME_KEY, JSON.stringify({ url: url.trim().replace(/\/+$/, ""), anon: anon.trim() }));
}
export function clearRuntimeConfig() {
  localStorage.removeItem(RUNTIME_KEY);
}

/** URL absoluta do app (respeita o subcaminho do GitHub Pages). */
export const appUrl = (path = "") => `${location.origin}${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

export const supabase = createClient(SUPABASE_URL ?? "http://localhost:54321", SUPABASE_ANON_KEY ?? "public-anon-key-missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
