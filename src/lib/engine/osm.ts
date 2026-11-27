// Fonte GRATUITA de estabelecimentos: OpenStreetMap (Overpass API) + geocodificação Nominatim.
// Chamadas feitas direto do navegador (as duas APIs liberam CORS). Sem chave e sem cartão.
// Políticas de uso respeitadas: no máximo 1 req/s no Nominatim, consultas Overpass com timeout e limite.

export class SourceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const NOMINATIM = "https://nominatim.openstreetmap.org";
// Servidores públicos com CORS; o primeiro que responder é usado.
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

// Mapeamento das categorias do RADAR para tags do OpenStreetMap (filtros Overpass QL).
export const OSM_CATEGORY_FILTERS: Record<string, string[]> = {
  "Barbearias": ['["shop"="hairdresser"]["hairdresser"~"barber|men",i]', '["shop"="barber"]', '["shop"="hairdresser"]["name"~"barb",i]'],
  "Salões de beleza": ['["shop"="hairdresser"]', '["shop"="beauty"]', '["shop"="cosmetics"]["beauty"]'],
  "Restaurantes": ['["amenity"="restaurant"]'],
  "Pizzarias": ['["amenity"~"restaurant|fast_food"]["cuisine"~"pizza",i]', '["amenity"~"restaurant|fast_food"]["name"~"pizz",i]'],
  "Lanchonetes": ['["amenity"="fast_food"]', '["amenity"="cafe"]["name"~"lanch",i]'],
  "Hamburguerias": ['["amenity"~"restaurant|fast_food"]["cuisine"~"burger",i]', '["amenity"~"restaurant|fast_food"]["name"~"burger|hamburg",i]'],
  "Padarias": ['["shop"="bakery"]', '["shop"="pastry"]'],
  "Açougues": ['["shop"="butcher"]'],
  "Mercados": ['["shop"~"convenience|greengrocer|general|grocery"]'],
  "Supermercados": ['["shop"="supermarket"]'],
  "Oficinas mecânicas": ['["shop"="car_repair"]', '["craft"="mechanic"]'],
  "Autoelétricas": ['["shop"="car_repair"]["name"~"el[eé]tric",i]', '["shop"="car_repair"]["car_repair"~"electrical",i]'],
  "Lava-rápidos": ['["amenity"="car_wash"]'],
  "Borracharias": ['["shop"="tyres"]', '["shop"="car_repair"]["name"~"borrach",i]'],
  "Lojas de roupas": ['["shop"~"clothes|boutique|fashion"]'],
  "Lojas de calçados": ['["shop"="shoes"]'],
  "Lojas de materiais de construção": ['["shop"~"hardware|doityourself|building_materials|trade"]'],
  "Clínicas médicas": ['["amenity"~"clinic|doctors"]', '["healthcare"~"clinic|doctor"]'],
  "Clínicas odontológicas": ['["amenity"="dentist"]', '["healthcare"="dentist"]'],
  "Clínicas veterinárias": ['["amenity"="veterinary"]'],
  "Pet shops": ['["shop"="pet"]', '["shop"="pet_grooming"]'],
  "Farmácias": ['["amenity"="pharmacy"]', '["healthcare"="pharmacy"]'],
  "Academias": ['["leisure"="fitness_centre"]', '["sport"="fitness"]["name"]'],
  "Hotéis": ['["tourism"="hotel"]', '["tourism"="motel"]'],
  "Pousadas": ['["tourism"~"guest_house|hostel|chalet"]'],
  "Imobiliárias": ['["office"="estate_agent"]', '["shop"="estate_agent"]'],
  "Escritórios de contabilidade": ['["office"~"accountant|tax_advisor"]'],
  "Advogados": ['["office"="lawyer"]'],
  "Escolas": ['["amenity"~"school|kindergarten"]'],
  "Cursos profissionalizantes": ['["amenity"~"college|training|language_school|driving_school"]', '["office"="educational_institution"]'],
  "Concessionárias": ['["shop"~"car|motorcycle"]'],
  "Assistências técnicas": ['["shop"~"electronics_repair|mobile_phone|computer|electronics"]', '["craft"~"electronics_repair|electrician"]'],
  "Empresas agrícolas": ['["shop"~"agrarian|farm"]', '["office"="agricultural"]'],
  "Prestadores de serviços": ['["craft"]', '["office"="company"]'],
};

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OsmPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  email: string | null;
  opening_hours: string | null;
  primary_type: string | null;
  osm_url: string;
  tags: Record<string, string>;
}

