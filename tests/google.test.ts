import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, clearAll } from "../src/lib/db";
import { searchPlaces, sameBusiness } from "../src/lib/services";

const NOMINATIM = [{ lat: "-20.4237", lon: "-49.9781", boundingbox: ["-20.48", "-20.37", "-50.03", "-49.92"], address: {} }];
const OVERPASS = { elements: [
  // mesma barbearia do Google, com Instagram e WhatsApp só no OSM
  { type: "node", id: 10, lat: -20.4241, lon: -49.9783, tags: { name: "Barbearia do Zé", shop: "hairdresser", "contact:instagram": "barbeariadoze", "contact:whatsapp": "17999990000" } },
  { type: "node", id: 11, lat: -20.43, lon: -49.97, tags: { name: "Só no OSM", shop: "hairdresser" } },
] };
const GOOGLE = [
  { id: "g1", displayName: "Barbearia do Zé", formattedAddress: "Rua A, 1 - Centro, Votuporanga - SP", location: { lat: () => -20.4240, lng: () => -49.9782 },
    nationalPhoneNumber: "(17) 3421-0000", rating: 4.8, userRatingCount: 210, businessStatus: "OPERATIONAL", websiteURI: null, googleMapsURI: "https://maps.google.com/?cid=1",
    addressComponents: [{ types: ["administrative_area_level_2"], longText: "Votuporanga", shortText: "Votuporanga" }], types: ["barber_shop"], primaryType: "barber_shop", primaryTypeDisplayName: "Barbearia" },
  { id: "g2", displayName: "Só no Google", location: { lat: () => -20.425, lng: () => -49.975 }, rating: 4.1, userRatingCount: 12 },
  { id: "g3", displayName: "Fechada", location: { lat: () => -20.425, lng: () => -49.976 }, businessStatus: "CLOSED_PERMANENTLY" },
];

beforeEach(async () => {
  await clearAll();
  await db.settings.put({ id: "me", google_api_key: "TESTE", search_source: "auto", google_max_grid: 1 } as any);
  const searchByText = vi.fn(async () => ({ places: GOOGLE }));
  vi.stubGlobal("google", { maps: { importLibrary: vi.fn(async () => ({ Place: { searchByText } })) } });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes("nominatim") ? NOMINATIM : OVERPASS), { status: 200 })));
});

describe("Google + OpenStreetMap", () => {
  it("junta as fontes sem duplicar e completa os dados", async () => {
    const r = await searchPlaces({ city: "Votuporanga", state: "SP", categories: ["Barbearias"], radius_km: 5 });
    expect(r.found).toBe(3); // Zé (fundido) + só Google + só OSM; fechada descartada
    const all = await db.businesses.toArray();
    const ze = all.find((b) => b.name === "Barbearia do Zé")!;
    expect(ze.source).toBe("google");
    expect(ze.rating).toBe(4.8);
    expect(ze.osm_url).toContain("openstreetmap.org/node/10");
    const contacts = await db.contacts.where("business_id").equals(ze.id).toArray();
    expect(contacts.map((c) => c.type).sort()).toEqual(["instagram", "phone", "whatsapp"]);
    // repetir a pesquisa não cria duplicados
    const r2 = await searchPlaces({ city: "Votuporanga", categories: ["Barbearias"], radius_km: 5 });
    expect(r2.new).toBe(0);
    expect(await db.businesses.count()).toBe(3);
  });

  it("somente OpenStreetMap ignora o Google", async () => {
    const r = await searchPlaces({ city: "Votuporanga", categories: ["Barbearias"], radius_km: 5, source: "osm" });
    expect(r.found).toBe(2);
    expect((await db.businesses.toArray()).every((b) => b.source === "openstreetmap")).toBe(true);
  });

  it("reconhece o mesmo negócio por telefone ou nome próximo", () => {
    expect(sameBusiness({ norm: "ze", lat: 0, lng: 0, phone: "(17) 3421-0000" }, { norm: "outro", lat: 5, lng: 5, phone: "+55 17 3421-0000" })).toBe(true);
    expect(sameBusiness({ norm: "ze", lat: -20.424, lng: -49.978, phone: null }, { norm: "ze", lat: -20.4241, lng: -49.9781, phone: null })).toBe(true);
    expect(sameBusiness({ norm: "ze", lat: -20.424, lng: -49.978, phone: null }, { norm: "ze", lat: -20.44, lng: -49.978, phone: null })).toBe(false);
  });
});
