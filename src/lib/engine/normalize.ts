// Normalização, chave de deduplicação e geografia.
export const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function normalizeName(name: string): string {
  return stripAccents(name.toLowerCase()).replace(/\b(ltda|me|eireli|epp|s\/?a)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Nome normalizado + telefone (8 últimos dígitos) ou coordenadas arredondadas (~100 m). */
export function dedupeKey(name: string, phone?: string | null, lat?: number | null, lng?: number | null): string {
  const n = normalizeName(name);
  const p = phone ? onlyDigits(phone).slice(-8) : "";
  if (p.length === 8) return `${n}|tel:${p}`;
  if (lat != null && lng != null) return `${n}|geo:${lat.toFixed(3)},${lng.toFixed(3)}`;
  return `${n}|nogeo`;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
