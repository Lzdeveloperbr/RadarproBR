// Fonte TomTom Search API (POI Search): base comercial de estabelecimentos, plano gratuito sem cartão.
// Chamada direto do navegador (a API libera CORS). A chave é pública no site: limite-a no painel da TomTom.
import { SourceError } from "./osm";

export interface TomTomPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  categories: string[];
}

export function parseTomTomResult(r: any): TomTomPlace | null {
  const poi = r?.poi;
  const lat = r?.position?.lat, lng = r?.position?.lon;
  if (!poi?.name || lat == null || lng == null || !r.id) return null;
  const a = r.address ?? {};
  let website: string | null = poi.url ?? null;
  if (website && !/^https?:\/\//i.test(website)) website = "http://" + website;
  return {
    id: `tomtom:${r.id}`,
    name: poi.name,
    lat, lng,
    address: a.freeformAddress ?? null,
    street: a.streetName ?? null,
    number: a.streetNumber ?? null,
    neighborhood: a.municipalitySubdivision ?? null,
    city: a.municipality ?? null,
    state: a.countrySubdivisionCode ?? a.countrySubdivision ?? null,
    postal_code: a.postalCode ?? a.extendedPostalCode ?? null,
    phone: poi.phone ?? null,
    website,
    category: poi.categories?.[0] ?? poi.classifications?.[0]?.names?.[0]?.name ?? null,
    categories: poi.categories ?? [],
  };
}

/** Busca de POIs num raio. Pagina de 100 em 100 até `limit`. */
export async function tomtomPoiSearch(key: string, query: string, lat: number, lng: number, radiusM: number, limit: number): Promise<TomTomPlace[]> {
  const out: TomTomPlace[] = [];
  const target = Math.max(1, Math.min(300, limit));
  for (let ofs = 0; ofs < target; ofs += 100) {
    const url = new URL(`https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent(query)}.json`);
    url.searchParams.set("key", key);
    url.searchParams.set("lat", lat.toFixed(6));
    url.searchParams.set("lon", lng.toFixed(6));
    url.searchParams.set("radius", String(Math.round(Math.min(50000, Math.max(100, radiusM)))));
    url.searchParams.set("limit", String(Math.min(100, target - ofs)));
    url.searchParams.set("ofs", String(ofs));
    url.searchParams.set("countrySet", "BR");
    url.searchParams.set("language", "pt-BR");
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      throw new SourceError(503, "Não foi possível conectar à TomTom: " + (e as Error).message);
    }
    if (res.status === 403 || res.status === 401) throw new SourceError(401, "Chave da TomTom inválida ou sem permissão para a Search API.");
    if (res.status === 429) throw new SourceError(429, "Limite gratuito da TomTom atingido (cota). A pesquisa continua pelas outras fontes.");
    if (!res.ok) throw new SourceError(502, `TomTom respondeu HTTP ${res.status}`);
    const data = await res.json();
    const page = (data.results ?? []).map(parseTomTomResult).filter((x: TomTomPlace | null): x is TomTomPlace => !!x);
    out.push(...page);
    const total = data.summary?.totalResults ?? 0;
    if (page.length < 100 || ofs + 100 >= total) break;
  }
  return out;
}
