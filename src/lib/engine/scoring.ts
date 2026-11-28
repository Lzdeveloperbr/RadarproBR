// Classificação inteligente de oportunidades comerciais (0–100).
// Cada motivo é marcado como "fact" (verificado) ou "estimate" (oportunidade estimada).

export type Level = "alta" | "media" | "baixa";
export type DigitalStatus = "has_site" | "no_site" | "site_issues" | "site_pending" | "unknown";

export interface Reason { kind: "fact" | "estimate"; text: string; weight: number }

export interface ScoringInput {
  category?: string | null;
  primaryType?: string | null;
  investigated: boolean;              // investigação completa executada (Places + busca web quando disponível)
  webSearchUsed: boolean;
  ownSite: { url: string; online: boolean | null; https: boolean | null; robotsBlocked?: boolean } | null;
  otherPresence: { kind: "social" | "directory" | "marketplace"; url: string }[];
  checks: Record<string, { value: boolean | null }>;
  hasPhone: boolean;
  rating?: number | null;
  ratingCount?: number | null;
  sourceName?: string;
  /** false quando o conteúdo do site ainda não foi verificado (nem automática nem manualmente). */
  contentVerified?: boolean;
}

export interface ScoringResult {
  score: number;
  level: Level;
  status: DigitalStatus;
  reasons: Reason[];
  products: string[];
}

const FOOD = /restaurante|pizzaria|lanchonete|hamburgueria|padaria|a[cç]ougue|mercado|supermercado|food|restaurant|bakery|cafe|bar\b|meal|pizza|hamburger|sorveteria|doceria|confeitaria/i;
const BOOKING = /barbearia|sal[aã]o|cl[ií]nica|odonto|dentist|veterin|pet|academia|gym|hotel|pousada|est[eé]tica|beauty|hair|barber|spa|advogad|contabil|lava|oficina|mec[aâ]nica|consult|fisioterap|psic|nail|lodging|doctor|health/i;

export function segmentOf(category?: string | null, primaryType?: string | null): "food" | "booking" | "retail" | "general" {
  const s = `${category ?? ""} ${primaryType ?? ""}`;
  if (FOOD.test(s)) return "food";
  if (BOOKING.test(s)) return "booking";
  if (/loja|store|shop|roupas|cal[cç]ados|materiais|farm[aá]cia|pharmacy|concession|car_dealer/i.test(s)) return "retail";
  return "general";
}

