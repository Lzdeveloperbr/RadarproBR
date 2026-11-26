// Normalização e chave de deduplicação de estabelecimentos.
import { stripAccents, onlyDigits } from "./htmlAnalysis.ts";

export function normalizeName(name: string): string {
  return stripAccents(name.toLowerCase())
    .replace(/\b(ltda|me|eireli|epp|s\/?a)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Chave de deduplicação: nome normalizado + telefone (8 últimos dígitos) ou coordenadas arredondadas (~100 m). */
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

/** Divide um círculo em sub-círculos (grade) para ampliar a cobertura da Text Search (limite de 60 por consulta). */
export function gridCenters(lat: number, lng: number, radiusKm: number, cells: number): { lat: number; lng: number; radiusKm: number }[] {
  if (cells <= 1) return [{ lat, lng, radiusKm }];
  const n = Math.ceil(Math.sqrt(cells));
  const step = (2 * radiusKm) / n;
  const out: { lat: number; lng: number; radiusKm: number }[] = [];
  const dLat = step / 111.32;
  const dLng = step / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cLat = lat - radiusKm / 111.32 + dLat * (i + 0.5);
      const cLng = lng - radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180)) + dLng * (j + 0.5);
      if (haversineKm(lat, lng, cLat, cLng) <= radiusKm + step / 2) {
        out.push({ lat: cLat, lng: cLng, radiusKm: (step / 2) * Math.SQRT2 });
      }
    }
  }
  return out;
}
