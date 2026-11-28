// Auditoria técnica gratuita do site via Google PageSpeed Insights (Lighthouse).
// API pública com CORS; funciona sem chave (cota compartilhada) ou com uma chave gratuita (sem faturamento).
import { SourceError } from "./osm";

export interface TechAudit {
  url: string;
  final_url: string | null;
  strategy: "mobile";
  performance: number | null;   // 0–100
  seo: number | null;
  accessibility: number | null;
  best_practices: number | null;
  lcp_ms: number | null;
  lcp_text: string | null;
  fcp_text: string | null;
  cls: number | null;
  viewport_ok: boolean | null;
  https_ok: boolean | null;
  title_ok: boolean | null;
  meta_description_ok: boolean | null;
  third_parties: string[];
  screenshot: string | null;     // data:image/jpeg;base64,...
  field_category: string | null; // dados reais de usuários (CrUX), quando houver
  fetched_at: string;
}

const score = (c: any) => (typeof c?.score === "number" ? Math.round(c.score * 100) : null);
const pass = (a: any) => (a == null || a.score == null ? null : a.score >= 0.9);

export function parsePageSpeed(url: string, data: any): TechAudit {
  const lr = data?.lighthouseResult ?? {};
  const cats = lr.categories ?? {};
  const au = lr.audits ?? {};
  const tp = (au["third-party-summary"]?.details?.items ?? [])
    .map((i: any) => (typeof i.entity === "string" ? i.entity : i.entity?.text))
    .filter(Boolean);
  const finalUrl = lr.finalDisplayedUrl ?? lr.finalUrl ?? null;
  return {
    url,
    final_url: finalUrl,
    strategy: "mobile",
    performance: score(cats.performance),
    seo: score(cats.seo),
    accessibility: score(cats.accessibility),
    best_practices: score(cats["best-practices"]),
    lcp_ms: typeof au["largest-contentful-paint"]?.numericValue === "number" ? Math.round(au["largest-contentful-paint"].numericValue) : null,
    lcp_text: au["largest-contentful-paint"]?.displayValue ?? null,
    fcp_text: au["first-contentful-paint"]?.displayValue ?? null,
    cls: typeof au["cumulative-layout-shift"]?.numericValue === "number" ? Math.round(au["cumulative-layout-shift"].numericValue * 1000) / 1000 : null,
    viewport_ok: pass(au.viewport),
    https_ok: au["is-on-https"] ? pass(au["is-on-https"]) : finalUrl ? finalUrl.startsWith("https://") : null,
    title_ok: pass(au["document-title"]),
    meta_description_ok: pass(au["meta-description"]),
    third_parties: [...new Set<string>(tp)].slice(0, 20),
    screenshot: typeof au["final-screenshot"]?.details?.data === "string" ? au["final-screenshot"].details.data : null,
    field_category: data?.loadingExperience?.overall_category ?? null,
    fetched_at: new Date().toISOString(),
  };
}

export async function runPageSpeed(url: string, key?: string | null): Promise<TechAudit> {
  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", url);
  api.searchParams.set("strategy", "mobile");
  api.searchParams.set("locale", "pt_BR");
  for (const c of ["PERFORMANCE", "SEO", "ACCESSIBILITY", "BEST_PRACTICES"]) api.searchParams.append("category", c);
  if (key) api.searchParams.set("key", key);
  let res: Response;
  try {
    res = await fetch(api, { signal: AbortSignal.timeout(90_000) });
  } catch (e) {
    throw new SourceError(503, "PageSpeed Insights não respondeu: " + ((e as Error).name === "TimeoutError" ? "tempo limite" : (e as Error).message));
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) throw new SourceError(429, "Limite gratuito do PageSpeed Insights atingido. Tente mais tarde ou adicione uma chave gratuita em Configurações.");
  if (!res.ok) {
    const msg = data?.error?.message ?? `HTTP ${res.status}`;
    throw new SourceError(res.status, /FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|DNS|NO_FCP/i.test(msg) ? "O Google não conseguiu abrir o site (fora do ar ou bloqueado)." : "PageSpeed Insights: " + msg.slice(0, 200));
  }
  if (!data?.lighthouseResult?.categories) throw new SourceError(502, "PageSpeed Insights devolveu uma resposta sem resultado. Tente novamente.");
  return parsePageSpeed(url, data);
}

/** Itens da auditoria técnica traduzidos em fatos para a pontuação e as propostas. */
export function techFindings(t: TechAudit): { text: string; weight: number; product?: string }[] {
  const out: { text: string; weight: number; product?: string }[] = [];
  if (t.performance != null && t.performance < 50) out.push({ text: `Site lento no celular: nota de desempenho ${t.performance}/100 no Google${t.lcp_text ? ` (conteúdo principal em ${t.lcp_text})` : ""}`, weight: 12, product: "Otimização de velocidade" });
  else if (t.performance != null && t.performance < 75) out.push({ text: `Desempenho no celular pode melhorar: nota ${t.performance}/100 no Google`, weight: 5, product: "Otimização de velocidade" });
  if (t.viewport_ok === false) out.push({ text: "O Google indica que o site não está adaptado para celular (sem viewport)", weight: 12, product: "Site responsivo (mobile-first)" });
  if (t.seo != null && t.seo < 80) out.push({ text: `SEO técnico fraco: nota ${t.seo}/100 no Google${t.meta_description_ok === false ? " (sem meta descrição)" : ""}`, weight: 6, product: "SEO local" });
  if (t.accessibility != null && t.accessibility < 70) out.push({ text: `Acessibilidade baixa: nota ${t.accessibility}/100`, weight: 3 });
  return out;
}
