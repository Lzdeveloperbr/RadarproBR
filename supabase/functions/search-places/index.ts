// Pesquisa real de estabelecimentos via Google Places API (New) e persistência no Supabase.
import { handler, json, readJson, HttpError } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { enforceRateLimit, recordUsage, logActivity } from "../_shared/usage.ts";
import { geocode, textSearch, component, type PlaceResult } from "../_shared/places.ts";
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
}

const clean = (s: unknown, max = 120) => (typeof s === "string" ? s.trim().slice(0, max) : "");

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

  // Cria registro da pesquisa
  const { data: search, error: sErr } = await ctx.sb.from("searches").insert({
    organization_id: ctx.orgId, user_id: ctx.userId, country, state: state || null, city: city || "Ponto no mapa",
    neighborhood: neighborhood || null, categories, custom_category: custom || null, radius_km: radiusKm,
    max_results: maxResults, digital_filter: clean(b.digital_filter, 30) || "all", status: "running",
    batch_job_id: b.batch_job_id ?? null,
  }).select().single();
  if (sErr) throw new HttpError(500, "Não foi possível registrar a pesquisa: " + sErr.message);

  let apiCalls = 0;
  try {
    // 1) Centro geográfico
    let center = b.center && Number.isFinite(b.center.lat) && Number.isFinite(b.center.lng) ? b.center : null;
    if (!center) {
      await enforceRateLimit(ctx, "google_geocoding");
      const address = [neighborhood, city, state, country].filter(Boolean).join(", ");
      const g = await geocode(address);
      apiCalls++;
      await recordUsage(ctx, "google_geocoding", "geocode");
      if (!g) throw new HttpError(404, `Localidade não encontrada: ${address}`);
      center = { lat: g.lat, lng: g.lng };
      if (b.whole_city && g.viewportKm) radiusKm = Math.min(50, Math.max(radiusKm, Math.ceil(g.viewportKm)));
    }
    await ctx.sb.from("searches").update({ center_lat: center.lat, center_lng: center.lng, radius_km: radiusKm }).eq("id", search.id);

    // 2) Consulta por categoria (com grade para ampliar cobertura acima de 60 resultados)
    const perCategory = Math.ceil(maxResults / categories.length);
    const cells = perCategory > 60 ? Math.min(9, Math.ceil(perCategory / 40)) : 1;
    const centers = gridCenters(center.lat, center.lng, radiusKm, cells);
    const found = new Map<string, { place: PlaceResult; category: string; distance: number }>();

    for (const category of categories) {
      const term = CATEGORY_QUERIES[category] ?? category;
      const where = [neighborhood, city, state].filter(Boolean).join(", ");
      const query = where ? `${term} em ${where}` : term;
      let countForCategory = 0;
      for (const c of centers) {
        let pageToken: string | undefined;
        for (let page = 0; page < 3 && countForCategory < perCategory; page++) {
          await enforceRateLimit(ctx, "google_places");
          let resp;
          try {
            resp = await textSearch({ query, lat: c.lat, lng: c.lng, radiusM: c.radiusKm * 1000, pageToken });
            apiCalls++;
            await recordUsage(ctx, "google_places", "places:searchText");
          } catch (e) {
            await recordUsage(ctx, "google_places", "places:searchText", { success: false, error: String((e as Error).message) });
            throw e;
          }
          for (const p of resp.places) {
            if (!p.location || found.has(p.id)) continue;
            const distance = haversineKm(center.lat, center.lng, p.location.latitude, p.location.longitude);
            if (distance > radiusKm * 1.05) continue; // respeita o raio informado
            if (p.businessStatus === "CLOSED_PERMANENTLY") continue;
            found.set(p.id, { place: p, category, distance });
            countForCategory++;
            if (countForCategory >= perCategory) break;
          }
          pageToken = resp.nextPageToken;
          if (!pageToken) break;
          await new Promise((r) => setTimeout(r, 300));
        }
        if (countForCategory >= perCategory) break;
      }
    }

    // 3) Persistência com deduplicação (place_id único por organização + chave nome/telefone/coordenada)
    const placeIds = [...found.keys()];
    const existing = new Map<string, string>();
    for (let i = 0; i < placeIds.length; i += 200) {
      const { data } = await ctx.sb.from("businesses").select("id, place_id").eq("organization_id", ctx.orgId).in("place_id", placeIds.slice(i, i + 200));
      (data ?? []).forEach((r) => existing.set(r.place_id, r.id));
    }

    const seenKeys = new Set<string>();
    const rows = [...found.values()].map(({ place: p, category }) => {
      const site = p.websiteUri ? normalizeUrl(p.websiteUri) : null;
      const kind = classifyUrl(site);
      const name = p.displayName?.text ?? "Sem nome";
      return {
        organization_id: ctx.orgId,
        place_id: p.id,
        dedupe_key: dedupeKey(name, p.nationalPhoneNumber, p.location?.latitude, p.location?.longitude),
        name,
        category,
        primary_type: p.primaryType ?? null,
        primary_type_label: p.primaryTypeDisplayName?.text ?? null,
        types: p.types ?? [],
        formatted_address: p.formattedAddress ?? null,
        street: component(p, "route"),
        street_number: component(p, "street_number"),
        neighborhood: component(p, "sublocality_level_1") ?? component(p, "sublocality") ?? component(p, "neighborhood"),
        city: component(p, "administrative_area_level_2") ?? component(p, "locality"),
        state: component(p, "administrative_area_level_1", true),
        postal_code: component(p, "postal_code"),
        country: component(p, "country"),
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
        phone: p.nationalPhoneNumber ?? null,
        international_phone: p.internationalPhoneNumber ?? null,
        google_maps_uri: p.googleMapsUri ?? null,
        places_website_uri: site,
        rating: p.rating ?? null,
        user_rating_count: p.userRatingCount ?? null,
        business_status: p.businessStatus ?? null,
        opening_hours: p.regularOpeningHours ?? null,
        price_level: p.priceLevel ?? null,
        primary_website: kind === "own_site" ? site : null,
        digital_status: kind === "own_site" ? "site_pending" : "unknown",
        has_instagram: site && /instagram\.com/i.test(site) ? true : null,
        has_facebook: site && /facebook\.com|fb\.com/i.test(site) ? true : null,
        source: "google_places",
        raw: p,
      };
    }).filter((r) => (seenKeys.has(r.dedupe_key) ? false : (seenKeys.add(r.dedupe_key), true)));

    // Upsert em blocos. Campos de análise só são definidos para registros novos.
    const saved: { id: string; place_id: string }[] = [];
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const newRows = chunk.filter((r) => !existing.has(r.place_id));
      const oldRows = chunk.filter((r) => existing.has(r.place_id));
      if (newRows.length) {
        const { data, error } = await ctx.sb.from("businesses")
          .upsert(newRows, { onConflict: "organization_id,dedupe_key", ignoreDuplicates: false })
          .select("id, place_id");
        if (error) throw new HttpError(500, "Erro ao salvar estabelecimentos: " + error.message);
        saved.push(...(data ?? []));
      }
      for (const r of oldRows) {
        // atualiza dados públicos do Places, preservando análises
        const { digital_status: _d, primary_website: _p, has_instagram: _i, has_facebook: _f, dedupe_key: _k, ...pub } = r;
        await ctx.sb.from("businesses").update(pub).eq("id", existing.get(r.place_id)!);
        saved.push({ id: existing.get(r.place_id)!, place_id: r.place_id });
      }
    }
    const idByPlace = new Map(saved.map((s) => [s.place_id, s.id]));

    // 4) Vínculos da pesquisa, contatos, localização e sites informados pelo Places
    const links: { search_id: string; business_id: string; organization_id: string; category: string; was_new: boolean; distance_km: number }[] = [];
    const contacts: Record<string, unknown>[] = [], locations: Record<string, unknown>[] = [], websites: Record<string, unknown>[] = [];
    for (const { place: p, category, distance } of found.values()) {
      const id = idByPlace.get(p.id);
      if (!id) continue;
      links.push({ search_id: search.id, business_id: id, organization_id: ctx.orgId, category, was_new: !existing.has(p.id), distance_km: Math.round(distance * 100) / 100 });
      if (p.nationalPhoneNumber) contacts.push({ organization_id: ctx.orgId, business_id: id, type: "phone", value: p.nationalPhoneNumber, url: `tel:${(p.internationalPhoneNumber ?? p.nationalPhoneNumber).replace(/[^\d+]/g, "")}`, source: "google_places" });
      locations.push({
        organization_id: ctx.orgId, business_id: id, source: "google_places", full_address: p.formattedAddress ?? null,
        street: component(p, "route"), neighborhood: component(p, "sublocality_level_1") ?? component(p, "sublocality"),
        city: component(p, "administrative_area_level_2") ?? component(p, "locality"), state: component(p, "administrative_area_level_1", true),
        postal_code: component(p, "postal_code"), lat: p.location?.latitude, lng: p.location?.longitude, maps_link: p.googleMapsUri ?? null,
      });
      const site = p.websiteUri ? normalizeUrl(p.websiteUri) : null;
      if (site) {
        const kind = classifyUrl(site);
        websites.push({ organization_id: ctx.orgId, business_id: id, url: site, domain: hostnameOf(site), kind, source: "google_places", verified: true, verification_note: "Informado no perfil do Google", is_primary: kind === "own_site" });
        if (kind === "social") {
          const net = /instagram/i.test(site) ? "instagram" : /facebook|fb\./i.test(site) ? "facebook" : /tiktok/i.test(site) ? "tiktok" : "other";
          contacts.push({ organization_id: ctx.orgId, business_id: id, type: net, value: site, url: site, source: "google_places" });
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

    // Cria leads "novo" para estabelecimentos ainda não cadastrados no CRM (sem duplicar)
    const leadRows = links.filter((l) => l.was_new).map((l) => ({ organization_id: ctx.orgId, business_id: l.business_id, status: "nao_analisado" }));
    await up("leads", leadRows, "organization_id,business_id");

    const totalNew = links.filter((l) => l.was_new).length;
    const { data: done } = await ctx.sb.from("searches").update({
      status: "completed", total_found: links.length, total_new: totalNew, api_calls: apiCalls, completed_at: new Date().toISOString(),
    }).eq("id", search.id).select().single();

    await logActivity(ctx, "search.completed", { type: "search", id: search.id }, { city, categories, found: links.length, new: totalNew });
    return json(req, { search: done, business_ids: links.map((l) => l.business_id), found: links.length, new: totalNew, api_calls: apiCalls });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.sb.from("searches").update({ status: "failed", error: msg.slice(0, 500), api_calls: apiCalls, completed_at: new Date().toISOString() }).eq("id", search.id);
    await logActivity(ctx, "search.failed", { type: "search", id: search.id }, { error: msg }, "error");
    throw e;
  }
}));
