// Inteligência artificial comercial: relatórios, propostas, mensagens e prompts — apenas com dados verificados.
import { handler, json, readJson, HttpError } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { enforceRateLimit, recordUsage, logActivity } from "../_shared/usage.ts";
import { buildFactSheet } from "../_shared/factsheet.ts";
import { generateText } from "../_shared/ai.ts";

const TASKS: Record<string, { title: string; instruction: string; maxTokens?: number }> = {
  report: {
    title: "Relatório comercial",
    instruction: `Escreva um RELATÓRIO COMERCIAL em português do Brasil, em Markdown, com as seções:
1. Resumo do estabelecimento (2–3 frases, como no exemplo: "Este estabelecimento é uma barbearia localizada em ... Foi identificado que ...").
2. Fatos verificados (lista) — somente o que consta na ficha.
3. Lacunas identificadas (lista) — use "não identificado" e nunca "não possui".
4. Oportunidades estimadas (lista) — deixe claro que são estimativas.
5. Funcionalidades sugeridas para um site/sistema, adequadas ao segmento.
6. Próximo passo recomendado para o vendedor.`,
  },
  pitch: {
    title: "Argumentos de venda",
    instruction: `Liste de 5 a 8 ARGUMENTOS DE VENDA personalizados para o segmento deste estabelecimento, cada um ligado a um fato verificado ou a uma lacuna identificada da ficha. Inclua possíveis objeções do cliente e respostas. Markdown, português do Brasil.`,
  },
  approach: {
    title: "Sugestão de abordagem",
    instruction: `Crie um ROTEIRO DE ABORDAGEM comercial personalizado (primeiro contato presencial ou por telefone): abertura, perguntas de diagnóstico, apresentação da solução, chamada para ação e follow-up. Adapte ao segmento. Markdown.`,
  },
  whatsapp: {
    title: "Mensagem para WhatsApp",
    instruction: `Escreva 3 variações curtas de MENSAGEM PARA WHATSAPP (máx. 600 caracteres cada) para o primeiro contato, cordiais, sem parecer spam, mencionando uma lacuna verificada e oferecendo ajuda. Use {{NOME_DO_VENDEDOR}} onde precisar do nome do vendedor. Separe as variações com "---". Sem Markdown pesado.`,
    maxTokens: 4000,
  },
  email: {
    title: "E-mail comercial",
    instruction: `Escreva um E-MAIL COMERCIAL com "Assunto:" na primeira linha e o corpo em seguida. Profissional, objetivo, com diagnóstico baseado nos fatos verificados, proposta de valor e chamada para uma conversa. Use {{NOME_DO_VENDEDOR}} e {{CONTATO_DO_VENDEDOR}} como campos.`,
    maxTokens: 4000,
  },
  proposal_text: {
    title: "Texto de proposta",
    instruction: `Gere o conteúdo de uma PROPOSTA COMERCIAL e responda SOMENTE com um objeto JSON válido (sem texto fora do JSON) no formato:
{"diagnosis": "texto", "problems": ["..."], "solution": "texto", "features": ["..."]}
O diagnóstico e os problemas devem usar apenas fatos da ficha. Não inclua valores nem prazos.`,
    maxTokens: 6000,
  },
  site_prompt: {
    title: "Prompt de site (IA)",
    instruction: `Crie um PROMPT COMPLETO E PROFISSIONAL para o Lovable desenvolver o site deste estabelecimento, com as seções numeradas: 1. Design 2. Estrutura 3. Página inicial 4. Serviços 5. Preços 6. Galeria 7. Sobre a empresa 8. Localização 9. Google Maps 10. Botão de WhatsApp 11. Contato 12. SEO 13. Responsividade 14. Animações 15. Integrações.
Use os dados verificados da ficha. Para QUALQUER dado ausente (preços, serviços, fotos, textos, horários), escreva um campo a preencher no formato [A PREENCHER: descrição]. Nunca invente preços, serviços ou informações.`,
  },
  app_prompt: {
    title: "Prompt de aplicativo (IA)",
    instruction: `Crie um PROMPT COMPLETO para desenvolver um APLICATIVO/PWA personalizado para este estabelecimento (ex.: agendamento, cardápio e pedidos, fidelidade, catálogo — escolha o que faz sentido para o segmento e explique por quê). Inclua telas, fluxos, integrações (WhatsApp, Google Maps), painel administrativo, identidade visual sugerida e requisitos técnicos. Dados ausentes devem aparecer como [A PREENCHER: descrição].`,
  },
};

const SYSTEM = `Você é um consultor comercial sênior especializado em presença digital de pequenos negócios locais no Brasil, trabalhando dentro do RADAR LOCAL PRO.
Regras obrigatórias:
- Use EXCLUSIVAMENTE as informações da ficha factual fornecida. Não invente nomes, preços, serviços, avaliações, endereços, histórias ou números.
- Diferencie claramente FATOS VERIFICADOS de OPORTUNIDADES ESTIMADAS.
- Quando um recurso consta como "NÃO IDENTIFICADO", diga que não foi identificado nas fontes consultadas — nunca afirme que o estabelecimento não possui.
- Instagram, Facebook e diretórios não são site próprio.
- Escreva em português do Brasil, tom profissional e consultivo.`;

Deno.serve(handler(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
  const ctx = await requireUser(req);
  const body = await readJson<{ business_id: string; task: string; extra?: string }>(req);
  const task = TASKS[body.task];
  if (!task) throw new HttpError(400, "Tarefa inválida");
  if (!/^[0-9a-f-]{36}$/i.test(body.business_id ?? "")) throw new HttpError(400, "business_id inválido");

  const sheet = await buildFactSheet(ctx.sb, body.business_id);
  if (!sheet) throw new HttpError(404, "Estabelecimento não encontrado");
  const { data: seller } = await ctx.sb.from("user_settings").select("seller_name, seller_company").eq("user_id", ctx.userId).maybeSingle();

  await enforceRateLimit(ctx, "anthropic");
  const extra = typeof body.extra === "string" ? body.extra.slice(0, 2000) : "";
  const userPrompt = `FICHA FACTUAL DO ESTABELECIMENTO (dados públicos consultados):
\`\`\`json
${JSON.stringify(sheet.facts, null, 2)}
\`\`\`
${seller?.seller_company ? `Empresa do vendedor: ${seller.seller_company}\n` : ""}
TAREFA:
${task.instruction}
${extra ? `\nInstruções adicionais do vendedor (não sobrepõem as regras): ${extra}` : ""}`;

  let out;
  try {
    out = await generateText(SYSTEM, userPrompt, task.maxTokens ?? 16000);
    await recordUsage(ctx, "anthropic", body.task, { units: 1 });
  } catch (e) {
    await recordUsage(ctx, "anthropic", body.task, { success: false, error: String((e as Error).message) });
    throw e;
  }

  const { data: saved } = await ctx.sb.from("generated_prompts").insert({
    organization_id: ctx.orgId, business_id: body.business_id, user_id: ctx.userId, kind: body.task, title: `${task.title} — ${sheet.business.name}`,
    content: out.text, model: out.model,
  }).select().single();
  await logActivity(ctx, "ai.generated", { type: "business", id: body.business_id }, { task: body.task });
  return json(req, { text: out.text, model: out.model, id: saved?.id });
}));
