export const CATEGORIES = [
  "Barbearias", "Salões de beleza", "Restaurantes", "Pizzarias", "Lanchonetes", "Hamburguerias", "Padarias", "Açougues",
  "Mercados", "Supermercados", "Oficinas mecânicas", "Autoelétricas", "Lava-rápidos", "Borracharias", "Lojas de roupas",
  "Lojas de calçados", "Lojas de materiais de construção", "Clínicas médicas", "Clínicas odontológicas", "Clínicas veterinárias",
  "Pet shops", "Farmácias", "Academias", "Hotéis", "Pousadas", "Imobiliárias", "Escritórios de contabilidade", "Advogados",
  "Escolas", "Cursos profissionalizantes", "Concessionárias", "Assistências técnicas", "Empresas agrícolas",
  "Prestadores de serviços", "Outros",
] as const;

export const UFS = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
  ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"], ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
  ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"],
] as const;

export type DigitalStatus = "has_site" | "no_site" | "site_issues" | "site_pending" | "unknown";
export const DIGITAL_STATUS: Record<DigitalStatus, { label: string; color: string; hex: string; desc: string }> = {
  has_site: { label: "Possui site", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", hex: "#34d399", desc: "Site próprio online e analisado" },
  no_site: { label: "Site não identificado", color: "text-rose-400 bg-rose-400/10 border-rose-400/30", hex: "#fb7185", desc: "Nenhum site próprio identificado nas fontes consultadas" },
  site_issues: { label: "Site com problemas", color: "text-amber-300 bg-amber-300/10 border-amber-300/30", hex: "#fcd34d", desc: "Fora do ar, sem HTTPS ou sem versão para celular" },
  site_pending: { label: "Análise incompleta", color: "text-sky-400 bg-sky-400/10 border-sky-400/30", hex: "#38bdf8", desc: "Site identificado, análise incompleta" },
  unknown: { label: "Dados insuficientes", color: "text-ink-300 bg-white/5 border-white/10", hex: "#8a93a6", desc: "Ainda não investigado" },
};

export type OpportunityLevel = "alta" | "media" | "baixa";
export const OPPORTUNITY: Record<OpportunityLevel, { label: string; color: string; hex: string }> = {
  alta: { label: "Oportunidade alta", color: "text-lime-400 bg-lime-400/10 border-lime-400/40", hex: "#c6f432" },
  media: { label: "Oportunidade média", color: "text-amber-300 bg-amber-300/10 border-amber-300/30", hex: "#fcd34d" },
  baixa: { label: "Oportunidade baixa", color: "text-ink-300 bg-white/5 border-white/10", hex: "#8a93a6" },
};

export type LeadStatus = "novo" | "nao_analisado" | "analisado" | "oportunidade" | "primeiro_contato" | "aguardando" | "proposta_enviada" | "negociacao" | "fechado" | "perdido";
export const LEAD_STATUS: { key: LeadStatus; label: string; hex: string }[] = [
  { key: "novo", label: "Novo lead", hex: "#94a3b8" },
  { key: "nao_analisado", label: "Não analisado", hex: "#64748b" },
  { key: "analisado", label: "Analisado", hex: "#38bdf8" },
  { key: "oportunidade", label: "Oportunidade identificada", hex: "#c6f432" },
  { key: "primeiro_contato", label: "Primeiro contato realizado", hex: "#a78bfa" },
  { key: "aguardando", label: "Aguardando resposta", hex: "#f472b6" },
  { key: "proposta_enviada", label: "Proposta enviada", hex: "#fbbf24" },
  { key: "negociacao", label: "Negociação", hex: "#fb923c" },
  { key: "fechado", label: "Cliente fechado", hex: "#34d399" },
  { key: "perdido", label: "Cliente perdido", hex: "#fb7185" },
];
export const leadStatusLabel = (s: string) => LEAD_STATUS.find((x) => x.key === s)?.label ?? s;

export const CHECK_LABELS: Record<string, string> = {
  own_site: "Possui site próprio",
  site_online: "Site respondendo",
  https: "Utiliza HTTPS",
  mobile_viewport: "Preparado para celular",
  address: "Endereço físico publicado",
  postal_code: "CEP publicado",
  embedded_map: "Mapa incorporado",
  maps_link: "Link para Google Maps",
  directions_button: "Botão \"como chegar\"",
  coordinates: "Coordenadas no site",
  phone: "Telefone no site",
  whatsapp: "WhatsApp no site",
  email: "E-mail no site",
  contact_form: "Formulário de contato",
  digital_menu: "Cardápio digital",
  online_booking: "Sistema de agendamento",
  services: "Apresentação dos serviços",
  gallery: "Galeria de fotos",
  social_links: "Links para redes sociais",
  opening_hours: "Horário de funcionamento no site",
  shared_domain: "Domínio compartilhado (duplicado)",
  name_match: "Nome confere com a página",
  phone_match: "Telefone confere com a página",
  phone_places: "Telefone público no cadastro",
  whatsapp_places: "WhatsApp informado no cadastro",
  hours_places: "Horário publicado no cadastro",
  whatsapp_text_only: "WhatsApp citado sem link",
};

export const KIND_LABEL: Record<string, string> = {
  own_site: "Site próprio",
  social: "Rede social",
  directory: "Perfil em diretório",
  marketplace: "Página de marketplace",
  unknown: "Site não identificado",
};

export const DIGITAL_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "no_site", label: "Sem site identificado" },
  { key: "with_site", label: "Com site" },
  { key: "issues", label: "Sites com problemas" },
  { key: "high", label: "Somente oportunidade alta" },
] as const;
