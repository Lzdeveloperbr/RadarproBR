import { describe, expect, it } from "vitest";
import { classifyUrl, normalizeUrl } from "../supabase/functions/_shared/classify.ts";
import { validatePublicUrl, isPrivateAddress } from "../supabase/functions/_shared/netguard.ts";
import { parseRobots, isPathAllowed } from "../supabase/functions/_shared/robots.ts";
import { analyzeHtml, coordsFromMapsUrl, mergeAnalyses, pickSubpages } from "../supabase/functions/_shared/htmlAnalysis.ts";
import { computeOpportunity } from "../supabase/functions/_shared/scoring.ts";
import { dedupeKey, gridCenters, haversineKm } from "../supabase/functions/_shared/normalize.ts";

describe("classificação de URLs", () => {
  it("não considera redes sociais e diretórios como site próprio", () => {
    expect(classifyUrl("https://www.instagram.com/barbearia")).toBe("social");
    expect(classifyUrl("https://facebook.com/pg/x")).toBe("social");
    expect(classifyUrl("https://linktr.ee/x")).toBe("social");
    expect(classifyUrl("https://wa.me/5517999999999")).toBe("social");
    expect(classifyUrl("https://www.ifood.com.br/delivery/x")).toBe("marketplace");
    expect(classifyUrl("https://www.tripadvisor.com.br/x")).toBe("directory");
    expect(classifyUrl("https://booksy.com/pt-br/123")).toBe("directory");
    expect(classifyUrl("https://barbeariadoze.com.br")).toBe("own_site");
    expect(classifyUrl(null)).toBe("unknown");
  });
  it("normaliza URLs e remove rastreamento", () => {
    expect(normalizeUrl("barbearia.com.br/?utm_source=google#x")).toBe("http://barbearia.com.br/");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("proteção SSRF", () => {
  it("bloqueia destinos internos", () => {
    for (const u of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://169.254.169.254/latest", "http://[::1]/",
      "http://192.168.0.1/", "file:///etc/passwd", "http://user:pw@site.com/", "http://site.com:22/", "http://metadata.google.internal/", "http://2130706433/", "http://intranet/"]) {
      expect(validatePublicUrl(u).ok, u).toBe(false);
    }
  });
  it("permite domínios públicos", () => {
    expect(validatePublicUrl("https://www.exemplo.com.br/contato").ok).toBe(true);
  });
  it("detecta IPs privados (v4 e v6)", () => {
    expect(isPrivateAddress("172.16.3.4")).toBe(true);
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false);
  });
});

describe("robots.txt", () => {
  const txt = `User-agent: *\nDisallow: /admin\nAllow: /admin/public\n\nUser-agent: RadarLocalProBot\nDisallow: /privado\n`;
  it("usa o grupo específico do bot quando existir", () => {
    const rules = parseRobots(txt);
    expect(isPathAllowed(rules, "/privado/x")).toBe(false);
    expect(isPathAllowed(rules, "/admin")).toBe(true); // grupo específico não bloqueia /admin
  });
  it("aplica regra mais específica e curingas", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /\nAllow: /$\nAllow: /contato");
    expect(isPathAllowed(rules, "/")).toBe(true);
    expect(isPathAllowed(rules, "/contato")).toBe(true);
    expect(isPathAllowed(rules, "/outra")).toBe(false);
    expect(isPathAllowed(parseRobots("User-agent: *\nDisallow:"), "/x")).toBe(true);
  });
});

const SITE = `<!doctype html><html><head><title>Barbearia Dom Bigode | São José do Rio Preto</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BarberShop","name":"Barbearia Dom Bigode","address":{"@type":"PostalAddress","streetAddress":"Rua Bernardino de Campos, 1234","addressLocality":"São José do Rio Preto","addressRegion":"SP","postalCode":"15015-300"},"geo":{"latitude":-20.8113,"longitude":-49.3758},"openingHours":"Tu-Sa 09:00-19:00","sameAs":["https://instagram.com/dombigode"]}</script>
</head><body>
<nav><a href="/servicos">Serviços</a><a href="/contato">Contato</a></nav>
<h2>Nossos serviços</h2><p>Corte, barba e sobrancelha.</p>
<a href="https://wa.me/5517991234567">Fale no WhatsApp</a>
<a href="tel:+551732221111">(17) 3222-1111</a>
<a href="https://www.google.com/maps/dir/?api=1&destination=-20.8113,-49.3758">Como chegar</a>
<iframe src="https://www.google.com/maps/embed?pb=!1m18!2d-49.3758!3d-20.8113"></iframe>
<a href="https://booksy.com/pt-br/12345">Agende agora</a>
<form><input type="text" name="nome"><input type="email" name="email"><textarea></textarea></form>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">Compartilhar</a>
</body></html>`;

describe("análise de HTML", () => {
  const a = analyzeHtml(SITE, "https://dombigode.com.br/", { name: "Barbearia Dom Bigode", city: "São José do Rio Preto", phone: "(17) 3222-1111" });
  it("identifica localização completa", () => {
    expect(a.checks.address.value).toBe(true);
    expect(a.location.postal_code).toBe("15015-300");
    expect(a.location.city).toBe("São José do Rio Preto");
    expect(a.location.state).toBe("SP");
    expect(a.location.lat).toBeCloseTo(-20.8113);
    expect(a.checks.embedded_map.value).toBe(true);
    expect(a.checks.directions_button.value).toBe(true);
    expect(a.checks.maps_link.value).toBe(true);
  });
  it("identifica contatos e recursos", () => {
    expect(a.checks.mobile_viewport.value).toBe(true);
    expect(a.checks.whatsapp.value).toBe(true);
    expect(a.whatsapps).toContain("5517991234567");
    expect(a.checks.phone.value).toBe(true);
    expect(a.checks.contact_form.value).toBe(true);
    expect(a.checks.online_booking.value).toBe(true);
    expect(a.checks.services.value).toBe(true);
    expect(a.checks.opening_hours.value).toBe(true);
    expect(a.socials.map((s) => s.network)).toEqual(["instagram"]); // link de compartilhamento ignorado
    expect(a.checks.name_match.value).toBe(true);
    expect(a.checks.phone_match.value).toBe(true);
  });
  it("marca ausências como não identificadas (false), sem inventar", () => {
    const empty = analyzeHtml("<html><head><title>Oi</title></head><body><p>Bem-vindo</p></body></html>", "https://x.com.br/");
    expect(empty.checks.address.value).toBe(false);
    expect(empty.checks.whatsapp.value).toBe(false);
    expect(empty.checks.mobile_viewport.value).toBe(false);
    expect(empty.location.full_address).toBeNull();
  });
  it("seleciona subpáginas relevantes e mescla resultados", () => {
    expect(pickSubpages(a.internalLinks)).toContain("https://dombigode.com.br/contato");
    const empty = analyzeHtml("<html><body>oi</body></html>", "https://dombigode.com.br/");
    const merged = mergeAnalyses([empty, a]);
    expect(merged.checks.whatsapp.value).toBe(true);
    expect(merged.checks.mobile_viewport.value).toBe(false); // vale a página inicial
  });
  it("extrai coordenadas de links do Maps", () => {
    expect(coordsFromMapsUrl("https://www.google.com/maps/place/X/@-20.42,-49.97,17z")).toEqual({ lat: -20.42, lng: -49.97 });
    expect(coordsFromMapsUrl("https://maps.google.com/?q=-20.421,-49.972")).toEqual({ lat: -20.421, lng: -49.972 });
  });
});

describe("pontuação de oportunidade", () => {
  it("sem site identificado após investigação = ALTA, com fatos e estimativas separados", () => {
    const r = computeOpportunity({ category: "Barbearias", investigated: true, webSearchUsed: true, ownSite: null,
      otherPresence: [{ kind: "social", url: "https://instagram.com/x" }], checks: {}, hasPhone: true, rating: 4.8, ratingCount: 120 });
    expect(r.level).toBe("alta");
    expect(r.status).toBe("no_site");
    expect(r.products).toContain("Sistema de agendamento online");
    expect(r.reasons.some((x) => x.kind === "fact")).toBe(true);
    expect(r.reasons.some((x) => x.kind === "estimate")).toBe(true);
  });
  it("site fora do ar = ALTA e status com problemas", () => {
    const r = computeOpportunity({ investigated: true, webSearchUsed: false, ownSite: { url: "http://x.com", online: false, https: false }, otherPresence: [], checks: {}, hasPhone: true });
    expect(r.level).toBe("alta");
    expect(r.status).toBe("site_issues");
  });
  it("site completo = BAIXA", () => {
    const ok = { value: true };
    const r = computeOpportunity({ category: "Restaurantes", investigated: true, webSearchUsed: true, ownSite: { url: "https://x.com", online: true, https: true }, otherPresence: [],
      checks: { mobile_viewport: ok, whatsapp: ok, contact_form: ok, services: ok, address: ok, embedded_map: ok, opening_hours: ok, social_links: ok, gallery: ok, digital_menu: ok }, hasPhone: true });
    expect(r.level).toBe("baixa");
    expect(r.status).toBe("has_site");
  });
  it("site sem recursos importantes = MÉDIA", () => {
    const r = computeOpportunity({ category: "Clínicas odontológicas", investigated: true, webSearchUsed: true, ownSite: { url: "https://x.com", online: true, https: true }, otherPresence: [],
      checks: { mobile_viewport: { value: true }, whatsapp: { value: false }, contact_form: { value: false }, services: { value: true }, address: { value: false }, online_booking: { value: false } }, hasPhone: true });
    expect(r.level).toBe("media");
  });
});

describe("deduplicação e geografia", () => {
  it("gera a mesma chave para variações do mesmo estabelecimento", () => {
    expect(dedupeKey("Barbearia Dom Bigode LTDA", "(17) 3222-1111")).toBe(dedupeKey("barbearia dom bigode", "+55 17 3222-1111"));
  });
  it("calcula distância e grade de cobertura", () => {
    expect(haversineKm(-20.81, -49.37, -20.81, -49.37)).toBe(0);
    expect(haversineKm(-23.55, -46.63, -22.90, -43.17)).toBeGreaterThan(350);
    const g = gridCenters(-20.8, -49.4, 20, 9);
    expect(g.length).toBeGreaterThan(4);
    g.forEach((c) => expect(haversineKm(-20.8, -49.4, c.lat, c.lng)).toBeLessThan(25));
  });
});
