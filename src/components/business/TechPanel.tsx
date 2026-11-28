import { useState } from "react";
import { toast } from "sonner";
import { Gauge, ExternalLink, RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardHeader, ScoreRing } from "../ui";
import type { Audit } from "../../lib/types";
import { auditBusiness } from "../../lib/services";
import { fmtDateTime } from "../../lib/format";

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <ScoreRing score={value} size={64} />
      <span className="text-[11px] text-ink-400 text-center">{label}</span>
    </div>
  );
}

/** Auditoria técnica do site pelo Google Lighthouse (PageSpeed Insights, gratuito). */
export function TechPanel({ businessId, url, audit, onDone }: { businessId: string; url: string; audit: Audit | undefined; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const t = audit?.tech ?? null;
  const run = async () => {
    setRunning(true);
    try {
      const r = await auditBusiness(businessId);
      r.audit.tech ? toast.success(`Auditoria técnica concluída · desempenho ${r.audit.tech.performance ?? "—"}`) : toast.error(r.audit.tech_error ?? "Auditoria técnica indisponível");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setRunning(false); }
  };
  return (
    <Card>
      <CardHeader title="Auditoria técnica do site" icon={Gauge}
        subtitle={t ? `Google Lighthouse (celular) · ${fmtDateTime(t.fetched_at)}` : audit?.tech_error ? `Indisponível: ${audit.tech_error}` : "Velocidade, SEO, acessibilidade e versão para celular, medidos pelo Google"}
        action={<Button size="sm" variant="secondary" icon={RefreshCw} loading={running} onClick={run}>{t ? "Refazer" : "Auditar agora"}</Button>} />
      {running && <p className="px-5 pb-4 text-xs text-ink-400">O Google está abrindo o site como um celular — leva de 15 a 60 segundos…</p>}
      {t && (
        <div className="px-5 pb-5 grid gap-5 md:grid-cols-[1fr_200px]">
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              <Metric label="Desempenho" value={t.performance} />
              <Metric label="SEO" value={t.seo} />
              <Metric label="Acessibilidade" value={t.accessibility} />
              <Metric label="Boas práticas" value={t.best_practices} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/[0.03] p-2.5"><div className="text-ink-400">Carregamento do conteúdo (LCP)</div><div className="text-white font-medium">{t.lcp_text ?? "—"}</div></div>
              <div className="rounded-lg bg-white/[0.03] p-2.5"><div className="text-ink-400">Primeira exibição (FCP)</div><div className="text-white font-medium">{t.fcp_text ?? "—"}</div></div>
              <div className="rounded-lg bg-white/[0.03] p-2.5"><div className="text-ink-400">Adaptado para celular</div><div className="text-white font-medium">{t.viewport_ok == null ? "—" : t.viewport_ok ? "Sim" : "Não"}</div></div>
              <div className="rounded-lg bg-white/[0.03] p-2.5"><div className="text-ink-400">HTTPS</div><div className="text-white font-medium">{t.https_ok == null ? "—" : t.https_ok ? "Sim" : "Não"}</div></div>
            </div>
            {t.third_parties.length > 0 && (
              <div>
                <div className="label">Serviços detectados na página</div>
                <div className="flex flex-wrap gap-1.5">{t.third_parties.map((x) => <Badge key={x}>{x}</Badge>)}</div>
              </div>
            )}
            <a href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=mobile`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-lime-400 hover:underline">Ver relatório completo no PageSpeed <ExternalLink className="size-3" /></a>
          </div>
          {t.screenshot && (
            <div className="mx-auto w-[180px] rounded-[22px] border-4 border-ink-700 bg-ink-950 p-1 shadow-xl">
              <img src={t.screenshot} alt="Como o site aparece no celular" className="w-full rounded-[16px]" />
              <div className="text-center text-[10px] text-ink-500 py-1">Como o site aparece no celular</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
