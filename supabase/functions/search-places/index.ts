// Pesquisa real de estabelecimentos e persistência no Supabase.
// Fontes: Google Places API (New) — quando GOOGLE_MAPS_API_KEY existe — ou OpenStreetMap (gratuito, sem chave).
import { handler, json, readJson, HttpError, env } from "../_shared/http.ts";
import { requireUser, type Ctx } from "../_shared/auth.ts";
import { enforceRateLimit, recordUsage, logActivity } from "../_shared/usage.ts";
import { geocode, textSearch, component } from "../_shared/places.ts";
import { nominatimGeocode, overpassSearch, buildOverpassQuery, parseOsmElement, formatAddress, describeOpeningHours } from "../_shared/osm.ts";
import { CATEGORY_QUERIES } from "../_shared/categories.ts";
import { classifyUrl, normalizeUrl, hostnameOf } from "../_shared/classify.ts";
import { dedupeKey, haversineKm, gridCenters } from "../_shared/normalize.ts";

interface Body {
  country?: string;
  state?: string;
  city: string;
  neighborhood?: string;
  categories: string[];
  custom_category?: string;
  radius_km?: number;
  max_results?: number;
  digital_filter?: string;
  whole_city?: boolean;
  center?: { lat: number; lng: number } | null;
  batch_job_id?: string | null;
  provider?: "auto" | "google" | "osm";
}

/** Estabelecimento normalizado, independente da fonte. */
interface Found {
  placeId: string;
  name: string;
  category: string;
  distance: number;
  lat: number;
  lng: number;
  primaryType: string | null;
  primaryTypeLabel: string | null;
  types: string[];
  address: string | null;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  intlPhone: string | null;
  mapsUri: string | null;
  website: string | null;
  rating: number | null;
  ratingCount: number | null;
  status: string | null;
  hours: unknown;
  priceLevel: string | null;
  source: "google_places" | "openstreetmap";
  contacts: { type: string; value: string; url: string | null }[];
  raw: unknown;
}

const clean = (s: unknown, max = 120) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export function chooseProvider(requested?: string): "google" | "osm" {
  const hasGoogle = !!(env("GOOGLE_MAPS_API_KEY") ?? env("GOOGLE_PLACES_API_KEY"));
  const pref = (requested && requested !== "auto" ? requested : env("SEARCH_PROVIDER") ?? "auto").toLowerCase();
  if (pref === "google") {
    if (!hasGoogle) throw new HttpError(412, "Google Places selecionado, mas GOOGLE_MAPS_API_KEY não está configurada. Use a fonte gratuita OpenStreetMap ou configure a chave.", "missing_google_key");
    return "google";
  }
  if (pref === "osm") return "osm";
  return hasGoogle ? "google" : "osm";
}

