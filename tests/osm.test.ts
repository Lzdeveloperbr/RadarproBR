import { describe, expect, it } from "vitest";
import { buildOverpassQuery, describeOpeningHours, filtersFor, formatAddress, parseOsmElement, OSM_CATEGORY_FILTERS } from "../supabase/functions/_shared/osm.ts";

const CATEGORIES = ["Barbearias", "Salões de beleza", "Restaurantes", "Pizzarias", "Lanchonetes", "Hamburguerias", "Padarias", "Açougues", "Mercados", "Supermercados",
  "Oficinas mecânicas", "Autoelétricas", "Lava-rápidos", "Borracharias", "Lojas de roupas", "Lojas de calçados", "Lojas de materiais de construção", "Clínicas médicas",
  "Clínicas odontológicas", "Clínicas veterinárias", "Pet shops", "Farmácias", "Academias", "Hotéis", "Pousadas", "Imobiliárias", "Escritórios de contabilidade",
  "Advogados", "Escolas", "Cursos profissionalizantes", "Concessionárias", "Assistências técnicas", "Empresas agrícolas", "Prestadores de serviços"];

describe("OpenStreetMap (fonte gratuita)", () => {
  it("cobre todas as categorias do RADAR", () => {
    for (const c of CATEGORIES) expect(OSM_CATEGORY_FILTERS[c], c).toBeDefined();
  });
  it("monta consulta Overpass válida com raio e limite", () => {
    const q = buildOverpassQuery("Barbearias", -20.4237, -49.9781, 10000, 180);
    expect(q).toContain("[out:json]");
    expect(q).toContain('(around:10000,-20.423700,-49.978100)');
    expect(q).toContain('["name"]');
    expect(q).toContain("out center tags 180;");
    expect(buildOverpassQuery("Restaurantes", 0, 0, 999999, 10)).toContain("around:50000");
  });
  it("categoria personalizada vira busca segura por nome", () => {
    const f = filtersFor('tatuagem"];out;(node');
    expect(f.join("")).not.toContain('"];out');
    expect(f[0]).toContain("tatuagem");
  });
  it("converte elementos OSM em estabelecimentos (sem inventar dados)", () => {
    const p = parseOsmElement({ type: "way", id: 42, center: { lat: -20.42, lon: -49.97 }, tags: {
      name: "Barbearia do Zé", shop: "hairdresser", "addr:street": "Rua Amazonas", "addr:housenumber": "100", "addr:suburb": "Centro",
      "addr:city": "Votuporanga", "addr:postcode": "15500-000", phone: "+55 17 3421-0000;+55 17 99999-0000", website: "barbeariadoze.com.br",
      "contact:instagram": "@barbeariadoze", opening_hours: "Mo-Fr 09:00-19:00; Sa 08:00-14:00; Su off" } })!;
    expect(p.id).toBe("osm:way/42");
    expect(p.lat).toBe(-20.42);
    expect(p.phone).toBe("+55 17 3421-0000");
    expect(p.website).toBe("http://barbeariadoze.com.br");
    expect(p.instagram).toBe("https://www.instagram.com/barbeariadoze");
    expect(formatAddress(p)).toBe("Rua Amazonas, 100, Centro, Votuporanga, 15500-000");
    expect(describeOpeningHours(p.opening_hours)).toEqual(["seg-sex 09:00-19:00", "sáb 08:00-14:00", "dom fechado"]);
    expect(p.facebook).toBeNull();
    expect(p.email).toBeNull();
  });
  it("ignora elementos sem nome ou sem coordenadas", () => {
    expect(parseOsmElement({ type: "node", id: 1, lat: 1, lon: 1, tags: { shop: "bakery" } })).toBeNull();
    expect(parseOsmElement({ type: "way", id: 2, tags: { name: "X" } })).toBeNull();
  });
});
