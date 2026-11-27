// Serviços do RADAR LOCAL PRO executados no navegador: pesquisa (OpenStreetMap), investigação digital,
// classificação de oportunidades, monitoramento de sites e indicadores.
import { db, uid, nowIso, logActivity, recordUsage, ensureLead, getSettings } from "./db";
import type { Audit, Business, Check, Contact, Search, SearchResult, Source, Website } from "./types";
import { nominatimGeocode, overpassSearch, buildOverpassQuery, parseOsmElement, formatAddress, describeOpeningHours, type OsmPlace } from "./engine/osm";
import { googleTextSearch, gridCells, type GooglePlace } from "./engine/google";
import { CATEGORY_QUERIES } from "./engine/categories";
import { classifyUrl, normalizeUrl, hostnameOf } from "./engine/classify";
import { computeOpportunity } from "./engine/scoring";
import { dedupeKey, haversineKm, normalizeName, onlyDigits } from "./engine/normalize";
import { LEAD_STATUS } from "./constants";

export interface SearchParams {
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
  source?: SearchSource;
}

const clean = (s: unknown, max = 120) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export type SearchSource = "auto" | "both" | "google" | "osm";

export function googleKey(settingsKey?: string | null): string | null {
  return (settingsKey && settingsKey.trim()) || (import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined) || null;
}

type Candidate = {
  b: Omit<Business, "id" | "created_at" | "updated_at">;
  category: string;
  distance: number;
  contacts: Omit<Contact, "id" | "business_id">[];
  norm: string;
};

const nameNorm = (n: string) => normalizeName(n).replace(/\b(barbearia|restaurante|pizzaria|lanchonete|padaria|clinica|salao|loja|bar|cafe|studio|oficina|academia|pet shop|farmacia|de|da|do|e)\b/g, "").replace(/\s+/g, " ").trim();

/** Mesmo estabelecimento em fontes diferentes: telefone igual, ou nome parecido a menos de 150 m. */
export function sameBusiness(a: { norm: string; lat: number | null; lng: number | null; phone: string | null }, b: { norm: string; lat: number | null; lng: number | null; phone: string | null }) {
  const pa = onlyDigits(a.phone ?? "").slice(-8), pb = onlyDigits(b.phone ?? "").slice(-8);
  if (pa.length === 8 && pa === pb) return true;
  if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) return false;
  if (haversineKm(a.lat, a.lng, b.lat, b.lng) > 0.15) return false;
  if (!a.norm || !b.norm) return false;
  return a.norm === b.norm || a.norm.includes(b.norm) || b.norm.includes(a.norm);
}

/** Completa campos vazios de `base` com os de `extra` (sem sobrescrever dados existentes). */
function fillMissing<T extends Record<string, any>>(base: T, extra: Partial<T>): T {
  const out: any = { ...base };
  for (const [k, v] of Object.entries(extra)) if ((out[k] == null || out[k] === "") && v != null && v !== "") out[k] = v;
  return out;
}

function fromGoogle(g: GooglePlace, category: string, distance: number): Candidate {
  const site = g.website ? normalizeUrl(g.website) : null;
  const kind = classifyUrl(site);
  const contacts: Candidate["contacts"] = [];
  if (g.phone) contacts.push({ type: "phone", value: g.phone, url: `tel:${(g.intl_phone ?? g.phone).replace(/[^\d+]/g, "")}`, source: "google" });
  if (site && kind === "social") contacts.push({ type: /instagram/i.test(site) ? "instagram" : /facebook|fb\./i.test(site) ? "facebook" : "other", value: site, url: site, source: "google" });
  return {
    category, distance, contacts, norm: nameNorm(g.name),
    b: {
      place_id: g.id, dedupe_key: dedupeKey(g.name, g.phone, g.lat, g.lng), name: g.name, category, primary_type: g.primary_type, primary_type_label: g.primary_type_label,
      types: g.types, formatted_address: g.address, street: g.street, street_number: g.number, neighborhood: g.neighborhood, city: g.city, state: g.state,
      postal_code: g.postal_code, country: "Brasil", lat: g.lat, lng: g.lng, phone: g.phone, international_phone: g.intl_phone, google_maps_uri: g.maps_uri, osm_url: null,
      places_website_uri: site, rating: g.rating, user_rating_count: g.rating_count, business_status: g.status, opening_hours: g.hours ? { weekdayDescriptions: g.hours } : null,
      source: "google", digital_status: kind === "own_site" ? "site_pending" : "unknown", primary_website: kind === "own_site" ? site : null, has_own_site: null, site_online: null,
      site_https: null, site_has_location: null, site_mobile_ready: null, has_whatsapp: null, has_instagram: contacts.some((c) => c.type === "instagram") || null,
      has_facebook: contacts.some((c) => c.type === "facebook") || null, has_booking: null, has_menu: null, opportunity_level: null, opportunity_score: null, analyzed_at: null,
    },
  };
}