async function searchGoogle(ctx: Ctx, p: { categories: string[]; where: string; center: { lat: number; lng: number }; radiusKm: number; perCategory: number }, counter: { calls: number }) {
  const found = new Map<string, Found>();
  const cells = p.perCategory > 60 ? Math.min(9, Math.ceil(p.perCategory / 40)) : 1;
  const centers = gridCenters(p.center.lat, p.center.lng, p.radiusKm, cells);
  for (const category of p.categories) {
    const term = CATEGORY_QUERIES[category] ?? category;
    const query = p.where ? `${term} em ${p.where}` : term;
    let count = 0;
    for (const c of centers) {
      let pageToken: string | undefined;
      for (let page = 0; page < 3 && count < p.perCategory; page++) {
        await enforceRateLimit(ctx, "google_places");
        let resp;
        try {
          resp = await textSearch({ query, lat: c.lat, lng: c.lng, radiusM: c.radiusKm * 1000, pageToken });
          counter.calls++;
          await recordUsage(ctx, "google_places", "places:searchText");
        } catch (e) {
          await recordUsage(ctx, "google_places", "places:searchText", { success: false, error: String((e as Error).message) });
          throw e;
        }
        for (const pl of resp.places) {
          if (!pl.location || found.has(pl.id)) continue;
          const distance = haversineKm(p.center.lat, p.center.lng, pl.location.latitude, pl.location.longitude);
          if (distance > p.radiusKm * 1.05 || pl.businessStatus === "CLOSED_PERMANENTLY") continue;
          const site = pl.websiteUri ? normalizeUrl(pl.websiteUri) : null;
          found.set(pl.id, {
            placeId: pl.id, name: pl.displayName?.text ?? "Sem nome", category, distance,
            lat: pl.location.latitude, lng: pl.location.longitude,
            primaryType: pl.primaryType ?? null, primaryTypeLabel: pl.primaryTypeDisplayName?.text ?? null, types: pl.types ?? [],
            address: pl.formattedAddress ?? null, street: component(pl, "route"), number: component(pl, "street_number"),
            neighborhood: component(pl, "sublocality_level_1") ?? component(pl, "sublocality") ?? component(pl, "neighborhood"),
            city: component(pl, "administrative_area_level_2") ?? component(pl, "locality"), state: component(pl, "administrative_area_level_1", true),
            postalCode: component(pl, "postal_code"), country: component(pl, "country"),
            phone: pl.nationalPhoneNumber ?? null, intlPhone: pl.internationalPhoneNumber ?? null, mapsUri: pl.googleMapsUri ?? null,
            website: site, rating: pl.rating ?? null, ratingCount: pl.userRatingCount ?? null, status: pl.businessStatus ?? null,
            hours: pl.regularOpeningHours ?? null, priceLevel: pl.priceLevel ?? null, source: "google_places", contacts: [], raw: pl,
          });
          if (++count >= p.perCategory) break;
        }
        pageToken = resp.nextPageToken;
        if (!pageToken) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      if (count >= p.perCategory) break;
    }
  }
  return found;
}

async function searchOsm(ctx: Ctx, p: { categories: string[]; center: { lat: number; lng: number }; radiusKm: number; perCategory: number; city: string; state: string }, counter: { calls: number }) {
  const found = new Map<string, Found>();
  for (const category of p.categories) {
    await enforceRateLimit(ctx, "openstreetmap");
    const q = buildOverpassQuery(category, p.center.lat, p.center.lng, p.radiusKm * 1000, Math.min(1000, p.perCategory * 3));
    let elements;
    try {
      elements = await overpassSearch(q);
      counter.calls++;
      await recordUsage(ctx, "openstreetmap", "overpass");
    } catch (e) {
      await recordUsage(ctx, "openstreetmap", "overpass", { success: false, error: String((e as Error).message) });
      throw e;
    }
    const parsed = elements.map(parseOsmElement).filter((x): x is NonNullable<typeof x> => !!x)
      .map((pl) => ({ pl, distance: haversineKm(p.center.lat, p.center.lng, pl.lat, pl.lng) }))
      .filter((x) => x.distance <= p.radiusKm * 1.05)
      .sort((a, b) => a.distance - b.distance);
    let count = 0;
    for (const { pl, distance } of parsed) {
      if (found.has(pl.id)) continue;
      const site = pl.website ? normalizeUrl(pl.website) : null;
      const contacts: Found["contacts"] = [];
      if (pl.whatsapp) contacts.push({ type: "whatsapp", value: pl.whatsapp.replace(/\D/g, "") || pl.whatsapp, url: null });
      if (pl.instagram) contacts.push({ type: "instagram", value: pl.instagram, url: pl.instagram });
      if (pl.facebook) contacts.push({ type: "facebook", value: pl.facebook, url: pl.facebook });
      if (pl.email) contacts.push({ type: "email", value: pl.email, url: `mailto:${pl.email}` });
      const weekday = describeOpeningHours(pl.opening_hours);
      found.set(pl.id, {
        placeId: pl.id, name: pl.name, category, distance, lat: pl.lat, lng: pl.lng,
        primaryType: pl.primary_type, primaryTypeLabel: pl.primary_type, types: Object.entries(pl.tags).filter(([k]) => ["shop", "amenity", "office", "craft", "tourism", "leisure", "healthcare", "cuisine"].includes(k)).map(([k, v]) => `${k}:${v}`),
        address: formatAddress(pl, p.city, p.state), street: pl.street, number: pl.number, neighborhood: pl.neighborhood,
        city: pl.city ?? (p.city || null), state: pl.state ?? (p.state || null), postalCode: pl.postal_code, country: "Brasil",
        phone: pl.phone, intlPhone: pl.phone, mapsUri: `https://www.google.com/maps/search/?api=1&query=${pl.lat},${pl.lng}`,
        website: site, rating: null, ratingCount: null, status: pl.tags["disused"] || pl.tags["abandoned"] ? "CLOSED" : "OPERATIONAL",
        hours: weekday ? { weekdayDescriptions: weekday, osm: pl.opening_hours } : null, priceLevel: null, source: "openstreetmap",
        contacts, raw: { osm_url: pl.osm_url, tags: pl.tags },
      });
      if (++count >= p.perCategory) break;
    }
    if (p.categories.length > 1) await new Promise((r) => setTimeout(r, 1000)); // gentileza com o servidor público
  }
  return found;
}

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
  const ctx = await requireUser(req);
  const b = await readJson<Body>(req);

  const city = clean(b.city);
  const state = clean(b.state, 40);
  const country = clean(b.country, 60) || "Brasil";
  const neighborhood = clean(b.neighborhood);
  const custom = clean(b.custom_category, 80);
  const categories = (Array.isArray(b.categories) ? b.categories : []).map((c) => clean(c, 80)).filter(Boolean).slice(0, 15);
  if (custom) categories.push(custom);
  if (!city && !b.center) throw new HttpError(400, "Informe a cidade ou um ponto central para a pesquisa");
  if (!categories.length) throw new HttpError(400, "Selecione ao menos uma categoria");
  const maxResults = Math.max(1, Math.min(300, Math.round(Number(b.max_results) || 60)));
  let radiusKm = Math.max(0.5, Math.min(100, Number(b.radius_km) || 10));
  const provider = chooseProvider(b.provider);

  const { data: search, error: sErr } = await ctx.sb.from("searches").insert({
    organization_id: ctx.orgId, user_id: ctx.userId, country, state: state || null, city: city || "Ponto no mapa",
    neighborhood: neighborhood || null, categories, custom_category: custom || null, radius_km: radiusKm,
    max_results: maxResults, digital_filter: clean(b.digital_filter, 30) || "all", status: "running",
    batch_job_id: b.batch_job_id ?? null, provider,
  }).select().single();
  if (sErr) throw new HttpError(500, "Não foi possível registrar a pesquisa: " + sErr.message);

  const counter = { calls: 0 };
  try {
    // 1) Centro geográfico
    let center = b.center && Number.isFinite(b.center.lat) && Number.isFinite(b.center.lng) ? b.center : null;
    if (!center) {
      const address = [neighborhood, city, state, country].filter(Boolean).join(", ");
      if (provider === "google") {
        await enforceRateLimit(ctx, "google_geocoding");
        const g = await geocode(address);
        counter.calls++;
        await recordUsage(ctx, "google_geocoding", "geocode");
        if (!g) throw new HttpError(404, `Localidade não encontrada: ${address}`);
        center = { lat: g.lat, lng: g.lng };
        if (b.whole_city && g.viewportKm) radiusKm = Math.min(50, Math.max(radiusKm, Math.ceil(g.viewportKm)));
      } else {
        await enforceRateLimit(ctx, "openstreetmap");
        const g = await nominatimGeocode(address);
        counter.calls++;
        await recordUsage(ctx, "openstreetmap", "nominatim");
        if (!g) throw new HttpError(404, `Localidade não encontrada no OpenStreetMap: ${address}`);
        center = { lat: g.lat, lng: g.lng };
        if (b.whole_city && g.radiusKm) radiusKm = Math.min(50, Math.max(radiusKm, Math.ceil(g.radiusKm)));
      }
    }
    await ctx.sb.from("searches").update({ center_lat: center.lat, center_lng: center.lng, radius_km: radiusKm }).eq("id", search.id);

    // 2) Busca na fonte escolhida
    const perCategory = Math.ceil(maxResults / categories.length);
    const found = provider === "google"
      ? await searchGoogle(ctx, { categories, where: [neighborhood, city, state].filter(Boolean).join(", "), center, radiusKm, perCategory }, counter)
      : await searchOsm(ctx, { categories, center, radiusKm, perCategory, city, state }, counter);

    // 3) Persistência com deduplicação (place_id único por organização + chave nome/telefone/coordenada)
    const placeIds = [...found.keys()];
    const existing = new Map<string, string>();
    for (let i = 0; i < placeIds.length; i += 200) {
      const { data } = await ctx.sb.from("businesses").select("id, place_id").eq("organization_id", ctx.orgId).in("place_id", placeIds.slice(i, i + 200));
      (data ?? []).forEach((r) => existing.set(r.place_id, r.id));
    }

    const seenKeys = new Set<string>();
    const rows = [...found.values()].map((f) => {
      const kind = classifyUrl(f.website);
      return {
        organization_id: ctx.orgId, place_id: f.placeId, dedupe_key: dedupeKey(f.name, f.phone, f.lat, f.lng), name: f.name,
        category: f.category, primary_type: f.primaryType, primary_type_label: f.primaryTypeLabel, types: f.types,
        formatted_address: f.address, street: f.street, street_number: f.number, neighborhood: f.neighborhood, city: f.city,
        state: f.state, postal_code: f.postalCode, country: f.country, lat: f.lat, lng: f.lng, phone: f.phone,
        international_phone: f.intlPhone, google_maps_uri: f.mapsUri, places_website_uri: f.website, rating: f.rating,
        user_rating_count: f.ratingCount, business_status: f.status, opening_hours: f.hours, price_level: f.priceLevel,
        primary_website: kind === "own_site" ? f.website : null, digital_status: kind === "own_site" ? "site_pending" : "unknown",
        has_instagram: (f.website && /instagram\.com/i.test(f.website)) || f.contacts.some((c) => c.type === "instagram") ? true : null,
        has_facebook: (f.website && /facebook\.com|fb\.com/i.test(f.website)) || f.contacts.some((c) => c.type === "facebook") ? true : null,
        source: f.source, raw: f.raw,
      };
    }).filter((r) => (seenKeys.has(r.dedupe_key) ? false : (seenKeys.add(r.dedupe_key), true)));

    const saved: { id: string; place_id: string }[] = [];
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const newRows = chunk.filter((r) => !existing.has(r.place_id));
      const oldRows = chunk.filter((r) => existing.has(r.place_id));
      if (newRows.length) {
        const { data, error } = await ctx.sb.from("businesses").upsert(newRows, { onConflict: "organization_id,dedupe_key", ignoreDuplicates: false }).select("id, place_id");
        if (error) throw new HttpError(500, "Erro ao salvar estabelecimentos: " + error.message);
        saved.push(...(data ?? []));
      }
      for (const r of oldRows) {
        // atualiza dados públicos da fonte, preservando as análises
        const { digital_status: _d, primary_website: _p, has_instagram: _i, has_facebook: _f, dedupe_key: _k, ...pub } = r;
        await ctx.sb.from("businesses").update(pub).eq("id", existing.get(r.place_id)!);
        saved.push({ id: existing.get(r.place_id)!, place_id: r.place_id });
      }
    }
    const idByPlace = new Map(saved.map((s) => [s.place_id, s.id]));
    const sourceLabel = provider === "google" ? "google_places" : "openstreetmap";

    // 4) Vínculos, contatos, localização e sites informados pela fonte
    const links: { search_id: string; business_id: string; organization_id: string; category: string; was_new: boolean; distance_km: number }[] = [];
    const contacts: Record<string, unknown>[] = [], locations: Record<string, unknown>[] = [], websites: Record<string, unknown>[] = [];
    for (const f of found.values()) {
      const id = idByPlace.get(f.placeId);
      if (!id) continue;
      links.push({ search_id: search.id, business_id: id, organization_id: ctx.orgId, category: f.category, was_new: !existing.has(f.placeId), distance_km: Math.round(f.distance * 100) / 100 });
      if (f.phone) contacts.push({ organization_id: ctx.orgId, business_id: id, type: "phone", value: f.phone, url: `tel:${(f.intlPhone ?? f.phone).replace(/[^\d+]/g, "")}`, source: sourceLabel });
      for (const c of f.contacts) {
        const url = c.type === "whatsapp" && /^\d{10,13}$/.test(c.value) ? `https://wa.me/${c.value.length <= 11 ? "55" + c.value : c.value}` : c.url;
        contacts.push({ organization_id: ctx.orgId, business_id: id, type: c.type, value: c.value.slice(0, 300), url, source: sourceLabel });
      }
      locations.push({
        organization_id: ctx.orgId, business_id: id, source: sourceLabel, full_address: f.address, street: f.street,
        neighborhood: f.neighborhood, city: f.city, state: f.state, postal_code: f.postalCode, lat: f.lat, lng: f.lng, maps_link: f.mapsUri,
      });
      if (f.website) {
        const kind = classifyUrl(f.website);
        websites.push({ organization_id: ctx.orgId, business_id: id, url: f.website, domain: hostnameOf(f.website), kind, source: sourceLabel, verified: true,
          verification_note: provider === "google" ? "Informado no perfil do Google" : "Informado no cadastro do OpenStreetMap", is_primary: kind === "own_site" });
        if (kind === "social") {
          const net = /instagram/i.test(f.website) ? "instagram" : /facebook|fb\./i.test(f.website) ? "facebook" : /tiktok/i.test(f.website) ? "tiktok" : "other";
          contacts.push({ organization_id: ctx.orgId, business_id: id, type: net, value: f.website, url: f.website, source: sourceLabel });
        }
      }
    }
    const up = async (table: string, data: unknown[], onConflict: string) => {
      for (let i = 0; i < data.length; i += 200) {
        const { error } = await ctx.sb.from(table).upsert(data.slice(i, i + 200) as any[], { onConflict, ignoreDuplicates: table !== "business_locations" });
        if (error) console.error(table, error.message);
      }
    };
    await up("search_results", links, "search_id,business_id");
    await up("business_contacts", contacts, "business_id,type,value");
    await up("business_locations", locations, "business_id,source");
    await up("business_websites", websites, "business_id,url");
    await up("leads", links.filter((l) => l.was_new).map((l) => ({ organization_id: ctx.orgId, business_id: l.business_id, status: "nao_analisado" })), "organization_id,business_id");

    const totalNew = links.filter((l) => l.was_new).length;
    const { data: done } = await ctx.sb.from("searches").update({
      status: "completed", total_found: links.length, total_new: totalNew, api_calls: counter.calls, completed_at: new Date().toISOString(),
    }).eq("id", search.id).select().single();

    await logActivity(ctx, "search.completed", { type: "search", id: search.id }, { city, categories, found: links.length, new: totalNew, provider });
    return json(req, { search: done, business_ids: links.map((l) => l.business_id), found: links.length, new: totalNew, api_calls: counter.calls, provider });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.sb.from("searches").update({ status: "failed", error: msg.slice(0, 500), api_calls: counter.calls, completed_at: new Date().toISOString() }).eq("id", search.id);
    await logActivity(ctx, "search.failed", { type: "search", id: search.id }, { error: msg }, "error");
    throw e;
  }
}));
