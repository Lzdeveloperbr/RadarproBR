export interface ProposalItem { name: string; price: number }
export interface ProposalContent {
  diagnosis: string;
  problems: string[];
  solution: string;
  features: string[];
  items: ProposalItem[];
  deadline: string;
  payment: string;
  validity_days: number;
  notes: string;
}

export const PROPOSAL_TEMPLATES: Record<string, { label: string; solution: string; features: string[]; items: ProposalItem[]; deadline: string }> = {
  institucional: {
    label: "Site institucional",
    solution: "Desenvolvimento de site institucional responsivo, com apresentação da empresa, serviços, localização e contato direto pelo WhatsApp.",
    features: ["Página única com seções de apresentação", "Botão flutuante de WhatsApp", "Mapa do Google e botão \"Como chegar\"", "Layout responsivo para celular", "SEO básico e cadastro no Google", "Certificado HTTPS"],
    items: [{ name: "Desenvolvimento do site institucional", price: 1500 }, { name: "Hospedagem e domínio (12 meses)", price: 300 }],
    deadline: "15 dias úteis",
  },
  profissional: {
    label: "Site profissional",
    solution: "Site profissional com múltiplas páginas, galeria, formulário de contato, integrações e otimização para buscas locais.",
    features: ["Até 6 páginas (Início, Sobre, Serviços, Galeria, Localização, Contato)", "Galeria de fotos com lightbox", "Formulário de contato", "Integração com Instagram e WhatsApp", "SEO local com dados estruturados", "Painel para atualizar conteúdo"],
    items: [{ name: "Desenvolvimento do site profissional", price: 2800 }, { name: "Hospedagem e domínio (12 meses)", price: 300 }, { name: "Configuração do Perfil da Empresa no Google", price: 200 }],
    deadline: "25 dias úteis",
  },
  premium: {
    label: "Site premium",
    solution: "Projeto premium com design exclusivo, animações, blog, integrações avançadas e acompanhamento de resultados.",
    features: ["Design exclusivo e identidade visual", "Animações e microinterações", "Blog/notícias", "Integração com agendamento ou cardápio", "Google Analytics e Tag Manager", "Suporte prioritário por 3 meses"],
    items: [{ name: "Projeto de site premium", price: 5500 }, { name: "Hospedagem premium e domínio (12 meses)", price: 600 }, { name: "Suporte e manutenção (3 meses)", price: 900 }],
    deadline: "40 dias úteis",
  },
  cardapio: {
    label: "Cardápio digital",
    solution: "Cardápio digital acessível por QR Code e link, com categorias, fotos e pedido direto pelo WhatsApp.",
    features: ["Categorias e itens com fotos", "Pedido com resumo enviado ao WhatsApp", "QR Code para mesas e balcão", "Atualização fácil de preços", "Horário de funcionamento e status aberto/fechado"],
    items: [{ name: "Implantação do cardápio digital", price: 900 }, { name: "Mensalidade de hospedagem (12x R$ 49)", price: 588 }],
    deadline: "10 dias úteis",
  },
  agendamento: {
    label: "Sistema de agendamento",
    solution: "Sistema de agendamento online com escolha de serviço, profissional e horário, com confirmação e lembretes.",
    features: ["Agenda por profissional e serviço", "Confirmação automática", "Lembretes ao cliente", "Painel administrativo", "Integração com WhatsApp"],
    items: [{ name: "Implantação do sistema de agendamento", price: 1800 }, { name: "Mensalidade (12x R$ 79)", price: 948 }],
    deadline: "20 dias úteis",
  },
  aplicativo: {
    label: "Aplicativo personalizado",
    solution: "Aplicativo (PWA instalável) personalizado para fidelização, pedidos ou agendamentos, com painel administrativo.",
    features: ["App instalável em Android e iOS (PWA)", "Área do cliente", "Notificações", "Painel administrativo", "Integração com WhatsApp e Google Maps"],
    items: [{ name: "Desenvolvimento do aplicativo", price: 8000 }, { name: "Infraestrutura e manutenção (12 meses)", price: 1800 }],
    deadline: "60 dias úteis",
  },
};