function fromOsm(pl: OsmPlace, category: string, distance: number, city: string, state: string): Candidate {
  const site = pl.website ? normalizeUrl(pl.website) : null;
  const kind = classifyUrl(site);
  const contacts: Candidate["contacts"] = [];
  if (pl.phone) contacts.push({ type: "phone", value: pl.phone, url: `tel:${pl.phone.replace(/[^\d+]/g, "")}`, source: "openstreetmap" });
  if (pl.whatsapp) { const d = pl.whatsapp.replace(/\D/g, ""); contacts.push({ type: "whatsapp", value: d || pl.whatsapp, url: d.length >= 10 ? `https://wa.me/${d.length <= 11 ? "55" + d : d}` : null, source: "openstreetmap" }); }
  if (pl.instagram) contacts.push({ type: "instagram", value: pl.instagram, url: pl.instagram, source: "openstreetmap" });
  if (pl.facebook) contacts.push({ type: "facebook", value: pl.facebook, url: pl.facebook, source: "openstreetmap" });
  if (pl.email) contacts.push({ type: "email", value: pl.email, url: `mailto:${pl.email}`, source: "openstreetmap" });
  if (site && kind === "social") contacts.push({ type: /instagram/i.test(site) ? "instagram" : /facebook|fb\./i.test(site) ? "facebook" : "other", value: site, url: site, source: "openstreetmap" });
  const weekday = describeOpeningHours(pl.opening_hours);
  return {
    category, distance, contacts, norm: nameNorm(pl.name),
    b: {
      place_id: pl.id, dedupe_key: dedupeKey(pl.name, pl.phone, pl.lat, pl.lng), name: pl.name, category, primary_type: pl.primary_type, primary_type_label: pl.primary_type,
      types: Object.entries(pl.tags).filter(([k]) => ["shop", "amenity", "office", "craft", "tourism", "leisure", "healthcare", "cuisine"].includes(k)).map(([k, v]) => `${k}:${v}`),
      formatted_address: formatAddress(pl, city || null, state || null), street: pl.street, street_number: pl.number, neighborhood: pl.neighborhood,
      city: pl.city ?? (city || null), state: pl.state ?? (state || null), postal_code: pl.postal_code, country: "Brasil", lat: pl.lat, lng: pl.lng,
      phone: pl.phone, international_phone: pl.phone, google_maps_uri: `https://www.google.com/maps/search/?api=1&query=${pl.lat},${pl.lng}`, osm_url: pl.osm_url,
      places_website_uri: site, rating: null, user_rating_count: null, business_status: pl.tags.disused || pl.tags.abandoned ? "CLOSED" : "OPERATIONAL",
      opening_hours: weekday ? { weekdayDescriptions: weekday, osm: pl.opening_hours ?? undefined } : null, source: "openstreetmap",
      digital_status: kind === "own_site" ? "site_pending" : "unknown", primary_website: kind === "own_site" ? site : null, has_own_site: null, site_online: null,
      site_https: null, site_has_location: null, site_mobile_ready: null, has_whatsapp: contacts.some((c) => c.type === "whatsapp") || null,
      has_instagram: contacts.some((c) => c.type === "instagram") || null, has_facebook: contacts.some((c) => c.type === "facebook") || null,
      has_booking: null, has_menu: null, opportunity_level: null, opportunity_score: null, analyzed_at: null,
    },
  };
}

