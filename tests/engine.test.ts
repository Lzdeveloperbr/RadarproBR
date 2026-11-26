import { describe, expect, it } from "vitest";
import { classifyUrl, normalizeUrl } from "../src/lib/engine/classify";
import { computeOpportunity } from "../src/lib/engine/scoring";
import { dedupeKey, haversineKm } from "../src/lib/engine/normalize";

describe("classificação de URLs", () => {
  it("não considera redes sociais e diretórios como site próprio", () => {
    expect(classifyUrl("https://www.instagram.com/barbearia")).toBe("social");
    expect(classifyUrl("https://facebook.com/pg/x")).toBe("social");
    expect(classifyUrl("https://linktr.ee/x")).toBe("social");
    expect(classifyUrl("https://wa.me/5517999999999")).toBe("social");
    expect(classifyUrl("https://www.ifood.com.br/delivery/x")).toBe("marketplace");
    expect(classifyUrl("https://www.tripadvisor.com.br/x")).toBe("directory");
    expect(classifyUrl("https://barbeariadoze.com.br")).toBe("own_site");
    expect(classifyUrl(null)).toBe("unknown");
  });
  it("normaliza URLs e remove rastreamento", () => {
    expect(normalizeUrl("barbearia.com.br/?utm_source=google#x")).toBe("http://barbearia.com.br/");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("pontuação de oportunidade", () => {
  it("sem site identificado = ALTA, com fatos e estimativas separados", () => {
    const r = computeOpportunity({ category: "Barbearias", investigated: true, webSearchUsed: false, ownSite: null, otherPresence: [{ kind: "social", url: "https://instagram.com/x" }], checks: {}, hasPhone: true, sourceName: "OpenStreetMap" });
    expect(r.level).toBe("alta");
    expect(r.status).toBe("no_site");
    expect(r.reasons[0].text).toContain("OpenStreetMap");
    expect(r.reasons.some((x) => x.kind === "estimate")).toBe(true);
  });
  it("site que não responde em HTTPS = problema", () => {
    const r = computeOpportunity({ investigated: true, webSearchUsed: false, ownSite: { url: "http://x.com", online: null, https: false }, otherPresence: [], checks: {}, hasPhone: true });
    expect(r.status).toBe("site_issues");
    expect(r.level).toBe("media");
  });
  it("site respondendo mas conteúdo não verificado = análise incompleta (azul)", () => {
    const r = computeOpportunity({ investigated: true, webSearchUsed: false, ownSite: { url: "https://x.com", online: true, https: true }, otherPresence: [], checks: {}, hasPhone: true, contentVerified: false });
    expect(r.status).toBe("site_pending");
    expect(r.reasons.some((x) => x.kind === "estimate" && /checklist/.test(x.text))).toBe(true);
  });
  it("site completo verificado manualmente = BAIXA", () => {
    const ok = { value: true };
    const r = computeOpportunity({ category: "Restaurantes", investigated: true, webSearchUsed: false, ownSite: { url: "https://x.com", online: true, https: true }, otherPresence: [], contentVerified: true,
      checks: { mobile_viewport: ok, whatsapp: ok, contact_form: ok, services: ok, address: ok, embedded_map: ok, opening_hours: ok, social_links: ok, gallery: ok, digital_menu: ok }, hasPhone: true });
    expect(r.level).toBe("baixa");
    expect(r.status).toBe("has_site");
  });
});

describe("deduplicação e geografia", () => {
  it("gera a mesma chave para variações do mesmo estabelecimento", () => {
    expect(dedupeKey("Barbearia Dom Bigode LTDA", "(17) 3222-1111")).toBe(dedupeKey("barbearia dom bigode", "+55 17 3222-1111"));
  });
  it("calcula distâncias", () => {
    expect(haversineKm(-20.81, -49.37, -20.81, -49.37)).toBe(0);
    expect(haversineKm(-23.55, -46.63, -22.9, -43.17)).toBeGreaterThan(350);
  });
});
