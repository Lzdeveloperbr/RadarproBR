import { supabase } from "./supabase";
import type { Business } from "./types";

export interface BusinessFilters {
  q?: string;
  city?: string;
  neighborhood?: string;
  category?: string;
  searchId?: string;
  onlyNoSite?: boolean;
  onlyWithSite?: boolean;
  sitesOffline?: boolean;
  noHttps?: boolean;
  noLocation?: boolean;
  noWhatsapp?: boolean;
  noInstagram?: boolean;
  ratingAbove4?: boolean;
  reviewsOver50?: boolean;
  levels?: ("alta" | "media" | "baixa")[];
  statuses?: string[];
  notAnalyzed?: boolean;
  radius?: { lat: number; lng: number; km: number } | null;
  ids?: string[];
  sort?: "score" | "name" | "rating" | "recent";
}

export const FILTER_TOGGLES: { key: keyof BusinessFilters; label: string }[] = [
  { key: "onlyNoSite", label: "Sem site identificado" },
  { key: "onlyWithSite", label: "Com site" },
  { key: "sitesOffline", label: "Sites fora do ar" },
  { key: "noHttps", label: "Sites sem HTTPS" },
  { key: "noLocation", label: "Sites sem localização" },
  { key: "noWhatsapp", label: "Sem WhatsApp identificado" },
  { key: "noInstagram", label: "Sem Instagram identificado" },
  { key: "ratingAbove4", label: "Avaliação acima de 4★" },
  { key: "reviewsOver50", label: "Mais de 50 avaliações" },
  { key: "notAnalyzed", label: "Ainda não analisados" },
];

export function countActive(f: BusinessFilters) {
  return Object.entries(f).filter(([k, v]) => k !== "sort" && (Array.isArray(v) ? v.length : !!v)).length;
}

export async function fetchBusinesses(orgId: string, f: BusinessFilters, limit = 1000): Promise<Business[]> {
  const select = f.searchId ? "*, search_results!inner(search_id)" : "*";
  let q: any = f.radius
    ? supabase.rpc("businesses_within", { p_org: orgId, p_lat: f.radius.lat, p_lng: f.radius.lng, p_km: f.radius.km }).select(select)
    : supabase.from("businesses").select(select).eq("organization_id", orgId);

  if (f.searchId) q = q.eq("search_results.search_id", f.searchId);
  if (f.ids) q = q.in("id", f.ids.length ? f.ids : ["00000000-0000-0000-0000-000000000000"]);
  if (f.q) {
    const term = f.q.replace(/[%,()]/g, " ").trim();
    q = q.or(`name.ilike.%${term}%,city.ilike.%${term}%,category.ilike.%${term}%,neighborhood.ilike.%${term}%,formatted_address.ilike.%${term}%`);
  }
  if (f.city) q = q.ilike("city", `%${f.city}%`);
  if (f.neighborhood) q = q.ilike("neighborhood", `%${f.neighborhood}%`);
  if (f.category) q = q.eq("category", f.category);
  if (f.onlyNoSite) q = q.eq("digital_status", "no_site");
  if (f.onlyWithSite) q = q.eq("has_own_site", true);
  if (f.sitesOffline) q = q.eq("has_own_site", true).eq("site_online", false);
  if (f.noHttps) q = q.eq("has_own_site", true).eq("site_https", false);
  if (f.noLocation) q = q.eq("has_own_site", true).eq("site_has_location", false);
  if (f.noWhatsapp) q = q.or("has_whatsapp.is.null,has_whatsapp.eq.false");
  if (f.noInstagram) q = q.or("has_instagram.is.null,has_instagram.eq.false");
  if (f.ratingAbove4) q = q.gt("rating", 4);
  if (f.reviewsOver50) q = q.gt("user_rating_count", 50);
  if (f.levels?.length) q = q.in("opportunity_level", f.levels);
  if (f.statuses?.length) q = q.in("digital_status", f.statuses);
  if (f.notAnalyzed) q = q.is("analyzed_at", null);

  const sort = f.sort ?? "score";
  if (sort === "score") q = q.order("opportunity_score", { ascending: false, nullsFirst: false }).order("name");
  if (sort === "name") q = q.order("name");
  if (sort === "rating") q = q.order("user_rating_count", { ascending: false, nullsFirst: false });
  if (sort === "recent") q = q.order("created_at", { ascending: false });
  const { data, error } = await q.limit(limit);
  if (error) throw error;
  return (data ?? []) as Business[];
}
