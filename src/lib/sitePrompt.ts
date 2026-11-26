// Gerador determinístico de prompt para o Lovable a partir dos dados VERIFICADOS.
// Dados ausentes viram campos "[A PREENCHER: ...]" — nunca inventamos preços, serviços ou informações.
import type { Business } from "./types";

export interface PromptData {
  business: Business;
  whatsapp?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  email?: string | null;
  reasons?: string[];
  products?: string[];
}

const P = (desc: string) => `[A PREENCHER: ${desc}]`;

const SEGMENT_STYLE: [RegExp, { palette: string; mood: string; features: string[] }][] = [
  [/barbearia/i, { palette: "preto, grafite e dourado envelhecido", mood: "masculino, urbano e premium", features: ["Agendamento de horário por serviço e profissional", "Lista de serviços (corte, barba, combos)", "Equipe de barbeiros"] }],
  [/sal[aã]o|est[eé]tica|beleza/i, { palette: "nude, rosé e off-white com detalhes dourados", mood: "elegante, acolhedor e feminino", features: ["Agendamento online por serviço", "Tabela de serviços", "Galeria antes/depois"] }],
  [/restaurante|pizzaria|lanchonete|hamburgueria|padaria|a[cç]ougue/i, { palette: "tons quentes (vermelho tijolo, mostarda, creme)", mood: "apetitoso, convidativo e moderno", features: ["Cardápio digital com categorias e fotos", "Pedido pelo WhatsApp com resumo do pedido", "Horário de funcionamento destacado"] }],
  [/cl[ií]nica|odonto|m[eé]dic|veterin/i, { palette: "branco, azul-petróleo e verde-água", mood: "confiável, limpo e profissional", features: ["Agendamento de consultas", "Especialidades e corpo clínico", "Convênios atendidos"] }],
  [/academia/i, { palette: "preto com verde-neon ou laranja energético", mood: "enérgico e motivador", features: ["Planos e modalidades", "Grade de horários das aulas", "Aula experimental pelo WhatsApp"] }],
  [/oficina|auto|lava|borracharia|concession/i, { palette: "grafite, preto e laranja/amarelo industrial", mood: "robusto, técnico e confiável", features: ["Lista de serviços automotivos", "Orçamento pelo WhatsApp", "Agendamento de revisão"] }],
  [/hotel|pousada/i, { palette: "tons terrosos e naturais", mood: "acolhedor e relaxante", features: ["Galeria de acomodações", "Reserva/consulta de disponibilidade", "Comodidades e localização"] }],
  [/advoga|contabil|imobili/i, { palette: "azul-marinho, cinza e dourado discreto", mood: "sóbrio, sério e confiável", features: ["Áreas de atuação", "Formulário de contato qualificado", "Equipe e credenciais"] }],
];

function styleFor(b: Business) {
  const s = `${b.category ?? ""} ${b.primary_type_label ?? ""}`;
  return SEGMENT_STYLE.find(([re]) => re.test(s))?.[1] ?? { palette: "paleta sóbria a definir com o cliente", mood: "moderno e profissional", features: ["Apresentação dos serviços/produtos", "Contato rápido pelo WhatsApp"] };
}

