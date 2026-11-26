// Teste de integração do app sem servidor: IndexedDB (fake-indexeddb) + respostas reais simuladas do OpenStreetMap.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, exportBackup, importBackup, clearAll } from "../src/lib/db";
import { searchPlaces, auditBusiness, dashboardStats, setBusinessWebsite } from "../src/lib/services";
import { fetchBusinesses } from "../src/lib/filters";
import { generateMessage } from "../src/lib/messages";

const NOMINATIM = [{ lat: "-20.4237", lon: "-49.9781", boundingbox: ["-20.48", "-20.37", "-50.03", "-49.92"], address: { city: "Votuporanga", "ISO3166-2-lvl4": "BR-SP" } }];
const OVERPASS = { elements: [
  { type: "node", id: 1, lat: -20.424, lon: -49.979, tags: { name: "Barbearia Alfa", shop: "hairdresser", phone: "+55 17 3421-1111", "contact:instagram": "barbeariaalfa" } },
  { type: "node", id: 2, lat: -20.43, lon: -49.97, tags: { name: "Barbearia Beta", shop: "hairdresser", website: "https://barbeariabeta.com.br" } },
  { type: "way", id: 3, center: { lat: -20.42, lon: -49.98 }, tags: { name: "Barbearia Gama", shop: "hairdresser", website: "http://gama.com.br" } },
  { type: "node", id: 4, lat: -21.5, lon: -49.0, tags: { name: "Longe Demais", shop: "hairdresser" } },
  { type: "node", id: 5, lat: -20.425, lon: -49.98, tags: { shop: "hairdresser" } },
] };

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("nominatim")) return new Response(JSON.stringify(NOMINATIM), { status: 200 });
    if (u.includes("overpass") || u.includes("interpreter")) return new Response(JSON.stringify(OVERPASS), { status: 200 });
    // teste de site (no-cors): beta responde em HTTPS, gama não
    if (init?.mode === "no-cors") {
      if (u.includes("barbeariabeta")) return new Response(null, { status: 200 });
      throw new TypeError("Failed to fetch");
    }
    throw new Error("URL inesperada " + u);
  });
}

beforeEach(async () => {
  await clearAll();
  vi.stubGlobal("fetch", mockFetch());
});

describe("fluxo completo sem servidor", () => {
  it("pesquisa, deduplica, analisa, pontua e exporta", async () => {
    const r = await searchPlaces({ city: "Votuporanga", state: "SP", categories: ["Barbearias"], radius_km: 10 });
    expect(r.found).toBe(3); // fora do raio e sem nome são descartados
    expect(await db.leads.count()).toBe(3);

    // Segunda pesquisa igual não duplica
    const r2 = await searchPlaces({ city: "Votuporanga", state: "SP", categories: ["Barbearias"], radius_km: 10 });
    expect(r2.new).toBe(0);
    expect(await db.businesses.count()).toBe(3);

    const [alfa] = await fetchBusinesses({ q: "alfa" });
    const [beta] = await fetchBusinesses({ q: "beta" });
    const [gama] = await fetchBusinesses({ q: "gama" });

    const a = await auditBusiness(alfa.id);
    expect(a.status).toBe("no_site");
    expect(a.opportunity.level).toBe("alta");
    expect((await db.businesses.get(alfa.id))!.has_instagram).toBe(true);

    const b = await auditBusiness(beta.id);
    expect(b.status).toBe("site_pending"); // respondeu, conteúdo ainda não verificado
    expect(b.audit.checks.https.value).toBe(true);

    const g = await auditBusiness(gama.id);
    expect(g.status).toBe("site_issues"); // sem resposta em HTTPS

    // Checklist manual: site completo → baixa
    const all = Object.fromEntries(["mobile_viewport", "address", "embedded_map", "directions_button", "whatsapp", "contact_form", "services", "gallery", "opening_hours", "social_links", "online_booking"].map((k) => [k, true]));
    const b2 = await auditBusiness(beta.id, all);
    expect(b2.status).toBe("has_site");
    expect(b2.opportunity.level).toBe("baixa");
    // checklist persiste numa reanálise
    const b3 = await auditBusiness(beta.id);
    expect(b3.status).toBe("has_site");

    const lead = await db.leads.where("business_id").equals(alfa.id).first();
    expect(lead!.status).toBe("oportunidade");
    expect((await db.lead_notes.toArray()).some((n) => n.kind === "status_change")).toBe(true);

    expect((await fetchBusinesses({ onlyNoSite: true })).map((x) => x.name)).toEqual(["Barbearia Alfa"]);
    expect((await fetchBusinesses({ radius: { lat: -20.424, lng: -49.979, km: 0.2 } })).length).toBe(1);

    const stats = await dashboardStats();
    expect(stats.total).toBe(3);
    expect(stats.without_site).toBe(1);
    expect(stats.with_site).toBe(2);

    const msg = generateMessage("whatsapp", (await db.businesses.get(alfa.id))!, (await db.opportunities.get(alfa.id))!, { name: "Ana" });
    expect(msg).toContain("Barbearia Alfa");
    expect(msg).toContain("não encontrei um site próprio");

    // Backup e restauração
    const blob = await exportBackup();
    const file = new File([await blob.text()], "b.json", { type: "application/json" });
    await clearAll();
    expect(await db.businesses.count()).toBe(0);
    await importBackup(file, "replace");
    expect(await db.businesses.count()).toBe(3);
    expect(await db.leads.count()).toBe(3);
  });

  it("adicionar Instagram manualmente não conta como site próprio", async () => {
    await searchPlaces({ city: "Votuporanga", categories: ["Barbearias"] });
    const [alfa] = await fetchBusinesses({ q: "alfa" });
    expect(await setBusinessWebsite(alfa.id, "instagram.com/outro")).toBe("social");
    const r = await auditBusiness(alfa.id);
    expect(r.status).toBe("no_site");
    expect(await setBusinessWebsite(alfa.id, "alfa.com.br")).toBe("own_site");
  });

  it("falha de rede gera erro claro e pesquisa registrada como falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(searchPlaces({ city: "X", categories: ["Barbearias"] })).rejects.toThrow(/OpenStreetMap/);
    expect((await db.searches.toArray())[0].status).toBe("failed");
  });
});