/** Pesquisa real de estabelecimentos (Google Places + OpenStreetMap), com fusão de fontes, deduplicação e criação de leads. */
export async function searchPlaces(p: SearchParams) {
  const city = clean(p.city);
  const state = clean(p.state, 40);
  const country = clean(p.country, 60) || "Brasil";
  const neighborhood = clean(p.neighborhood);
  const custom = clean(p.custom_category, 80);
  const categories = (p.categories ?? []).map((c) => clean(c, 80)).filter(Boolean).slice(0, 15);
  if (custom) categories.push(custom);
  if (!city && !p.center) throw new Error("Informe a cidade ou um ponto central para a pesquisa");
  if (!categories.length) throw new Error("Selecione ao menos uma categoria");
  const maxResults = Math.max(1, Math.min(300, Math.round(Number(p.max_results) || 60)));
  let radiusKm = Math.max(0.5, Math.min(50, Number(p.radius_km) || 10));
  const settings = await getSettings();
  const key = googleKey(settings.google_api_key);
  const source: SearchSource = p.source ?? settings.search_source ?? "auto";
  const useGoogle = !!key && source !== "osm";
  const useOsm = source !== "google" || !key;
  if (source === "google" && !key) throw new Error("Fonte Google selecionada, mas nenhuma chave do Google está configurada (Configurações → Fontes de dados).");

  const search: Search = {
    id: uid(), country, city: city || "Ponto no mapa", state: state || null, neighborhood: neighborhood || null, categories, custom_category: custom || null,
    radius_km: radiusKm, max_results: maxResults, digital_filter: clean(p.digital_filter, 30) || "all", status: "running", total_found: 0, total_new: 0,
    total_analyzed: 0, api_calls: 0, error: null, center_lat: null, center_lng: null, created_at: nowIso(), completed_at: null, batch_job_id: p.batch_job_id ?? null,
  };
  await db.searches.add(search);
  let calls = 0;
  const warnings: string[] = [];
  try {
    let center = p.center && Number.isFinite(p.center.lat) ? p.center : null;
    if (!center) {
      const address = [neighborhood, city, state, country].filter(Boolean).join(", ");
      const g = await nominatimGeocode(address);
      calls++;
      await recordUsage("openstreetmap", "nominatim", !!g);
      if (!g) throw new Error(`Localidade não encontrada: ${address}`);
      center = { lat: g.lat, lng: g.lng };
      if (p.whole_city && g.radiusKm) radiusKm = Math.min(50, Math.max(radiusKm, Math.ceil(g.radiusKm)));
    }
    await db.searches.update(search.id, { center_lat: center.lat, center_lng: center.lng, radius_km: radiusKm });

    const perCategory = Math.ceil(maxResults / categories.length);
    const candidates: Candidate[] = [];
    for (const category of categories) {
      const list: Candidate[] = [];
      if (useGoogle) {
        // Grade de células: o Google devolve no máximo 20 por consulta
        const n = Math.max(1, Math.min(settings.google_max_grid ?? 3, Math.ceil(Math.sqrt(perCategory / 12))));
        const term = CATEGORY_QUERIES[category] ?? category;
        try {
          for (const cell of gridCells(center.lat, center.lng, radiusKm, n)) {
            const res = await googleTextSearch(key!, `${term}${city ? ` em ${[neighborhood, city, state].filter(Boolean).join(", ")}` : ""}`, cell);
            calls++;
            await recordUsage("google", "searchByText");
            for (const g of res) {
              const d = haversineKm(center.lat, center.lng, g.lat, g.lng);
              if (d <= radiusKm * 1.05 && g.status !== "CLOSED_PERMANENTLY") list.push(fromGoogle(g, category, d));
            }
          }
        } catch (e) {
          await recordUsage("google", "searchByText", false);
          if (!useOsm && source === "google") throw e;
          warnings.push((e as Error).message);
        }
      }
      if (useOsm || (useGoogle && warnings.length)) {
        const q = buildOverpassQuery(category, center.lat, center.lng, radiusKm * 1000, Math.min(1000, perCategory * 3));
        try {
          const elements = await overpassSearch(q);
          calls++;
          await recordUsage("openstreetmap", "overpass");
          for (const pl of elements.map(parseOsmElement)) {
            if (!pl) continue;
            const d = haversineKm(center.lat, center.lng, pl.lat, pl.lng);
            if (d <= radiusKm * 1.05) list.push(fromOsm(pl, category, d, city, state));
          }
        } catch (e) {
          await recordUsage("openstreetmap", "overpass", false);
          if (!useGoogle || !list.length) throw e; // com resultados do Google, segue sem o OSM
          warnings.push((e as Error).message);
        }
      }
      // Fusão entre fontes (Google tem prioridade; OSM completa site/redes/WhatsApp)
      const merged: Candidate[] = [];
      for (const c of list.sort((a, b) => (a.b.source === "google" ? 0 : 1) - (b.b.source === "google" ? 0 : 1) || a.distance - b.distance)) {
        const twin = merged.find((m) => m.b.place_id === c.b.place_id || sameBusiness({ ...m.b, norm: m.norm }, { ...c.b, norm: c.norm }));
        if (twin) {
          twin.b = fillMissing(twin.b, { ...c.b, place_id: undefined, source: undefined, dedupe_key: undefined } as any);
          if (c.b.osm_url) twin.b.osm_url = twin.b.osm_url ?? c.b.osm_url;
          for (const ct of c.contacts) if (!twin.contacts.some((x) => x.type === ct.type && x.value === ct.value)) twin.contacts.push(ct);
        } else merged.push(c);
      }
      candidates.push(...merged.sort((a, b) => a.distance - b.distance).slice(0, perCategory));
      if (categories.length > 1) await new Promise((r) => setTimeout(r, 800));
    }

    // Persistência com deduplicação contra a base existente (ID da fonte, chave ou nome parecido próximo)
    const existingAll = (await db.businesses.toArray()).map((x) => ({ x, norm: nameNorm(x.name) }));
    const results: SearchResult[] = [];
    let totalNew = 0;
    await db.transaction("rw", [db.businesses, db.search_results, db.websites, db.contacts, db.leads], async () => {
      for (const f of candidates) {
        const hit = existingAll.find((e) => e.x.place_id === f.b.place_id || e.x.dedupe_key === f.b.dedupe_key || sameBusiness({ ...e.x, norm: e.norm }, { ...f.b, norm: f.norm }));
        let id: string;
        if (hit) {
          id = hit.x.id;
          const pub = { name: f.b.name, formatted_address: f.b.formatted_address, phone: f.b.phone, rating: f.b.rating, user_rating_count: f.b.user_rating_count, opening_hours: f.b.opening_hours, business_status: f.b.business_status };
          const upd = fillMissing(hit.x as any, { ...f.b, place_id: undefined, dedupe_key: undefined } as any);
          // Dados públicos do Google substituem os antigos (são os mais atualizados)
          if (f.b.source === "google") Object.assign(upd, Object.fromEntries(Object.entries(pub).filter(([, v]) => v != null)));
          await db.businesses.put({ ...upd, id, updated_at: nowIso() });
          hit.x = { ...upd, id };
        } else {
          id = uid();
          const row = { ...f.b, id, created_at: nowIso(), updated_at: nowIso() } as Business;
          await db.businesses.add(row);
          existingAll.push({ x: row, norm: f.norm });
          totalNew++;
          await ensureLead(id, "nao_analisado");
        }
        if (!(await db.search_results.where("[search_id+business_id]").equals([search.id, id]).first())) {
          const r: SearchResult = { id: uid(), search_id: search.id, business_id: id, category: f.category, was_new: !hit, distance_km: Math.round(f.distance * 100) / 100, created_at: nowIso() };
          await db.search_results.add(r);
          results.push(r);
        }
        for (const c of f.contacts) {
          if (!(await db.contacts.where("[business_id+type+value]").equals([id, c.type, c.value]).first())) await db.contacts.add({ ...c, id: uid(), business_id: id });
        }
        if (f.b.places_website_uri && !(await db.websites.where("[business_id+url]").equals([id, f.b.places_website_uri]).first())) {
          const kind = classifyUrl(f.b.places_website_uri);
          await db.websites.add({ id: uid(), business_id: id, url: f.b.places_website_uri, final_url: null, domain: hostnameOf(f.b.places_website_uri), kind, source: f.b.source,
            verified: true, verification_note: f.b.source === "google" ? "Informado no perfil do Google" : "Informado no cadastro do OpenStreetMap",
            is_primary: kind === "own_site" && !(await db.websites.where("business_id").equals(id).filter((w) => w.is_primary).count()), is_online: null, https: null, last_checked_at: null, error: null });
        }
      }
    });
    await db.searches.update(search.id, { status: "completed", total_found: results.length, total_new: totalNew, api_calls: calls, completed_at: nowIso(), error: warnings.length ? warnings[0] : null });
    await logActivity("search.completed", { type: "search", id: search.id }, { city, categories, found: results.length, new: totalNew, sources: [useGoogle && "google", useOsm && "osm"].filter(Boolean) });
    return { search: { ...search, total_found: results.length }, business_ids: results.map((r) => r.business_id), found: results.length, new: totalNew, warnings };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.searches.update(search.id, { status: "failed", error: msg.slice(0, 500), api_calls: calls, completed_at: nowIso() });
    await logActivity("search.failed", { type: "search", id: search.id }, { error: msg }, "error");
    throw e;
  }
}