export function buildLovablePrompt(d: PromptData, kind: "site" | "app" = "site"): string {
  const b = d.business;
  const st = styleFor(b);
  const hours = b.opening_hours?.weekdayDescriptions?.length ? b.opening_hours.weekdayDescriptions.map((h) => `   - ${h}`).join("\n") : `   ${P("horário de funcionamento")}`;
  const address = b.formatted_address ?? P("endereço completo");
  const phone = b.phone ?? P("telefone");
  const wa = d.whatsapp ?? (b.phone ? `${b.phone} ${P("confirmar se este número é WhatsApp")}` : P("número de WhatsApp"));
  const mapsLink = b.google_maps_uri ?? P("link do Google Maps");
  const coords = b.lat != null ? `${b.lat}, ${b.lng}` : P("coordenadas");
  const name = b.name;

  if (kind === "app") {
    return `Crie um aplicativo web progressivo (PWA) personalizado para "${name}" (${b.category ?? "negócio local"}), em ${b.city ?? P("cidade")}/${b.state ?? P("UF")}.

DADOS VERIFICADOS DO ESTABELECIMENTO
- Nome: ${name}
- Endereço: ${address}
- Telefone: ${phone}
- WhatsApp: ${wa}
- Instagram: ${d.instagram ?? P("Instagram")}
- Google Maps: ${mapsLink}
- Horários:
${hours}

OBJETIVO DO APLICATIVO
${st.features.map((f) => `- ${f}`).join("\n")}
- Área do cliente com histórico ${P("definir: agendamentos, pedidos ou pontos de fidelidade")}
- Notificações de lembrete ${P("confirmar canal: push/WhatsApp")}

TELAS
1. Splash e onboarding com a identidade da marca.
2. Início: destaques, botão principal de ação (agendar/pedir) e atalho para WhatsApp.
3. Catálogo de serviços/produtos — itens e preços: ${P("lista de serviços/produtos e preços fornecidos pelo cliente")}.
4. Fluxo principal (agendamento ou pedido) com confirmação e envio do resumo para o WhatsApp ${wa}.
5. Localização com mapa (Google Maps, coordenadas ${coords}) e botão "Como chegar".
6. Perfil do cliente e histórico.
7. Painel administrativo: gerenciar serviços, horários, pedidos/agendamentos e clientes.

IDENTIDADE VISUAL
- Estilo ${st.mood}; paleta sugerida: ${st.palette}. Logo: ${P("arquivo do logotipo")}.

REQUISITOS TÉCNICOS
- React + TypeScript + Tailwind, PWA instalável (manifest, service worker, ícones), responsivo e acessível.
- Backend com Supabase (autenticação, banco, RLS) para clientes, serviços e agendamentos/pedidos.
- Integrações: link direto wa.me, Google Maps, ${P("gateway de pagamento, se desejado")}.
- Não use dados fictícios: onde faltar informação, exiba um aviso para o administrador preencher.`;
  }

  return `Crie um site profissional, moderno e responsivo para "${name}", ${b.category?.toLowerCase().replace(/s$/, "") ?? "negócio local"} localizado em ${b.neighborhood ? b.neighborhood + ", " : ""}${b.city ?? P("cidade")}/${b.state ?? P("UF")}.
Use SOMENTE as informações abaixo. Onde houver [A PREENCHER], crie o campo/placeholder visível para o cliente completar — não invente conteúdo.

1. DESIGN
- Estilo ${st.mood}; paleta sugerida: ${st.palette} (validar com o cliente).
- Tipografia moderna e legível, ícones Lucide, bastante espaço em branco, cantos arredondados e sombras suaves.
- Logotipo: ${P("arquivo do logotipo em alta resolução")}.

2. ESTRUTURA
- Página única (one-page) com menu fixo e âncoras: Início, Serviços, Preços, Galeria, Sobre, Localização, Contato.
- Rodapé com endereço, telefone, redes sociais e horário.

3. PÁGINA INICIAL (HERO)
- Título: "${name}". Subtítulo: ${P("frase de apresentação/diferencial do negócio")}.
- Imagem de fundo: ${P("foto real da fachada ou do ambiente")}.
- Botões: "Fale pelo WhatsApp" e "${/restaurante|pizzaria|lanchonete|hamburgueria/i.test(b.category ?? "") ? "Ver cardápio" : "Agendar horário"}".
${b.rating != null ? `- Selo de prova social: nota ${b.rating} no Google com ${b.user_rating_count} avaliações (dado verificado).` : ""}

4. SERVIÇOS
- Cards para cada serviço: ${P("lista de serviços com descrição curta")}.
- Destaques sugeridos para o segmento (confirmar com o cliente): ${st.features.join("; ")}.

5. PREÇOS
- Tabela de preços: ${P("preços verificados fornecidos pelo cliente")}. Não exibir valores até que sejam confirmados.

6. GALERIA
- Grade responsiva com lightbox: ${P("fotos reais do estabelecimento, produtos e serviços")}.

7. SOBRE A EMPRESA
- Texto institucional: ${P("história, tempo de mercado, equipe e diferenciais")}.

8. LOCALIZAÇÃO
- Endereço: ${address}${b.postal_code ? ` — CEP ${b.postal_code}` : ""}.
- Horário de funcionamento:
${hours}

9. GOOGLE MAPS
- Mapa incorporado (iframe do Google Maps) centralizado em ${coords}.
- Botão "Como chegar" abrindo: ${b.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}` : mapsLink}
- Link do perfil no Google: ${mapsLink}

10. BOTÃO DE WHATSAPP
- Botão flutuante fixo no canto inferior direito, abrindo https://wa.me/ com o número ${wa} e mensagem pré-preenchida: "Olá! Vim pelo site e gostaria de mais informações."

11. CONTATO
- Telefone clicável: ${phone}.
- E-mail: ${d.email ?? P("e-mail de contato")}.
- Formulário de contato (nome, telefone, mensagem) com validação, enviando para ${P("e-mail ou integração de destino")}.
- Redes sociais: Instagram ${d.instagram ?? P("Instagram")}${d.facebook ? `, Facebook ${d.facebook}` : ""}.

12. SEO
- Title: "${name} | ${b.category ?? P("segmento")} em ${b.city ?? P("cidade")}".
- Meta description com serviço principal + cidade; Open Graph com imagem da fachada.
- Dados estruturados schema.org LocalBusiness com nome, endereço, telefone, geo (${coords}), horário e sameAs das redes sociais.
- URLs amigáveis, sitemap.xml, robots.txt, textos alternativos nas imagens.

13. RESPONSIVIDADE
- Mobile-first, meta viewport, botões grandes para toque, menu hambúrguer no celular, sem rolagem horizontal.

14. ANIMAÇÕES
- Transições suaves ao rolar (fade/slide), hover nos cards, microinterações discretas; respeitar prefers-reduced-motion.

15. INTEGRAÇÕES
- WhatsApp (wa.me), Google Maps (iframe + rota), Instagram (link/feed ${P("autorização para exibir feed")}).
${/barbearia|sal[aã]o|cl[ií]nica|academia|est[eé]tica/i.test(b.category ?? "") ? `- Sistema de agendamento: ${P("definir ferramenta ou agendamento nativo com horários disponíveis")}.\n` : ""}${/restaurante|pizzaria|lanchonete|hamburgueria|padaria/i.test(b.category ?? "") ? `- Cardápio digital com pedido pelo WhatsApp: ${P("itens do cardápio com preços")}.\n` : ""}- Google Analytics/Tag Manager: ${P("ID de medição")}.
${d.reasons?.length ? `\nDIAGNÓSTICO (fatos verificados que motivam o projeto)\n${d.reasons.map((r) => `- ${r}`).join("\n")}` : ""}`;
}
