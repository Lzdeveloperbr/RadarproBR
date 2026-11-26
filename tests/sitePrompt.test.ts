import { describe, expect, it } from "vitest";
import { buildLovablePrompt } from "../src/lib/sitePrompt";

const base: any = { id: "1", name: "Pizzaria Bella", category: "Pizzarias", city: "Votuporanga", state: "SP", formatted_address: "Rua Amazonas, 100 - Centro, Votuporanga - SP",
  phone: "(17) 3421-0000", lat: -20.42, lng: -49.97, rating: 4.6, user_rating_count: 310, google_maps_uri: "https://maps.google.com/?cid=1", opening_hours: null };

describe("gerador de prompt Lovable", () => {
  it("contém as 15 seções e usa apenas dados verificados", () => {
    const p = buildLovablePrompt({ business: base });
    for (const s of ["1. DESIGN", "2. ESTRUTURA", "3. PÁGINA INICIAL", "4. SERVIÇOS", "5. PREÇOS", "6. GALERIA", "7. SOBRE A EMPRESA", "8. LOCALIZAÇÃO", "9. GOOGLE MAPS", "10. BOTÃO DE WHATSAPP", "11. CONTATO", "12. SEO", "13. RESPONSIVIDADE", "14. ANIMAÇÕES", "15. INTEGRAÇÕES"]) {
      expect(p).toContain(s);
    }
    expect(p).toContain("Rua Amazonas, 100");
    expect(p).toContain("nota 4.6 no Google com 310 avaliações");
    expect(p).toMatch(/\[A PREENCHER: preços verificados/);
    expect(p).toMatch(/\[A PREENCHER: horário de funcionamento\]/);
    expect(p).not.toMatch(/R\$\s?\d/); // nenhum preço inventado
  });
  it("gera prompt de aplicativo", () => {
    expect(buildLovablePrompt({ business: base }, "app")).toContain("PWA");
  });
});
