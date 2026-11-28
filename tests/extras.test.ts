import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, clearAll } from "../src/lib/db";
import { auditBusiness, createManualBusiness, parseCsv, csvRowToInput } from "../src/lib/services";
import { parsePageSpeed, techFindings } from "../src/lib/engine/pagespeed";
import { isValidCnpj, parseBrasilApi, formatCnpj } from "../src/lib/cnpj";
import { buildDemoSite, demoDefaults } from "../src/lib/demoSite";

const PSI = {
  lighthouseResult: {
    finalDisplayedUrl: "https://lento.example.com/",
    categories: { performance: { score: 0.31 }, seo: { score: 0.72 }, accessibility: { score: 0.88 }, "best-practices": { score: 0.9 } },
    audits: {
      "largest-contentful-paint": { numericValue: 8200, displayValue: "8,2 s" },
      "first-contentful-paint": { displayValue: "3,1 s" },
      viewport: { score: 0 },
      "is-on-https": { score: 1 },
      "meta-description": { score: 0 },
      "third-party-summary": { details: { items: [{ entity: "Google Maps" }, { entity: { text: "Facebook" } }] } },
      "final-screenshot": { details: { data: "data:image/jpeg;base64,AAAA" } },
    },
  },
};

beforeEach(async () => { await clearAll(); });

describe("auditoria técnica (PageSpeed)", () => {
  it("converte o resultado do Lighthouse", () => {
    const t = parsePageSpeed("https://lento.example.com", PSI);
    expect(t.performance).toBe(31);
    expect(t.seo).toBe(72);
    expect(t.viewport_ok).toBe(false);
    expect(t.https_ok).toBe(true);
    expect(t.third_parties).toEqual(["Google Maps", "Facebook"]);
    expect(t.screenshot).toContain("base64");
    const f = techFindings(t);
    expect(f.map((x) => x.text).join(" ")).toMatch(/lento.*31\/100.*8,2 s/);
    expect(f.some((x) => /celular/.test(x.text))).toBe(true);
  });

  it("entra na análise do estabelecimento como fatos verificados", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
      if (String(url).includes("pagespeedonline")) return new Response(JSON.stringify(PSI));
      if (init?.mode === "no-cors") return new Response(null);
      throw new Error("inesperado " + url);
    }));
    const r = await createManualBusiness({ name: "Clínica Lenta", website: "https://lento.example.com", city: "Votuporanga" });
    const a = await auditBusiness(r.id);
    expect(a.audit.tech?.performance).toBe(31);
    expect(a.audit.checks.mobile_viewport.value).toBe(false);
    expect(a.audit.checks.embedded_map.value).toBe(true);
    expect(a.status).toBe("site_issues");
    expect(a.opportunity.reasons.some((x) => x.kind === "fact" && /lento/.test(x.text))).toBe(true);
    expect((await db.businesses.get(r.id))!.tech_performance).toBe(31);
    // Checklist reaproveita a auditoria técnica sem chamar o Google de novo
    const calls = (fetch as any).mock.calls.length;
    await auditBusiness(r.id, { whatsapp: true }, { skipTech: true });
    expect((fetch as any).mock.calls.filter((c: any) => String(c[0]).includes("pagespeed")).length).toBe((fetch as any).mock.calls.slice(0, calls).filter((c: any) => String(c[0]).includes("pagespeed")).length);
  });

  it("site que o Google não consegue abrir conta como fora do ar", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: any) => {
      if (String(url).includes("pagespeedonline")) return new Response(JSON.stringify({ error: { message: "Lighthouse returned error: FAILED_DOCUMENT_REQUEST" } }), { status: 400 });
      throw new TypeError("Failed to fetch");
    }));
    const r = await createManualBusiness({ name: "Site Caído", website: "https://caido.example.com" });
    const a = await auditBusiness(r.id);
    expect(a.audit.checks.site_online.value).toBe(false);
    expect(a.opportunity.level).toBe("alta");
  });
});

describe("CNPJ (BrasilAPI)", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("não guarda o quadro de sócios", () => {
    const d = parseBrasilApi({ cnpj: "11222333000181", razao_social: "X LTDA", descricao_situacao_cadastral: "ATIVA", data_inicio_atividade: "2015-03-10", ddd_telefone_1: "1734210000", qsa: [{ nome_socio: "Fulano" }] });
    expect(d.telefone).toBe("(17) 3421-0000");
    expect(JSON.stringify(d)).not.toContain("Fulano");
  });
});

describe("cadastro manual e CSV", () => {
  it("lê CSV com ; e aspas e não duplica", async () => {
    const rows = parseCsv('﻿Nome;Telefone;Cidade;UF;Instagram\n"Bar do Zé; Filial";(17) 3421-0000;Votuporanga;SP;@bardoze\nPadaria Sol;;Votuporanga;SP;\n');
    expect(rows).toHaveLength(2);
    const inputs = rows.map(csvRowToInput);
    expect(inputs[0].name).toBe("Bar do Zé; Filial");
    for (const i of inputs) await createManualBusiness(i);
    expect((await createManualBusiness(inputs[0])).created).toBe(false);
    expect(await db.businesses.count()).toBe(2);
    expect(await db.leads.count()).toBe(2);
    const ze = (await db.businesses.toArray()).find((b) => b.name.startsWith("Bar"))!;
    expect((await db.contacts.where("business_id").equals(ze.id).toArray()).map((c) => c.type).sort()).toEqual(["instagram", "phone"]);
  });
});

describe("site demonstração", () => {
  it("usa só dados informados e escapa HTML", async () => {
    const r = await createManualBusiness({ name: "<script>alert(1)</script> Café", phone: "(17) 3421-0000", city: "Votuporanga" });
    const b = (await db.businesses.get(r.id))!;
    const html = buildDemoSite({ ...demoDefaults(b), services: [{ name: "Café expresso", price: "", desc: "" }] });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Café expresso");
    expect(html).toContain("wa.me/551734210000");
    expect(html).not.toMatch(/R\$\s?\d/);
    expect(html).not.toContain('id="sobre"'); // "Sobre" vazio não aparece
  });
});
