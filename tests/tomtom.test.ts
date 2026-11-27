import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, clearAll } from "../src/lib/db";
import { searchPlaces } from "../src/lib/services";
import { parseTomTomResult } from "../src/lib/engine/tomtom";

const TT = { summary: { totalResults: 2 }, results: [
  { id: "BR/POI/p0/1", position: { lat: -20.4240, lon: -49.9782 }, poi: { name: "Barbearia do Zé", phone: "+55 17 3421-0000", url: "www.barbeariadoze.com.br", categories: ["barbearia"] },
    address: { freeformAddress: "Rua A 1, Votuporanga, SP", streetName: "Rua A", streetNumber: "1", municipality: "Votuporanga", countrySubdivisionCode: "SP", postalCode: "15500-000" } },
  { id: "BR/POI/p0/2", position: { lat: -20.426, lon: -49.975 }, poi: { name: "Só na TomTom", phone: "+55 17 3421-2222" }, address: { municipality: "Votuporanga" } },
] };
const OSM = { elements: [
  { type: "node", id: 10, lat: -20.4241, lon: -49.9783, tags: { name: "Barbearia do Zé", shop: "hairdresser", "contact:instagram": "barbeariadoze" } },
  { type: "node", id: 11, lat: -20.43, lon: -49.97, tags: { name: "Só no OSM", shop: "hairdresser" } },
] };

beforeEach(async () => {
  await clearAll();
  await db.settings.put({ id: "me", tomtom_api_key: "TT", search_source: "auto", google_max_grid: 1 } as any);
  vi.stubGlobal("fetch", vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes("nominatim")) return new Response(JSON.stringify([{ lat: "-20.4237", lon: "-49.9781", address: {} }]));
    if (u.includes("api.tomtom.com")) {
      expect(u).toContain("countrySet=BR");
      expect(u).toContain("/poiSearch/barbearia.json");
      return new Response(JSON.stringify(TT));
    }
    return new Response(JSON.stringify(OSM));
  }));
});

describe("TomTom (gratuita)", () => {
  it("converte resultados da API", () => {
    const p = parseTomTomResult(TT.results[0])!;
    expect(p.id).toBe("tomtom:BR/POI/p0/1");
    expect(p.website).toBe("http://www.barbeariadoze.com.br");
    expect(p.city).toBe("Votuporanga");
    expect(p.state).toBe("SP");
  });
  it("une TomTom + OpenStreetMap sem duplicar", async () => {
    const r = await searchPlaces({ city: "Votuporanga", state: "SP", categories: ["Barbearias"], radius_km: 5 });
    expect(r.found).toBe(3);
    const ze = (await db.businesses.toArray()).find((b) => b.name === "Barbearia do Zé")!;
    expect(ze.source).toBe("tomtom");
    expect(ze.primary_website).toBe("http://www.barbeariadoze.com.br/");
    expect(ze.osm_url).toContain("node/10");
    const types = (await db.contacts.where("business_id").equals(ze.id).toArray()).map((c) => c.type).sort();
    expect(types).toEqual(["instagram", "phone"]);
  });
  it("cota esgotada na TomTom não interrompe a pesquisa", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("nominatim")) return new Response(JSON.stringify([{ lat: "-20.4237", lon: "-49.9781", address: {} }]));
      if (u.includes("api.tomtom.com")) return new Response("{}", { status: 429 });
      return new Response(JSON.stringify(OSM));
    }));
    const r = await searchPlaces({ city: "Votuporanga", categories: ["Barbearias"], radius_km: 5 });
    expect(r.found).toBe(2);
    expect(r.warnings[0]).toMatch(/TomTom/);
  });
});
