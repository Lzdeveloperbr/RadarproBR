/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="google.maps" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY?: string;
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
  readonly VITE_FUNCTIONS_URL?: string;
}