/**
 * Testa se um site responde, a partir do navegador.
 * O navegador não permite ler o conteúdo de outros sites (CORS), mas uma requisição "no-cors"
 * confirma que o servidor respondeu. Páginas HTTPS não podem chamar endereços HTTP, por isso
 * o teste é feito sempre em HTTPS.
 */
export async function probeSite(rawUrl: string): Promise<{ https_ok: boolean; ms: number; error?: string }> {
  const started = performance.now();
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { https_ok: false, ms: 0, error: "URL inválida" }; }
  url.protocol = "https:";
  try {
    await fetch(url.toString(), { mode: "no-cors", cache: "no-store", redirect: "follow", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(12_000) });
    return { https_ok: true, ms: Math.round(performance.now() - started) };
  } catch (e) {
    return { https_ok: false, ms: Math.round(performance.now() - started), error: (e as Error).name === "TimeoutError" ? "Tempo limite excedido" : "Sem resposta em HTTPS" };
  }
}

const CONTENT_CHECKS = ["mobile_viewport", "address", "embedded_map", "maps_link", "directions_button", "whatsapp", "contact_form", "digital_menu", "online_booking", "services", "gallery", "social_links", "opening_hours"];
export const MANUAL_CHECKS: { key: string; label: string }[] = [
  { key: "mobile_viewport", label: "Abre bem no celular" },
  { key: "address", label: "Mostra o endereço físico" },
  { key: "embedded_map", label: "Tem mapa incorporado" },
  { key: "directions_button", label: "Tem botão \"como chegar\"" },
  { key: "whatsapp", label: "Tem botão de WhatsApp" },
  { key: "contact_form", label: "Tem formulário de contato" },
  { key: "services", label: "Apresenta os serviços/produtos" },
  { key: "gallery", label: "Tem galeria de fotos" },
  { key: "digital_menu", label: "Tem cardápio digital" },
  { key: "online_booking", label: "Tem agendamento online" },
  { key: "opening_hours", label: "Mostra horário de funcionamento" },
  { key: "social_links", label: "Tem links para redes sociais" },
];

