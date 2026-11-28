// Gerador de conteúdos comerciais (sem IA paga): monta textos a partir SOMENTE dos fatos verificados.
// Nada é inventado: quando um dado não existe, o texto não o menciona ou usa um campo [A PREENCHER].
import type { Business, Opportunity } from "./types";
import { segmentOf } from "./engine/scoring";

export interface Seller { name?: string | null; company?: string | null; phone?: string | null; email?: string | null }

const SEG: Record<string, { benefit: string; feature: string; pain: string }> = {
  food: { benefit: "receber pedidos direto pelo WhatsApp e mostrar o cardápio com fotos", feature: "cardápio digital com pedido pelo WhatsApp", pain: "clientes que procuram onde comer pelo celular" },
  booking: { benefit: "receber agendamentos 24 horas por dia, sem depender de ligações", feature: "agendamento online integrado ao WhatsApp", pain: "clientes que querem marcar horário rapidamente" },
  retail: { benefit: "mostrar produtos e receber pedidos pelo WhatsApp", feature: "catálogo digital com botão de compra pelo WhatsApp", pain: "clientes que pesquisam antes de ir até a loja" },
  general: { benefit: "ser encontrado no Google e receber contatos pelo WhatsApp", feature: "site profissional com WhatsApp e localização", pain: "clientes que pesquisam serviços pelo celular" },
};

function facts(o: Opportunity | null) {
  const f = (o?.reasons ?? []).filter((r) => r.kind === "fact" && r.weight > 0).map((r) => r.text);
  return f;
}

function gapPhrase(b: Business) {
  if (b.digital_status === "no_site") return "não encontrei um site próprio do seu negócio";
  if (b.site_https === false) return "o site de vocês não abriu com conexão segura (HTTPS) no meu teste";
  if (b.has_whatsapp === false) return "não encontrei um botão de WhatsApp no site de vocês";
  if (b.has_booking === false) return "não encontrei agendamento online no site de vocês";
  return "há espaço para fortalecer a presença digital de vocês";
}

export type MessageKind = "report" | "pitch" | "approach" | "whatsapp" | "email";
export const MESSAGE_KINDS: { key: MessageKind; label: string }[] = [
  { key: "report", label: "Relatório comercial" },
  { key: "pitch", label: "Argumentos de venda" },
  { key: "approach", label: "Sugestão de abordagem" },
  { key: "whatsapp", label: "Mensagem WhatsApp" },
  { key: "email", label: "E-mail comercial" },
];