export function computeOpportunity(input: ScoringInput): ScoringResult {
  const reasons: Reason[] = [];
  const products = new Set<string>();
  const seg = segmentOf(input.category, input.primaryType);
  const c = (k: string) => input.checks[k]?.value;
  let score = 0;
  let status: DigitalStatus = "unknown";

  const socials = input.otherPresence.filter((p) => p.kind === "social");
  const dirs = input.otherPresence.filter((p) => p.kind !== "social");

  if (!input.ownSite) {
    if (input.investigated) {
      status = "no_site";
      score += 45;
      reasons.push({
        kind: "fact",
        text: input.webSearchUsed
          ? `Site próprio não identificado no ${input.sourceName ?? "Google Places"} nem na busca na web`
          : `Site próprio não identificado no cadastro (${input.sourceName ?? "Google Places"})`,
        weight: 45,
      });
    } else {
      status = "unknown";
      score += 25;
      reasons.push({ kind: "estimate", text: "Presença digital ainda não investigada por completo", weight: 25 });
    }
    if (socials.length) {
      score += 15;
      reasons.push({ kind: "fact", text: `Presença apenas em redes sociais/diretórios (${[...socials, ...dirs].map((s) => s.kind === "social" ? "rede social" : "diretório").filter((v, i, a) => a.indexOf(v) === i).join(", ")})`, weight: 15 });
    } else if (dirs.length) {
      score += 10;
      reasons.push({ kind: "fact", text: "Link informado aponta para diretório/marketplace, não para site próprio", weight: 10 });
    }
    products.add("Site profissional");
    if (seg === "food") { products.add("Cardápio digital"); score += 10; reasons.push({ kind: "estimate", text: "Segmento de alimentação se beneficia de cardápio digital e pedidos online", weight: 10 }); }
    if (seg === "booking") { products.add("Sistema de agendamento online"); score += 10; reasons.push({ kind: "estimate", text: "Segmento de serviços se beneficia de agendamento online", weight: 10 }); }
    if (seg === "retail") { products.add("Catálogo digital / loja virtual"); score += 8; reasons.push({ kind: "estimate", text: "Varejo se beneficia de catálogo digital com pedidos pelo WhatsApp", weight: 8 }); }
    score += 5;
    reasons.push({ kind: "estimate", text: "Sem site próprio identificado, a localização no ambiente digital depende de terceiros", weight: 5 });
    products.add("Integração com WhatsApp e Google Maps");
  } else if (input.ownSite.online === false) {
    status = "site_issues";
    score += 62;
    reasons.push({ kind: "fact", text: `Site ${input.ownSite.url} está fora do ar ou retornando erro`, weight: 62 });
    products.add("Recuperação / novo site profissional");
    products.add("Monitoramento e hospedagem");
  } else if (input.ownSite.robotsBlocked) {
    status = "site_pending";
    score += 20;
    reasons.push({ kind: "fact", text: "Site identificado; análise de conteúdo não realizada (bloqueado por robots.txt)", weight: 20 });
  } else if (input.ownSite.online === null) {
    status = "site_pending";
    score += 20;
    reasons.push({ kind: "fact", text: "Site identificado, análise ainda incompleta", weight: 20 });
    if (input.ownSite.https === false) {
      status = "site_issues";
      score += 25;
      reasons.push({ kind: "fact", text: "O site não respondeu com conexão segura (HTTPS) — pode estar sem certificado ou fora do ar", weight: 25 });
      products.add("Certificado SSL / HTTPS");
    }
  } else if (input.contentVerified === false) {
    status = input.ownSite.https === false ? "site_issues" : "site_pending";
    score += 30;
    reasons.push({ kind: "fact", text: `Site ${input.ownSite.url} respondeu${input.ownSite.https ? " com HTTPS" : ""}`, weight: 0 });
    reasons.push({ kind: "estimate", text: "Conteúdo do site ainda não verificado — confira WhatsApp, agendamento, localização e versão para celular no checklist", weight: 30 });
    if (input.ownSite.https === false) {
      score += 12;
      reasons.push({ kind: "fact", text: "Site sem HTTPS (conexão não segura)", weight: 12 });
      products.add("Certificado SSL / HTTPS");
    }
  } else {
    // Site online: pontuar lacunas verificadas
    const gaps: [string, string, number, string?][] = [
      ["mobile_viewport", "Site não apresenta configuração responsiva para celular (meta viewport)", 12, "Site responsivo (mobile-first)"],
      ["whatsapp", "Site sem botão/link de WhatsApp", 10, "Botão de WhatsApp"],
      ["contact_form", "Site sem formulário de contato", 6, "Formulário de contato"],
      ["services", "Site não apresenta seção de serviços/produtos", 7, "Página de serviços"],
      ["address", "Endereço físico não identificado no site", 10, "Seção de localização"],
      ["embedded_map", "Site sem mapa incorporado", 5, "Mapa do Google incorporado"],
      ["opening_hours", "Horário de funcionamento não identificado no site", 4],
      ["social_links", "Site sem links para redes sociais", 3],
      ["gallery", "Site sem galeria de fotos identificada", 3, "Galeria de fotos"],
    ];
    for (const [key, text, w, product] of gaps) {
      if (c(key) === false) {
        score += w;
        reasons.push({ kind: "fact", text, weight: w });
        if (product) products.add(product);
      }
    }
    if (seg === "food" && c("digital_menu") === false) {
      score += 10;
      reasons.push({ kind: "fact", text: "Cardápio digital não identificado no site", weight: 10 });
      products.add("Cardápio digital");
    }
    if (seg === "booking" && c("online_booking") === false) {
      score += 10;
      reasons.push({ kind: "fact", text: "Agendamento online não identificado no site", weight: 10 });
      products.add("Sistema de agendamento online");
    }
    if (input.ownSite.https === false) {
      score += 12;
      reasons.push({ kind: "fact", text: "Site sem HTTPS (conexão não segura)", weight: 12 });
      products.add("Certificado SSL / HTTPS");
    }
    const issues = (input.ownSite.https === false ? 1 : 0) + (c("mobile_viewport") === false ? 1 : 0);
    status = issues > 0 ? "site_issues" : "has_site";
    if (score <= 15) reasons.push({ kind: "fact", text: "Site completo, com boa apresentação digital", weight: 0 });
  }

  if (!input.hasPhone) {
    reasons.push({ kind: "fact", text: "Telefone não identificado nas fontes consultadas", weight: 0 });
  }
  if ((input.ratingCount ?? 0) >= 50 && (input.rating ?? 0) >= 4) {
    score += 5;
    reasons.push({ kind: "estimate", text: `Negócio bem avaliado (${input.rating}★, ${input.ratingCount} avaliações) com potencial de investir em presença digital`, weight: 5 });
  }

  // Sem site próprio identificado ou site fora do ar = oportunidade ALTA por definição
  if (status === "no_site" || (input.ownSite && input.ownSite.online === false)) score = Math.max(score, 60);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const level: Level = score >= 60 ? "alta" : score >= 30 ? "media" : "baixa";
  return { score, level, status, reasons, products: [...products] };
}