/** Investigação de presença digital + pontuação. `manual` sobrescreve verificações de conteúdo feitas pelo usuário. */
export async function auditBusiness(businessId: string, manual?: Record<string, boolean | null>) {
  const started = performance.now();
  const biz = await db.businesses.get(businessId);
  if (!biz) throw new Error("Estabelecimento não encontrado");
  const settings = await getSettings();
  const sourceName = biz.source === "google" ? "Google" : biz.source === "openstreetmap" ? "OpenStreetMap" : "Cadastro manual";
  const sources: Source[] = [{ name: sourceName, url: (biz.source === "google" ? biz.google_maps_uri : biz.osm_url) ?? undefined, type: "places", result: biz.places_website_uri ? `Site informado: ${biz.places_website_uri}` : "Nenhum site informado no cadastro", at: biz.updated_at }];
  const websites = await db.websites.where("business_id").equals(businessId).toArray();
  let own = websites.find((w) => w.kind === "own_site" && w.is_primary) ?? websites.find((w) => w.kind === "own_site");
  const previous = (await db.audits.where("business_id").equals(businessId).sortBy("created_at")).pop();

  const checks: Record<string, Check> = {};
  if (own) {
    const probe = await probeSite(own.url);
    await recordUsage("site_check", "probe", probe.https_ok);
    sources.push({ name: "Teste de disponibilidade (navegador)", url: own.url, type: "website", result: probe.https_ok ? `Respondeu em HTTPS (${probe.ms} ms)` : `${probe.error}`, at: nowIso() });
    const updated: Partial<Website> = { https: probe.https_ok, is_online: probe.https_ok ? true : null, last_checked_at: nowIso(), error: probe.error ?? null };
    await db.websites.update(own.id, updated);
    own = { ...own, ...updated } as Website;
    checks.own_site = { value: true, evidence: own.url };
    checks.site_online = { value: probe.https_ok ? true : null, evidence: probe.https_ok ? "Servidor respondeu" : "Não confirmado (sem resposta em HTTPS)" };
    checks.https = { value: probe.https_ok, evidence: probe.https_ok ? "Respondeu com conexão segura" : "Não respondeu em HTTPS" };
  } else {
    checks.own_site = { value: false, evidence: `Não identificado no ${sourceName}` };
  }

  // Verificações de conteúdo: manuais (persistem entre reanálises) ou não verificadas
  const manualPrev = Object.fromEntries(Object.entries(previous?.checks ?? {}).filter(([, c]) => c.manual).map(([k, c]) => [k, c.value]));
  const manualAll = { ...manualPrev, ...(manual ?? {}) };
  if (own) {
    for (const k of CONTENT_CHECKS) {
      const v = manualAll[k];
      checks[k] = v === true || v === false ? { value: v, evidence: "Verificado manualmente", manual: true } : { value: null, evidence: "Não verificado — use o checklist" };
    }
  }
  const contacts = await db.contacts.where("business_id").equals(businessId).toArray();
  const types = new Set(contacts.map((c) => c.type));
  if (biz.phone) checks.phone_places = { value: true, evidence: biz.phone };
  if (biz.opening_hours) checks.hours_places = { value: true, evidence: `Horário publicado no ${sourceName}` };
  if (types.has("whatsapp") && checks.whatsapp?.value !== true) checks.whatsapp_places = { value: true, evidence: `WhatsApp informado no ${sourceName}` };
  if (own?.domain) {
    const shared = await db.websites.where("domain").equals(own.domain).filter((w) => w.business_id !== businessId && w.kind === "own_site").count();
    checks.shared_domain = { value: shared > 0, evidence: shared ? `Domínio usado por mais ${shared} estabelecimento(s)` : undefined };
  }
  const contentVerified = own ? CONTENT_CHECKS.some((k) => checks[k]?.manual) : true;

  const result = computeOpportunity({
    category: biz.category, primaryType: biz.primary_type, investigated: true, webSearchUsed: false,
    ownSite: own ? { url: own.url, online: own.is_online, https: own.https } : null,
    otherPresence: websites.filter((w) => w.kind !== "own_site" && w.kind !== "unknown").map((w) => ({ kind: w.kind as "social" | "directory" | "marketplace", url: w.url }))
      .concat(contacts.filter((c) => c.type === "instagram" || c.type === "facebook").map((c) => ({ kind: "social" as const, url: c.value }))),
    checks, hasPhone: !!biz.phone, rating: biz.rating, ratingCount: biz.user_rating_count, sourceName, contentVerified,
  });
  if (!own) result.reasons.push({ kind: "fact", text: `Status baseado no cadastro do ${sourceName}. Se encontrar um site, adicione-o na ficha para reanalisar.`, weight: 0 });

  const audit: Audit = { id: uid(), business_id: businessId, status: own && !contentVerified ? "partial" : "completed", website_url: own?.url ?? null,
    website_kind: own ? "own_site" : (websites.find((w) => w.kind !== "unknown")?.kind ?? "unknown"), checks, sources, duration_ms: Math.round(performance.now() - started), error: null, created_at: nowIso() };
  await db.audits.add(audit);
  await db.opportunities.put({ business_id: businessId, level: result.level, score: result.score, reasons: result.reasons, suggested_products: result.products, updated_at: nowIso() });
  const has = (k: string) => (checks[k]?.value === true ? true : checks[k]?.value === false ? false : null);
  await db.businesses.update(businessId, {
    digital_status: result.status, primary_website: own?.url ?? null, has_own_site: !!own, site_online: own ? own.is_online : null, site_https: own ? own.https : null,
    site_has_location: own ? (has("address") || has("embedded_map") || has("maps_link")) : null, site_mobile_ready: own ? has("mobile_viewport") : null,
    has_whatsapp: types.has("whatsapp") || has("whatsapp") === true ? true : has("whatsapp"), has_instagram: types.has("instagram") ? true : null,
    has_facebook: types.has("facebook") ? true : null, has_booking: has("online_booking"), has_menu: has("digital_menu"),
    opportunity_level: result.level, opportunity_score: result.score, analyzed_at: nowIso(), updated_at: nowIso(),
  });
  const lead = await ensureLead(businessId);
  const next = result.level === "baixa" ? "analisado" : "oportunidade";
  if (["novo", "nao_analisado", "analisado", "oportunidade"].includes(lead.status) && lead.status !== next) {
    const { updateLead } = await import("./db");
    await updateLead(lead.id, { status: next });
  }
  if (result.score >= settings.alert_min_score) await logActivity("opportunity.alert", { type: "business", id: businessId }, { name: biz.name, score: result.score, level: result.level }, "alert");
  await logActivity("audit.completed", { type: "business", id: businessId }, { name: biz.name, score: result.score, status: result.status });
  return { audit, opportunity: result, status: result.status };
}