function escapeRegex(s: string) {
  return s.replace(/[\\"^$.*+?()[\]{}|]/g, "");
}

export function filtersFor(category: string): string[] {
  const f = OSM_CATEGORY_FILTERS[category];
  if (f) return f;
  // Categoria personalizada: busca por nome (sem acentos e com regex segura)
  const term = escapeRegex(category.trim()).slice(0, 60);
  return term ? [`["name"~"${term}",i]["shop"]`, `["name"~"${term}",i]["amenity"]`, `["name"~"${term}",i]["office"]`, `["name"~"${term}",i]["craft"]`] : [];
}

/** Caixa delimitadora (sul, oeste, norte, leste) que contém o círculo de busca. */
export function bboxAround(lat: number, lng: number, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [lat - dLat, lng - dLng, lat + dLat, lng + dLng];
}

/**
 * Consulta Overpass por caixa delimitadora (bem mais leve para o servidor que "around");
 * o recorte exato pelo raio é feito depois, no navegador.
 */
export function buildOverpassQuery(category: string, lat: number, lng: number, radiusM: number, limit: number): string {
  const r = Math.min(50000, Math.max(100, radiusM));
  const [s, w, n, e] = bboxAround(lat, lng, r).map((v) => v.toFixed(5));
  const parts = filtersFor(category).map((f) => `nwr${f}["name"];`).join("\n  ");
  return `[out:json][timeout:25][bbox:${s},${w},${n},${e}];\n(\n  ${parts}\n);\nout center tags ${Math.max(1, Math.min(1000, limit))};`;
}

const clean = (v?: string) => (v && v.trim() ? v.trim() : null);
const firstOf = (t: Record<string, string>, keys: string[]) => {
  for (const k of keys) if (clean(t[k])) return clean(t[k]);
  return null;
};

function normalizeSocial(v: string | null, base: string): string | null {
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "").replace(/^(www\.)?(instagram|facebook)\.com\//i, "");
  return `${base}${handle}`;
}

export function parseOsmElement(e: OsmElement): OsmPlace | null {
  const t = e.tags ?? {};
  const name = clean(t.name) ?? clean(t.brand);
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!name || lat == null || lng == null) return null;
  let website = firstOf(t, ["website", "contact:website", "url", "brand:website"]);
  if (website && !/^https?:\/\//i.test(website)) website = "http://" + website;
  return {
    id: `osm:${e.type}/${e.id}`,
    name,
    lat,
    lng,
    street: firstOf(t, ["addr:street", "addr:place"]),
    number: clean(t["addr:housenumber"]),
    neighborhood: firstOf(t, ["addr:suburb", "addr:neighbourhood", "addr:district", "addr:quarter"]),
    city: firstOf(t, ["addr:city", "addr:municipality", "is_in:city"]),
    state: firstOf(t, ["addr:state"]),
    postal_code: clean(t["addr:postcode"]),
    phone: firstOf(t, ["phone", "contact:phone", "contact:mobile", "mobile"])?.split(/[;,]/)[0].trim() ?? null,
    whatsapp: firstOf(t, ["contact:whatsapp", "whatsapp"]),
    website,
    instagram: normalizeSocial(firstOf(t, ["contact:instagram", "instagram"]), "https://www.instagram.com/"),
    facebook: normalizeSocial(firstOf(t, ["contact:facebook", "facebook"]), "https://www.facebook.com/"),
    email: firstOf(t, ["email", "contact:email"]),
    opening_hours: clean(t.opening_hours),
    primary_type: firstOf(t, ["shop", "amenity", "office", "craft", "tourism", "leisure", "healthcare"]),
    osm_url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    tags: t,
  };
}

export function formatAddress(p: OsmPlace, fallbackCity?: string | null, fallbackState?: string | null): string | null {
  const line1 = [p.street, p.number].filter(Boolean).join(", ");
  const city = p.city ?? fallbackCity;
  const parts = [line1 || null, p.neighborhood, [city, p.state ?? fallbackState].filter(Boolean).join(" - ") || null, p.postal_code].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Traduz o formato opening_hours do OSM para texto legível (sem inventar horários). */
export function describeOpeningHours(oh: string | null): string[] | null {
  if (!oh) return null;
  const days: Record<string, string> = { Mo: "seg", Tu: "ter", We: "qua", Th: "qui", Fr: "sex", Sa: "sáb", Su: "dom", PH: "feriados" };
  return oh.split(";").map((s) => s.trim()).filter(Boolean).map((s) =>
    s.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => days[d]).replace(/\boff\b/g, "fechado").replace(/24\/7/, "24 horas, todos os dias"),
  );
}

let lastNominatim = 0;

export async function nominatimGeocode(query: string): Promise<{ lat: number; lng: number; radiusKm: number | null; city: string | null; state: string | null } | null> {
  const wait = 1100 - (Date.now() - lastNominatim);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("accept-language", "pt-BR");
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new SourceError(503, `Não foi possível conectar ao OpenStreetMap (Nominatim): ${(e as Error).name === "TimeoutError" ? "tempo limite excedido" : (e as Error).message}. Tente novamente em instantes.`);
  }
  if (res.status === 429) throw new SourceError(429, "Nominatim (OpenStreetMap) limitou as requisições. Aguarde um minuto e tente novamente.");
  if (!res.ok) throw new SourceError(502, `Nominatim respondeu HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.[0];
  if (!r) return null;
  let radiusKm: number | null = null;
  if (Array.isArray(r.boundingbox)) {
    const [s, n, w, e] = r.boundingbox.map(Number);
    const dLat = (n - s) * 111.32;
    const dLng = (e - w) * 111.32 * Math.cos((Number(r.lat) * Math.PI) / 180);
    radiusKm = Math.sqrt(dLat ** 2 + dLng ** 2) / 2;
  }
  const a = r.address ?? {};
  const iso = String(a["ISO3166-2-lvl4"] ?? "");
  return {
    lat: Number(r.lat),
    lng: Number(r.lon),
    radiusKm,
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? null,
    state: iso.startsWith("BR-") ? iso.slice(3) : (a.state ?? null),
  };
}

export async function overpassSearch(query: string): Promise<OsmElement[]> {
  let lastErr = "";
  for (const endpoint of OVERPASS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status === 504) { lastErr = `HTTP ${res.status} (servidor ocupado)`; await new Promise((r) => setTimeout(r, 2000)); continue; }
      if (!res.ok) { lastErr = `HTTP ${res.status}`; continue; }
      const data = await res.json();
      return (data.elements ?? []) as OsmElement[];
    } catch (e) {
      lastErr = (e as Error).name === "TimeoutError" ? "tempo limite excedido" : String((e as Error).message);
    }
  }
  throw new SourceError(503, `Os servidores gratuitos do OpenStreetMap estão ocupados (${lastErr}). A fila tentará de novo automaticamente.`);
}
