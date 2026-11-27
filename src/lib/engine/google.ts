// Fonte Google Places (a mais completa: comércios, notas, avaliações, telefone e site).
// Usa a Maps JavaScript API (biblioteca "places") direto no navegador. A chave é de navegador e deve
// ser RESTRITA por domínio (referenciador HTTP) e por API no Google Cloud, com cotas diárias definidas.
import { SourceError } from "./osm";

const FIELDS = [
  "id", "displayName", "formattedAddress", "addressComponents", "location", "types", "primaryType", "primaryTypeDisplayName",
  "nationalPhoneNumber", "internationalPhoneNumber", "websiteURI", "googleMapsURI", "rating", "userRatingCount", "businessStatus", "regularOpeningHours",
];

export interface GooglePlace {
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
  intl_phone: string | null;
  website: string | null;
  maps_uri: string | null;
  rating: number | null;
  rating_count: number | null;
  status: string | null;
  hours: string[] | null;
  primary_type: string | null;
  primary_type_label: string | null;
  types: string[];
}

let loading: Promise<any> | null = null;

/** Carrega a Maps JavaScript API uma única vez e devolve a classe Place. */
export async function loadPlaces(key: string): Promise<any> {
  const g = (globalThis as any).google;
  // A Maps API só pode ser carregada uma vez por página; se já estiver carregada, reutiliza.
  if (g?.maps?.importLibrary) return (await g.maps.importLibrary("places")).Place;
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const cb = `__radarGmaps${Date.now()}`;
      (globalThis as any)[cb] = () => resolve(true);
      (globalThis as any).gm_authFailure = () => reject(new SourceError(401, "Chave do Google recusada. Verifique se a Maps JavaScript API e a Places API (New) estão ativadas e se o domínio do site está liberado na restrição da chave."));
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&language=pt-BR&region=BR&callback=${cb}`;
      s.async = true;
      s.onerror = () => reject(new SourceError(503, "Não foi possível carregar o Google Maps."));
      document.head.appendChild(s);
    });
  }
  await loading;
  return (await (globalThis as any).google.maps.importLibrary("places")).Place;
}

const comp = (p: any, type: string, short = false) => {
  const c = (p.addressComponents ?? []).find((x: any) => x.types?.includes(type));
  return c ? (short ? c.shortText : c.longText) ?? null : null;
};

export function parseGooglePlace(p: any): GooglePlace | null {
  const lat = typeof p.location?.lat === "function" ? p.location.lat() : p.location?.lat;
  const lng = typeof p.location?.lng === "function" ? p.location.lng() : p.location?.lng;
  const name = typeof p.displayName === "string" ? p.displayName : p.displayName?.text;
  if (!p.id || !name || lat == null || lng == null) return null;
  return {
    id: `google:${p.id}`, name, lat, lng,
    address: p.formattedAddress ?? null,
    street: comp(p, "route"), number: comp(p, "street_number"),
    neighborhood: comp(p, "sublocality_level_1") ?? comp(p, "sublocality") ?? comp(p, "neighborhood"),
    city: comp(p, "administrative_area_level_2") ?? comp(p, "locality"),
    state: comp(p, "administrative_area_level_1", true),
    postal_code: comp(p, "postal_code"),
    phone: p.nationalPhoneNumber ?? null, intl_phone: p.internationalPhoneNumber ?? null,
    website: p.websiteURI ?? null, maps_uri: p.googleMapsURI ?? null,
    rating: p.rating ?? null, rating_count: p.userRatingCount ?? null,
    status: p.businessStatus ?? null,
    hours: p.regularOpeningHours?.weekdayDescriptions ?? null,
    primary_type: p.primaryType ?? null, primary_type_label: p.primaryTypeDisplayName ?? null,
    types: p.types ?? [],
  };
}

/** Divide a área em células para contornar o limite de 20 resultados por consulta do Google. */
export function gridCells(lat: number, lng: number, radiusKm: number, n: number) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const cells: { south: number; west: number; north: number; east: number }[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const south = lat - dLat + (2 * dLat * i) / n, west = lng - dLng + (2 * dLng * j) / n;
    cells.push({ south, west, north: south + (2 * dLat) / n, east: west + (2 * dLng) / n });
  }
  return cells;
}

export async function googleTextSearch(key: string, query: string, bounds: { south: number; west: number; north: number; east: number }): Promise<GooglePlace[]> {
  const Place = await loadPlaces(key);
  try {
    const { places } = await Place.searchByText({ textQuery: query, fields: FIELDS, locationRestriction: bounds, maxResultCount: 20, language: "pt-BR", region: "br" });
    return (places ?? []).map(parseGooglePlace).filter((x: GooglePlace | null): x is GooglePlace => !!x);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/OVER_QUERY_LIMIT|quota|RESOURCE_EXHAUSTED|429/i.test(msg)) throw new SourceError(429, "Limite de uso do Google atingido (cota). A pesquisa continuará só com o OpenStreetMap.");
    if (/REQUEST_DENIED|API key|not authorized|PERMISSION_DENIED|403/i.test(msg)) throw new SourceError(401, "Chave do Google sem permissão para a Places API (New) ou para este domínio.");
    throw new SourceError(503, "Erro no Google Places: " + msg.slice(0, 200));
  }
}