/** Adiciona/atualiza manualmente o site de um estabelecimento (ex.: encontrado pelo vendedor). */
export async function setBusinessWebsite(businessId: string, rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new Error("URL inválida");
  const kind = classifyUrl(url);
  const existing = await db.websites.where("[business_id+url]").equals([businessId, url]).first();
  if (kind === "own_site") await db.websites.where("business_id").equals(businessId).modify({ is_primary: false });
  if (existing) await db.websites.update(existing.id, { kind, is_primary: kind === "own_site" });
  else await db.websites.add({ id: uid(), business_id: businessId, url, final_url: null, domain: hostnameOf(url), kind, source: "manual", verified: true,
    verification_note: "Adicionado manualmente", is_primary: kind === "own_site", is_online: null, https: null, last_checked_at: null, error: null });
  if (kind === "social") {
    const type = /instagram/i.test(url) ? "instagram" : /facebook|fb\./i.test(url) ? "facebook" : "other";
    if (!(await db.contacts.where("[business_id+type+value]").equals([businessId, type, url]).first())) await db.contacts.add({ id: uid(), business_id: businessId, type, value: url, url, source: "manual" });
  }
  return kind;
}

/** Verificação periódica de disponibilidade dos sites (executada pelo navegador). */
export async function monitorSites(limit = 50) {
  const sites = (await db.websites.where("kind").equals("own_site").toArray()).sort((a, b) => (a.last_checked_at ?? "").localeCompare(b.last_checked_at ?? "")).slice(0, limit);
  let offline = 0, changed = 0;
  for (const s of sites) {
    const r = await probeSite(s.url);
    const was = s.https;
    if (was !== null && was !== r.https_ok) {
      changed++;
      const biz = await db.businesses.get(s.business_id);
      await logActivity(r.https_ok ? "site.back_online" : "site.went_offline", { type: "business", id: s.business_id }, { name: biz?.name, url: s.url }, r.https_ok ? "info" : "alert");
    }
    if (!r.https_ok) offline++;
    await db.websites.update(s.id, { https: r.https_ok, is_online: r.https_ok ? true : null, last_checked_at: nowIso(), error: r.error ?? null });
    await db.businesses.update(s.business_id, { site_https: r.https_ok, site_online: r.https_ok ? true : null, ...(r.https_ok ? {} : { digital_status: "site_issues" as const }) });
  }
  return { checked: sites.length, offline, changed };
}

