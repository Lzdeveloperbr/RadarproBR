import { db } from "./db";
import { haversineKm, stripAccents } from "./engine/normalize";
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
  { key: "noHttps", label: "Sites sem resposta em HTTPS" },
  { key: "noLocation", label: "Sites sem localização" },
  { key: "noWhatsapp", label: "Sem WhatsApp identificado" },
  { key: "noInstagram", label: "Sem Instagram identificado" },
  { key: "notAnalyzed", label: "Ainda não analisados" },
];

export function countActive(f: BusinessFilters) {
  return Object.entries(f).filter(([k, v]) => k !== "sort" && (Array.isArray(v) ? v.length : !!v)).length;
}

const norm = (v: string | null | undefined) => stripAccents((v ?? "").toLowerCase());

export async function fetchBusinesses(f: BusinessFilters, limit = 1000): Promise<Business[]> {
  let list: Business[];
  if (f.ids) list = (await db.businesses.bulkGet(f.ids)).filter((b): b is Business => !!b);
  else if (f.searchId) {
    const ids = (await db.search_results.where("search_id").equals(f.searchId).toArray()).map((r) => r.business_id);
    list = (await db.businesses.bulkGet(ids)).filter((b): b is Business => !!b);
  } else list = await db.businesses.toArray();

  const q = norm(f.q);
  list = list.filter((b) => {
    if (q && ![b.name, b.city, b.category, b.neighborhood, b.formatted_address].some((v) => norm(v).includes(q))) return false;
    if (f.city && !norm(b.city).includes(norm(f.city))) return false;
    if (f.neighborhood && !norm(b.neighborhood).includes(norm(f.neighborhood))) return false;
    if (f.category && b.category !== f.category) return false;
    if (f.onlyNoSite && b.digital_status !== "no_site") return false;
    if (f.onlyWithSite && b.has_own_site !== true) return false;
    if (f.sitesOffline && !(b.has_own_site && b.site_https === false)) return false;
    if (f.noHttps && !(b.has_own_site && b.site_https === false)) return false;
    if (f.noLocation && !(b.has_own_site && b.site_has_location === false)) return false;
    if (f.noWhatsapp && b.has_whatsapp === true) return false;
    if (f.noInstagram && b.has_instagram === true) return false;
    if (f.ratingAbove4 && !((b.rating ?? 0) > 4)) return false;
    if (f.reviewsOver50 && !((b.user_rating_count ?? 0) > 50)) return false;
    if (f.levels?.length && !(b.opportunity_level && f.levels.includes(b.opportunity_level))) return false;
    if (f.statuses?.length && !f.statuses.includes(b.digital_status)) return false;
    if (f.notAnalyzed && b.analyzed_at) return false;
    if (f.radius && (b.lat == null || b.lng == null || haversineKm(f.radius.lat, f.radius.lng, b.lat, b.lng) > f.radius.km)) return false;
    return true;
  });
  const sort = f.sort ?? "score";
  list.sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name, "pt-BR")
    : sort === "rating" ? (b.user_rating_count ?? -1) - (a.user_rating_count ?? -1)
    : sort === "recent" ? b.created_at.localeCompare(a.created_at)
    : (b.opportunity_score ?? -1) - (a.opportunity_score ?? -1) || a.name.localeCompare(b.name, "pt-BR"));
  return list.slice(0, limit);
}
