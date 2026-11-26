// Integração com a API da Anthropic (Claude) — chave mantida apenas no backend.
import Anthropic from "npm:@anthropic-ai/sdk";
import { env, HttpError } from "./http.ts";

export const AI_MODEL = env("ANTHROPIC_MODEL") ?? "claude-opus-5-5";

export function aiConfigured() {
  return !!env("ANTHROPIC_API_KEY");
}

export async function generateText(system: string, user: string, maxTokens = 16000): Promise<{ text: string; model: string; usage: unknown }> {
  if (!aiConfigured()) {
    throw new HttpError(412, "Integração de IA não configurada. Defina o segredo ANTHROPIC_API_KEY nas Edge Functions (veja a página Integrações).", "missing_ai_key");
  }
  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  try {
    // Streaming evita timeouts em respostas longas; fallbacks "default" reencaminha recusas automaticamente.
    const stream = client.beta.messages.stream({
      model: AI_MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system,
      messages: [{ role: "user", content: user }],
    } as any);
    const msg: any = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new HttpError(422, "A IA recusou esta solicitação. Ajuste o pedido e tente novamente.", "ai_refusal");
    const text = (msg.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    if (!text) throw new HttpError(502, "A IA não retornou conteúdo");
    return { text, model: msg.model ?? AI_MODEL, usage: msg.usage };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(502, "Chave da Anthropic inválida (erro de autenticação)", "ai_auth");
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "Limite de uso da API de IA atingido. Tente novamente em instantes.", "ai_rate_limit");
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `Erro na API de IA (${e.status}): ${e.message}`, "ai_error");
    throw e;
  }
}
