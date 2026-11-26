// Integração com Google Places API (New) — Text Search — e Geocoding API.
import { HttpError, env } from "./http.ts";

export const PLACES_FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents", "places.location",
  "places.types", "places.primaryType", "places.primaryTypeDisplayName", "places.nationalPhoneNumber",
  "places.internationalPhoneNumber", "places.websiteUri", "places.googleMapsUri", "places.rating",
  "places.userRatingCount", "places.businessStatus", "places.regularOpeningHours", "places.priceLevel", "nextPageToken",
].join(",");

export interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[]; openNow?: boolean };
  priceLevel?: string;
}

export function googleKey(): string {
  const k = env("GOOGLE_MAPS_API_KEY") ?? env("GOOGLE_PLACES_API_KEY");
  if (!k) throw new HttpError(412, "Integração Google Places não configurada. Defina o segredo GOOGLE_MAPS_API_KEY nas Edge Functions (veja a página Integrações).", "missing_google_key");
  return k;
}

export async function geocode(address: string): Promise<{ lat: number; lng: number; formatted: string; viewportKm: number | null; components: any[] } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", googleKey());
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("region", "br");
  let data: any;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    data = await res.json();
  } catch (e) {
    throw new HttpError(503, `Não foi possível conectar à Geocoding API: ${(e as Error).message}`, "google_unavailable");
  }
  if (data.status === "ZERO_RESULTS") return null;
  if (data.status !== "OK") {
    throw new HttpError(502, `Geocoding API: ${data.status}${data.error_message ? " — " + data.error_message : ""}`, "geocoding_error");
  }
  const r = data.results[0];
  let viewportKm: number | null = null;
  const vp = r.geometry?.viewport;
  if (vp) {
    const dLat = Math.abs(vp.northeast.lat - vp.southwest.lat) * 111.32;
    const dLng = Math.abs(vp.northeast.lng - vp.southwest.lng) * 111.32 * Math.cos((r.geometry.location.lat * Math.PI) / 180);
    viewportKm = Math.sqrt(dLat ** 2 + dLng ** 2) / 2;
  }
  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address, viewportKm, components: r.address_components };
}

export async function textSearch(params: {
  query: string;
  lat: number;
  lng: number;
  radiusM: number;
  pageToken?: string;
  pageSize?: number;
}): Promise<{ places: PlaceResult[]; nextPageToken?: string }> {
  const body: Record<string, unknown> = {
    textQuery: params.query,
    languageCode: "pt-BR",
    regionCode: "BR",
    pageSize: params.pageSize ?? 20,
    locationBias: { circle: { center: { latitude: params.lat, longitude: params.lng }, radius: Math.min(50000, Math.max(100, params.radiusM)) } },
  };
  if (params.pageToken) body.pageToken = params.pageToken;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleKey(), "X-Goog-FieldMask": PLACES_FIELD_MASK },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => { throw new HttpError(503, `Não foi possível conectar à Google Places API: ${(e as Error).message}`, "google_unavailable"); });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? res.statusText;
    throw new HttpError(res.status === 403 || res.status === 401 ? 502 : res.status === 429 ? 429 : 502, `Google Places API (${res.status}): ${msg}`, "places_error");
  }
  return { places: data.places ?? [], nextPageToken: data.nextPageToken };
}

export function component(p: PlaceResult, type: string, short = false): string | null {
  const c = p.addressComponents?.find((x) => x.types.includes(type));
  return c ? (short ? c.shortText : c.longText) : null;
}