export async function dashboardStats() {
  const b = await db.businesses.toArray();
  const leads = await db.leads.toArray();
  const proposals = await db.proposals.toArray();
  const searches = await db.searches.toArray();
  const count = (f: (x: Business) => boolean) => b.filter(f).length;
  const group = (key: (x: Business) => string) => {
    const m = new Map<string, number>();
    b.forEach((x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1));
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([name, value]) => ({ name, value }));
  };
  const since = Date.now() - 30 * 86400_000;
  const timeline = new Map<string, { searches: number; found: number }>();
  searches.filter((s) => new Date(s.created_at).getTime() > since).forEach((s) => {
    const d = s.created_at.slice(0, 10);
    const t = timeline.get(d) ?? { searches: 0, found: 0 };
    t.searches++; t.found += s.total_found;
    timeline.set(d, t);
  });
  const contacted = ["primeiro_contato", "aguardando", "proposta_enviada", "negociacao", "fechado", "perdido"];
  return {
    total: b.length,
    with_site: count((x) => x.has_own_site === true),
    without_site: count((x) => x.digital_status === "no_site"),
    not_verified: count((x) => x.has_own_site === null),
    sites_offline: count((x) => x.has_own_site === true && x.site_https === false),
    sites_no_location: count((x) => x.has_own_site === true && x.site_has_location === false),
    with_instagram: count((x) => x.has_instagram === true),
    with_whatsapp: count((x) => x.has_whatsapp === true),
    with_booking: count((x) => x.has_booking === true),
    with_menu: count((x) => x.has_menu === true),
    opportunities: count((x) => x.opportunity_level === "alta" || x.opportunity_level === "media"),
    opp_alta: count((x) => x.opportunity_level === "alta"),
    opp_media: count((x) => x.opportunity_level === "media"),
    opp_baixa: count((x) => x.opportunity_level === "baixa"),
    analyzed: count((x) => !!x.analyzed_at),
    leads_total: leads.length,
    leads_contacted: leads.filter((l) => contacted.includes(l.status)).length,
    proposals_sent: proposals.filter((p) => p.status !== "draft").length,
    clients_won: leads.filter((l) => l.status === "fechado").length,
    pipeline_value: leads.filter((l) => l.status !== "fechado" && l.status !== "perdido").reduce((n, l) => n + (l.potential_value ?? 0), 0),
    won_value: leads.filter((l) => l.status === "fechado").reduce((n, l) => n + (l.potential_value ?? 0), 0),
    by_category: group((x) => x.category ?? "Outros"),
    by_city: group((x) => x.city ?? "—"),
    lead_funnel: Object.fromEntries(LEAD_STATUS.map((s) => [s.key, leads.filter((l) => l.status === s.key).length])),
    searches_timeline: [...timeline.entries()].sort().map(([date, v]) => ({ date, ...v })),
  };
}

export async function duplicateWebsites() {
  const sites = await db.websites.where("kind").equals("own_site").toArray();
  const m = new Map<string, Set<string>>();
  sites.forEach((s) => s.domain && m.set(s.domain, (m.get(s.domain) ?? new Set()).add(s.business_id)));
  const out: { domain: string; businesses: number; names: string[] }[] = [];
  for (const [domain, ids] of m) {
    if (ids.size > 1) {
      const names = (await db.businesses.bulkGet([...ids])).filter(Boolean).map((b) => b!.name);
      out.push({ domain, businesses: ids.size, names });
    }
  }
  return out.sort((a, b) => b.businesses - a.businesses);
}

/** Leads com o estabelecimento embutido (equivalente ao join do banco). */
export async function leadsWithBusiness() {
  const leads = await db.leads.toArray();
  const biz = await db.businesses.bulkGet(leads.map((l) => l.business_id));
  return leads.map((l, i) => ({ ...l, businesses: biz[i] })).filter((l) => l.businesses)
    .sort((a, b) => a.position - b.position || b.updated_at.localeCompare(a.updated_at));
}