export function generateMessage(kind: MessageKind, b: Business, o: Opportunity | null, seller: Seller): string {
  const seg = SEG[segmentOf(b.category, b.primary_type)];
  const me = seller.name ?? "[A PREENCHER: seu nome]";
  const company = seller.company ? ` da ${seller.company}` : "";
  const contact = [seller.phone, seller.email].filter(Boolean).join(" · ") || "[A PREENCHER: seu contato]";
  const where = [b.neighborhood, b.city].filter(Boolean).join(", ");
  const f = facts(o);
  const products = o?.suggested_products ?? [];

  if (kind === "report") {
    return [
      `# Relatório comercial — ${b.name}`, "",
      "## Resumo",
      `${b.name} é ${b.category ? `um estabelecimento da categoria ${b.category.toLowerCase()}` : "um estabelecimento"}${where ? ` localizado em ${where}` : ""}. ` +
        (b.primary_website ? `Foi identificado o site ${b.primary_website}.` : "Não foi identificado um site próprio nas fontes consultadas.") +
        (b.has_instagram ? " Possui presença no Instagram." : "") + (b.phone ? ` Telefone público: ${b.phone}.` : "") +
        (b.cnpj_data?.data_abertura ? ` Empresa aberta em ${new Date(b.cnpj_data.data_abertura + "T12:00:00").getFullYear()}${b.cnpj_data.situacao ? ` (situação ${b.cnpj_data.situacao.toLowerCase()})` : ""}${b.cnpj_data.porte ? `, porte ${b.cnpj_data.porte.toLowerCase()}` : ""}.` : "") +
        (b.rating != null ? ` Nota ${b.rating} no Google com ${b.user_rating_count} avaliações.` : "") +
        (b.tech_performance != null ? ` Desempenho do site no celular: ${b.tech_performance}/100 (Google).` : ""), "",
      "## Fatos verificados",
      ...(f.length ? f.map((x) => `- ${x}`) : ["- Ainda sem análise digital — execute a análise na ficha."]),
      b.opening_hours?.weekdayDescriptions ? `- Horário publicado: ${b.opening_hours.weekdayDescriptions.join("; ")}` : "", "",
      "## Oportunidades estimadas",
      `- Segmento se beneficia de ${seg.feature}.`,
      ...products.map((p) => `- ${p}`), "",
      "## Próximo passo",
      `Fazer o primeiro contato mostrando que ${gapPhrase(b)}, e propor ${products[0]?.toLowerCase() ?? seg.feature}.`,
    ].filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");
  }
  if (kind === "pitch") {
    return [
      `# Argumentos de venda — ${b.name}`, "",
      `1. **Seja encontrado:** ${seg.pain} — ${b.primary_website ? "o site precisa estar completo para converter essas visitas" : "sem site próprio, o negócio depende só de terceiros para aparecer"}.`,
      `2. **Mais contatos com menos esforço:** ${seg.benefit}.`,
      `3. **Credibilidade:** um site profissional com endereço, mapa e horário transmite confiança antes da primeira visita.`,
      `4. **Independência:** redes sociais e diretórios mudam regras; o site é um canal próprio do negócio.`,
      ...f.slice(0, 4).map((x, i) => `${5 + i}. **Fato verificado:** ${x}.`), "",
      "## Objeções comuns",
      "- *\"Já tenho Instagram\"* → O Instagram não aparece bem nas buscas do Google e não tem agendamento/cardápio organizado; o site complementa e leva clientes para o perfil.",
      "- *\"É caro\"* → Compare com o valor de um único cliente novo por mês; o investimento se paga com poucos atendimentos.",
      "- *\"Não tenho tempo\"* → Cuidamos de tudo; você só aprova o conteúdo.",
    ].join("\n");
  }
  if (kind === "approach") {
    return [
      `# Roteiro de abordagem — ${b.name}`, "",
      `**Abertura:** "Olá! Sou ${me}${company}. Trabalho ajudando negócios${b.city ? ` de ${b.city}` : ""} a atrair mais clientes pela internet."`, "",
      "**Perguntas de diagnóstico:**",
      "- Hoje, como os novos clientes encontram vocês?",
      "- Vocês recebem pedidos/agendamentos pelo WhatsApp? Como é esse controle?",
      "- Já pensaram em ter um site ou atualizar o atual?", "",
      `**Apresentação:** "Fiz uma análise rápida e vi que ${gapPhrase(b)}. Uma solução com ${seg.feature} ajudaria a ${seg.benefit}."`, "",
      `**Chamada para ação:** "Posso te mostrar um exemplo em 10 minutos, sem compromisso? Qual o melhor horário?"`, "",
      "**Follow-up:** retornar em 2 dias úteis com uma proposta resumida e um exemplo visual.",
    ].join("\n");
  }
  if (kind === "whatsapp") {
    return [
      `Olá! Tudo bem? Sou ${me}${company}. Vi ${b.name} no mapa${b.city ? ` de ${b.city}` : ""} e notei que ${gapPhrase(b)}. Trabalho criando soluções para ${seg.benefit}. Posso te mostrar uma ideia rápida, sem compromisso?`,
      "---",
      `Oi, tudo bem? Aqui é ${me}. Ajudo negócios como ${b.name} a ${seg.benefit}. Fiz uma análise rápida da presença digital de vocês e tenho algumas sugestões gratuitas. Posso enviar?`,
      "---",
      `Bom dia! Sou ${me}${company}. Estou montando ${seg.feature} para empresas${b.city ? ` de ${b.city}` : ""} e lembrei de ${b.name}. Tem interesse em ver como ficaria para vocês?`,
    ].join("\n");
  }
  return [
    `Assunto: Uma ideia para ${b.name} atrair mais clientes`, "",
    `Olá${b.name ? `, equipe ${b.name}` : ""}!`, "",
    `Meu nome é ${me}${company}. Analisei a presença digital de vocês a partir de dados públicos e percebi que ${gapPhrase(b)}.`, "",
    ...(f.length ? ["O que identifiquei:", ...f.slice(0, 4).map((x) => `• ${x}`), ""] : []),
    `Minha sugestão é ${products[0]?.toLowerCase() ?? seg.feature}, para ${seg.benefit}.`, "",
    "Posso apresentar a proposta em uma conversa rápida de 15 minutos?", "",
    "Atenciosamente,", me, contact,
  ].join("\n");
}
